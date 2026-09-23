// Ops session for the arbiter and the contract admin.
//
// These two do NOT sign in through Particle. They are institutional keys, and
// docs/03_PARTICLE_INTEGRATION.md §2 is explicit about why: signature checks
// stay on plain ecrecover, and an institution needs a key it is accountable for
// rather than a wallet recoverable by email.
//
// SECURITY POSTURE — read before extending this.
//
// The key is held in a module variable for the life of the tab. It is never
// written to localStorage or sessionStorage, never put in a URL, and never sent
// to the backend. A reload wipes it, which is deliberate: the operator
// re-enters it, and nothing survives on the machine.
//
// That is still a private key typed into a web page. It is acceptable for a
// testnet ops console operated by the team that owns the key. It is NOT a
// pattern to carry to mainnet — there, this belongs behind a hardware wallet or
// a server-side signer with its own access control. Treat any key used here as
// exposed.
import { createWalletClient, http, isHex, getAddress } from "viem";
import { polygonAmoy } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "./smartAccount.js";
import { ESCROW_ADDRESS } from "./sternContract.js";

const RPC_URL = import.meta.env.VITE_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";

// Memory only. Not exported, so nothing else can read the key back out.
let session = null;

const ROLE_ABI = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  }
];

function normaliseKey(raw) {
  const trimmed = String(raw || "").trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!isHex(withPrefix) || withPrefix.length !== 66) {
    throw new Error("That is not a private key. Expected 64 hex characters, with or without the 0x prefix.");
  }
  return withPrefix;
}

/**
 * Opens an ops session from a private key.
 *
 * Deriving the address is local and instant. Whether that address may actually
 * do anything is then asked of the CONTRACT — the UI does not decide it. An
 * address with no admin role and no arbiter appointment gets a read-only
 * session rather than a refusal, because it may still be the arbiter on an
 * escrow created later.
 */
export async function openOpsSession(rawKey) {
  const key = normaliseKey(rawKey);
  const account = privateKeyToAccount(key);

  const walletClient = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(RPC_URL)
  });

  let isAdmin = false;
  let adminCheckFailed = null;

  if (ESCROW_ADDRESS) {
    try {
      const adminRole = await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ROLE_ABI,
        functionName: "DEFAULT_ADMIN_ROLE"
      });
      isAdmin = await publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: ROLE_ABI,
        functionName: "hasRole",
        args: [adminRole, account.address]
      });
    } catch (err) {
      // A blocked RPC must not be reported as "you are not an admin" — those
      // are very different, and confusing them would send the operator hunting
      // for a permissions problem that does not exist.
      //
      // shortMessage first: viem's full `message` carries the raw call args, the
      // ABI, a docs link and a version string, which rendered as a wall of text
      // across the top of the console and buried the one sentence that mattered.
      adminCheckFailed =
        err?.shortMessage || err?.details || "Could not reach the contract to check roles.";
    }
  }

  session = {
    address: getAddress(account.address),
    account,
    walletClient,
    isAdmin,
    adminCheckFailed,
    openedAt: new Date().toISOString()
  };

  return publicSession();
}

/** The session without the key or the signer. Safe to put in React state. */
function publicSession() {
  if (!session) return null;
  return {
    address: session.address,
    isAdmin: session.isAdmin,
    adminCheckFailed: session.adminCheckFailed,
    openedAt: session.openedAt
  };
}

export const getOpsSession = () => publicSession();

/** The signer, for the few places that actually send a transaction. */
export const getOpsWalletClient = () => session?.walletClient || null;

export function closeOpsSession() {
  session = null;
}

const RESOLVE_ABI = [
  {
    type: "function",
    name: "resolveDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      { name: "releaseToExporter", type: "bool" },
      { name: "reasoningCid", type: "string" },
      { name: "slashVerifier", type: "bool" },
      { name: "bondFrivolous", type: "bool" }
    ],
    outputs: []
  }
];

