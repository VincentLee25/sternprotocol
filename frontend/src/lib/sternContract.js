// Real on-chain createEscrow, sponsored by the Pimlico paymaster.
//
// This is the first action moved off the mock. Everything else in the app still
// runs on lib/mockRegistry.js — deliberately, so one action can prove the whole
// chain (Safe -> bundler -> paymaster -> contract) without a half-migrated app
// making failures ambiguous.
import { encodeFunctionData, parseUnits, parseEventLogs, isAddress } from "viem";
import { publicClient } from "./smartAccount.js";
import { particleEnabled } from "./particle.js";

export const ESCROW_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const IDRT_ADDRESS = import.meta.env.VITE_IDRT_TOKEN_ADDRESS || "";

// IDRTDemo.DECIMALS is a compile-time constant of 2 — IDR has no sub-rupiah
// unit in practice, and the demo token mirrors that.
export const IDRT_DECIMALS = 2;

export const contractsConfigured = isAddress(ESCROW_ADDRESS) && isAddress(IDRT_ADDRESS);

// On-chain mode requires BOTH halves. With contract addresses but no Particle
// credentials, auth falls back to the mock, whose smartAccountAddress is a
// generated fake — and the sidebar would then invite you to mint real tokens to
// an address nobody holds a key for. Irreversible, and it looks like it worked.
export const onChainConfigured = particleEnabled && contractsConfigured;

// Set when contracts are configured but the wallet half is missing, so the UI
// can name the absent piece instead of silently sitting in demo mode.
export const contractsWithoutWallet = contractsConfigured && !particleEnabled;

const ESCROW_ABI = [
  {
    type: "function",
    name: "createEscrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "exporter", type: "address" },
      { name: "arbiter", type: "address" },
      { name: "documentCid", type: "string" },
      { name: "contractValue", type: "uint256" },
      { name: "globalDeadline", type: "uint256" },
      { name: "commodity", type: "string" },
      { name: "containerRef", type: "string" }
    ],
    outputs: [{ name: "escrowId", type: "uint256" }]
  },
  {
    type: "event",
    name: "EscrowCreated",
    inputs: [
      { name: "escrowId", type: "uint256", indexed: true },
      { name: "importer", type: "address", indexed: true },
      { name: "exporter", type: "address", indexed: true },
      { name: "arbiter", type: "address", indexed: false },
      { name: "value", type: "uint256", indexed: false },
      { name: "documentCid", type: "string", indexed: false },
      { name: "globalDeadline", type: "uint256", indexed: false }
    ]
  }
];

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  }
];

export async function getIdrtBalance(address) {
  if (!onChainConfigured || !address) return null;
  const raw = await publicClient.readContract({
    address: IDRT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address]
  });
  // Returned as a plain decimal string so it drops straight into the existing
  // balance UI, which has always dealt in strings.
  return (Number(raw) / 10 ** IDRT_DECIMALS).toFixed(2);
}

/**
 * Locks funds on chain. approve and createEscrow go out as ONE UserOperation:
 * a smart account can batch, so the importer signs once instead of twice and
 * the paymaster sponsors both halves together. (The contract also offers
 * createEscrowWithPermit, but batching avoids having to build and sign EIP-2612
 * typed data by hand.)
 *
 * @returns {Promise<{ escrowId: string, transactionHash: string }>}
 */
export async function createEscrowOnChain(smartAccountClient, form) {
  if (!onChainConfigured) {
    throw new Error(
      "On-chain mode needs VITE_CONTRACT_ADDRESS and VITE_IDRT_TOKEN_ADDRESS in .env."
    );
  }
  if (!smartAccountClient) {
    throw new Error(
      "No smart account client. Sign in again, and check VITE_PIMLICO_API_KEY is set — " +
        "without it the account resolves but cannot send sponsored transactions."
    );
  }

  const value = parseUnits(String(form.value), IDRT_DECIMALS);
  const deadlineSeconds = BigInt(Math.floor(new Date(form.globalDeadline).getTime() / 1000));

  const hash = await smartAccountClient.sendUserOperation({
    calls: [
      {
        to: IDRT_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [ESCROW_ADDRESS, value]
        })
      },
      {
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({
          abi: ESCROW_ABI,
          functionName: "createEscrow",
          args: [
            form.exporter,
            form.arbiter,
            form.documentCid,
            value,
            deadlineSeconds,
            form.commodity,
            form.containerRef
          ]
        })
      }
    ]
  });

  const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });

  if (!receipt.success) {
    throw new Error(
      "The user operation was included but reverted. Check that your Safe holds enough " +
        "IDRT-demo, and that the exporter and arbiter addresses are correct."
    );
  }

  // Read the id back from the event rather than from the return value: a
  // UserOperation gives no return data, and guessing the id was what produced
  // the "escrow not found" bug the first time round.
  const [created] = parseEventLogs({
    abi: ESCROW_ABI,
    eventName: "EscrowCreated",
    logs: receipt.logs
  });

  if (!created) {
    throw new Error(
      "Funds were locked but no EscrowCreated event was found in the receipt — " +
        "the frontend ABI and the deployed contract may be out of sync."
    );
  }

  return {
    escrowId: created.args.escrowId.toString(),
    transactionHash: receipt.receipt.transactionHash
  };
}
