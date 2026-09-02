// Smart account + gasless, built on top of Particle's social login.
//
// Particle's own `aa()` ConnectKit plugin is deliberately NOT used. The team
// spiked that route first (Biconomy, then Nexus/MEE) and settled on Safe +
// Pimlico instead, because Safe is the account implementation every bundler
// supports. So ConnectKit is only the auth layer here: it hands us an EOA, and
// that EOA owns a Safe account whose gas Pimlico sponsors.
//
// Two capabilities that are worth keeping separate:
//   - deriving the Safe ADDRESS needs only a public RPC + the owner
//   - SENDING a sponsored transaction needs the Pimlico key
// so a missing Pimlico key still lets someone sign in and see their address;
// it only disables sponsored sending. The spike bailed out entirely instead.
import { createPublicClient, http } from "viem";
import { polygonAmoy } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";

const PIMLICO_API_KEY = import.meta.env.VITE_PIMLICO_API_KEY || "";

// Deriving the Safe address makes a real eth_call (proxyCreationCode on the
// Safe factory), so the RPC has to answer requests from a BROWSER — meaning it
// must send CORS headers. rpc-amoy.polygon.technology does not do so reliably
// and fails with a bare "Failed to fetch", which looks like a code bug rather
// than a network policy. Override with VITE_RPC_URL if this one also refuses.
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com";

// Pimlico's slug for Polygon Amoy (chain 80002).
const PIMLICO_URL = PIMLICO_API_KEY
  ? `https://api.pimlico.io/v2/polygon-amoy/rpc?apikey=${PIMLICO_API_KEY}`
  : "";

export const gaslessConfigured = Boolean(PIMLICO_API_KEY);

export const publicClient = createPublicClient({
  chain: polygonAmoy,
  transport: http(RPC_URL)
});

const ENTRY_POINT = { address: entryPoint07Address, version: "0.7" };

/**
 * Builds the Safe account owned by the Particle EOA, and — when a Pimlico key
 * is present — a client that wraps sendTransaction into a sponsored
 * UserOperation.
 *
 * @param {object} walletClient viem WalletClient from Particle's useWallets()
 * @returns {Promise<{ address: string, client: object|null, sponsored: boolean }>}
 */
export async function createSternSmartAccount(walletClient) {
  let safeAccount;
  try {
    safeAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [walletClient],
      entryPoint: ENTRY_POINT,
      version: "1.4.1"
    });
  } catch (err) {
    // viem reports a blocked or unreachable RPC as a bare "Failed to fetch",
    // which reads like an application bug. Name the actual cause instead.
    if (/failed to fetch|HTTP request failed|fetch failed/i.test(String(err?.message))) {
      throw new Error(
        `Could not reach the Polygon Amoy RPC at ${RPC_URL}. ` +
          "The browser was blocked (usually CORS or rate limiting) rather than " +
          "the call being rejected. Set VITE_RPC_URL in .env to an RPC that " +
          "allows browser requests, then restart the dev server."
      );
    }
    throw err;
  }

  if (!gaslessConfigured) {
    return { address: safeAccount.address, client: null, sponsored: false };
  }

  const pimlicoClient = createPimlicoClient({
    transport: http(PIMLICO_URL),
    entryPoint: ENTRY_POINT
  });

  const client = createSmartAccountClient({
    account: safeAccount,
    chain: polygonAmoy,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast
    }
  });

  return { address: safeAccount.address, client, sponsored: true };
}