/**
 * The arbiter's decision, signed here with the arbiter's own key.
 *
 * This console existed to hold that key and then did nothing with it — it read
 * the state and deferred the actual resolution to a backend service behind
 * INTERNAL_API_KEY. So an arbiter could sign in, see the escrows awaiting a
 * decision, and have no way to decide.
 *
 * Signing here is also the more correct arrangement, not merely the more
 * convenient one. The contract requires `msg.sender == escrow.arbiter`; routing
 * it through the gateway means the gateway holds a key that can settle disputes,
 * which is exactly the kind of authority this design keeps out of servers.
 *
 * The contract's own rule — a frivolous bond cannot also slash a verifier — is
 * checked before sending, so a contradictory decision is refused here rather
 * than costing gas on a revert.
 */
export async function resolveDisputeAsArbiter(escrowId, decision) {
  if (!session?.walletClient) {
    throw new Error("The ops session is closed. Enter the arbiter key again.");
  }
  if (!ESCROW_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set, so there is no contract to call.");
  }

  const reasoningCid = String(decision.reasoningCid || "").trim();
  if (!reasoningCid) {
    throw new Error("A reasoning CID is required — the contract refuses a decision without one.");
  }
  if (decision.bondFrivolous && decision.slashVerifier) {
    throw new Error(
      "A dispute cannot be both frivolous and the verifier's fault. Choose one: either the " +
        "challenger was wrong, or the verifier was."
    );
  }

  const hash = await session.walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: RESOLVE_ABI,
    functionName: "resolveDispute",
    args: [
      BigInt(escrowId),
      Boolean(decision.releaseToExporter),
      reasoningCid,
      Boolean(decision.slashVerifier),
      Boolean(decision.bondFrivolous)
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(
      "The transaction was included but reverted. Check that this address is the appointed " +
        "arbiter on this escrow and that the dispute is still open."
    );
  }
  return { transactionHash: hash };
}

const AGREEMENT_ABI = [
  {
    type: "function",
    name: "resolveDisputeByAgreement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "escrowId", type: "uint256" },
      { name: "amountToExporter", type: "uint256" },
      { name: "agreementCid", type: "string" }
    ],
    outputs: []
  }
];

/**
 * Executes the split the two parties negotiated themselves.
 *
 * The arbiter signs, but the arbiter did not pick the number: it comes from the
 * agreement both parties accepted and which the gateway pinned. That is why the
 * CID is required here as well — the payout has to be auditable against a
 * document rather than against the arbiter's word.
 *
 * `resolveDispute` cannot do this: it takes a bool, so it can only release
 * everything or refund everything. A deployment made before
 * `resolveDisputeByAgreement` existed will revert, which is reported as what it
 * is rather than as an unexplained failure.
 */
export async function settleByAgreementAsArbiter(escrowId, { amountToExporter, agreementCid }) {
  if (!session?.walletClient) {
    throw new Error("The ops session is closed. Enter the arbiter key again.");
  }
  if (!ESCROW_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set, so there is no contract to call.");
  }

  const cid = String(agreementCid || "").trim();
  if (!cid) {
    throw new Error(
      "The agreement has no CID, so there is no document the payout could be checked against."
    );
  }

  let amount;
  try {
    amount = BigInt(amountToExporter);
  } catch {
    throw new Error("The agreed amount is not a whole number of token units.");
  }
  if (amount <= 0n) {
    throw new Error(
      "A zero share is not a split. Use Refund importer, which also decides the bond and any slashing."
    );
  }

  const hash = await session.walletClient.writeContract({
    address: ESCROW_ADDRESS,
    abi: AGREEMENT_ABI,
    functionName: "resolveDisputeByAgreement",
    args: [BigInt(escrowId), amount, cid]
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(
      "The transaction was included but reverted. Either this address is not the appointed " +
        "arbiter, the dispute is no longer open, or the deployed contract predates " +
        "resolveDisputeByAgreement and cannot settle a split at all."
    );
  }
  return { transactionHash: hash };
}

/** Escrows where this ops address is the appointed arbiter. */
export function arbitratedBy(escrows = [], address) {
  if (!address) return [];
  return escrows.filter(
    (e) => e.arbiter && String(e.arbiter).toLowerCase() === String(address).toLowerCase()
  );
}
