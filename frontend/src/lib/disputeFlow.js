// Raising a dispute, end to end.
//
// The gateway deliberately has no raiseDispute endpoint
// (docs/FRONTEND_HANDOFF_UPDATED.md §9): the transaction spends the importer's
// bond, so only their Smart Account may sign it. The backend's job stops at
// handing us the bond amount and the two calldatas.
//
// Both calls go out as ONE UserOperation. A smart account can batch, so the
// user confirms once instead of twice, the paymaster sponsors both halves
// together, and there is no window where the approval has landed but the
// dispute has not — which would leave an allowance sitting on the escrow.
import { prepareDispute } from "./sternApi.js";
import { publicClient } from "./smartAccount.js";

/**
 * @param {object} smartAccountClient permissionless client from useSternAuth
 * @param {string|number} escrowId
 * @param {string} contestedMilestone "inspected" | "shipped" | "arrived_cleared"
 * @returns {Promise<{transactionHash: string, bond: string, milestone: string}>}
 */
export async function raiseDisputeAsUser(smartAccountClient, escrowId, contestedMilestone) {
  if (!smartAccountClient) {
    throw new Error(
      "No Smart Account available. Sign in with Particle, and check VITE_PIMLICO_API_KEY — " +
        "without it the account resolves but cannot send transactions."
    );
  }

  const prep = await prepareDispute(escrowId, contestedMilestone);

  // The gateway computes these against live chain state, so trust its answer
  // over anything the UI happens to be showing.
  if (prep.disputeAlreadyOpen) {
    throw new Error("A dispute is already open on this escrow.");
  }
  if (!prep.windowStillOpen) {
    throw new Error(
      `The challenge window for the ${prep.contestedMilestone} milestone closed at ` +
        `${new Date(prep.challengeDeadline).toLocaleString("id-ID")}. A dispute can no longer be raised.`
    );
  }

  const hash = await smartAccountClient.sendUserOperation({
    calls: [
      {
        to: prep.requiredApproval.tokenAddress,
        data: prep.requiredApproval.calldata
      },
      {
        to: prep.userTransaction.contractAddress,
        data: prep.userTransaction.calldata
      }
    ]
  });

  const receipt = await smartAccountClient.waitForUserOperationReceipt({ hash });

  if (!receipt.success) {
    throw new Error(
      `The dispute was included but reverted. Check that your Smart Account holds at least ` +
        `${prep.disputeBondAmountFormatted} ${prep.currency} for the bond.`
    );
  }

  return {
    transactionHash: receipt.receipt.transactionHash,
    bond: prep.disputeBondAmountFormatted,
    milestone: prep.contestedMilestone
  };
}

/**
 * Bond preview for the confirmation UI. Read-only — it calls the same prepare
 * endpoint but signs nothing, so it is safe to call whenever the CTA is shown.
 */
export async function previewDispute(escrowId, contestedMilestone) {
  const prep = await prepareDispute(escrowId, contestedMilestone);
  return {
    bond: prep.disputeBondAmountFormatted,
    bondRaw: prep.disputeBondAmount,
    currency: prep.currency,
    milestone: prep.contestedMilestone,
    windowStillOpen: prep.windowStillOpen,
    challengeDeadline: prep.challengeDeadline,
    alreadyOpen: prep.disputeAlreadyOpen
  };
}

export { publicClient };
