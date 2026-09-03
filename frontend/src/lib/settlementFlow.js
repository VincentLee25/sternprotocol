// Timelock, release and refund — signed by the user's Smart Account.
//
// These used to go through getBrowserContract(), which reads window.ethereum.
// That was written for the MetaMask era and cannot work for the users this
// product is for: someone who signed in with Google through Particle has no
// injected wallet at all, so the call fell over before it reached the chain.
//
// They also sat behind `escrow.source === "chain"`, and escrowSource labels
// gateway rows "gateway" — so on a live escrow the condition was never true and
// the mock branch ran instead, reporting "Funds released to exporter" while
// nothing had been sent. Silently claiming a settlement that did not happen is
// the worst failure this app could have, which is why these now share the one
// signing path with disputeFlow.js.
import { encodeFunctionData } from "viem";
import { ESCROW_ADDRESS } from "./sternContract.js";

const ABI = [
  { type: "function", name: "initiateTimelock", stateMutability: "nonpayable", inputs: [{ name: "escrowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "releasePayment", stateMutability: "nonpayable", inputs: [{ name: "escrowId", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimRefund", stateMutability: "nonpayable", inputs: [{ name: "escrowId", type: "uint256" }], outputs: [] }
];

function requireClient(smartAccountClient) {
  if (!smartAccountClient) {
    throw new Error(
      "No Smart Account available. Sign in with Particle, and check VITE_PIMLICO_API_KEY — " +
        "without it the account resolves but cannot send transactions."
    );
  }
  if (!ESCROW_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set, so there is no contract to call.");
  }
}

/**
 * Sends one contract call as a UserOperation and waits for it to land.
 *
 * A reverted operation still produces a receipt, so `success` has to be checked
 * — treating inclusion as success would report a settlement that the contract
 * refused.
 */
async function send(smartAccountClient, functionName, escrowId, revertHint) {
  requireClient(smartAccountClient);

  const hash = await smartAccountClient.sendUserOperation({
    calls: [
      {
        to: ESCROW_ADDRESS,
        data: encodeFunctionData({ abi: ABI, functionName, args: [BigInt(escrowId)] })
      }
    ]
  });

  const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });
  if (!receipt.success) {
    throw new Error(`${functionName} was included but reverted. ${revertHint}`);
  }
  return { transactionHash: receipt.receipt.transactionHash };
}

/** ArrivedCleared → TimelockActive. Opens the final window before funds move. */
export const initiateTimelockAsUser = (client, escrowId) =>
  send(
    client,
    "initiateTimelock",
    escrowId,
    "All three milestone proofs must be committed first, and the timelock must not already be running."
  );

/** TimelockActive → Completed. Pays the exporter. */
export const releasePaymentAsUser = (client, escrowId) =>
  send(
    client,
    "releasePayment",
    escrowId,
    "The timelock must have elapsed and no dispute may be open."
  );

/** Returns the escrow value to the importer, after the deadline. */
export const claimRefundAsUser = (client, escrowId) =>
  send(
    client,
    "claimRefund",
    escrowId,
    "Only the importer may refund, and only once the global deadline has passed."
  );
