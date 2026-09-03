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
      adminCheckFailed = err?.message || "Could not reach the contract to check roles.";
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

/** Escrows where this ops address is the appointed arbiter. */
export function arbitratedBy(escrows = [], address) {
  if (!address) return [];
  return escrows.filter(
    (e) => e.arbiter && String(e.arbiter).toLowerCase() === String(address).toLowerCase()
  );
}
