// Reading GET /oracle/evidence/:id.
//
// The frontend implements no verification logic of its own
// (docs/FRONTEND_HANDOFF_UPDATED.md, closing note). The gateway has already
// compared the current sources against what was committed on chain; everything
// here just names its answer for the UI.

// Backend milestone keys, in on-chain order. The contract's ids are 1-3;
// milestone 0 is "none", used for a dispute against the escrow as a whole.
export const EVIDENCE_MILESTONES = [
  { key: "inspected", id: 1, label: "Inspected", oracle: "Quality Auditor", state: "Inspected" },
  { key: "shipped", id: 2, label: "Shipped", oracle: "Logistics", state: "Shipped" },
  { key: "arrived_cleared", id: 3, label: "Arrived & cleared", oracle: "Customs", state: "ArrivedCleared" }
];

export const milestoneLabel = (key) =>
  EVIDENCE_MILESTONES.find((m) => m.key === key)?.label || key;

/**
 * Per-milestone view combining the committed proof with the current source
 * verdict. `discrepancy` is the gateway's own flag — a proof that WAS committed
 * and whose source now disagrees. It is not recomputed here.
 */
export function milestoneRows(evidence) {
  if (!evidence) return [];
  return EVIDENCE_MILESTONES.map((m) => {
    const cmp = evidence.comparison?.[m.key] || {};
    const proof = evidence.onchain?.[m.key] || {};
    return {
      ...m,
      submitted: Boolean(cmp.onchainProofSubmitted),
      sourcePasses: Boolean(cmp.currentSourcePasses),
      discrepancy: Boolean(cmp.discrepancyAfterCommit),
      proofCid: cmp.proofCid || proof.proofCid || null,
      verifier: cmp.verifier || proof.verifier || null,
      challengeDeadline: cmp.challengeDeadline || null,
      challengeDeadlineUnix: cmp.challengeDeadlineUnix || null,
      blockNumber: proof.blockNumber ?? null
    };
  });
}

/**
 * Whether to show the Challenge/Dispute CTA at all, and against which
 * milestone.
 *
 * Both conditions must hold, and they are not the same thing: a discrepancy can
 * exist while the challenge window has already closed, in which case the
 * gateway reports actionable=false and no dispute is possible. Showing the CTA
 * on the discrepancy alone would offer an action that always reverts.
 */
export function disputeOpportunity(evidence) {
  const actionable = Boolean(evidence?.disputeDemo?.actionable);
  const reason = evidence?.disputeDemo?.reason || "";
  const committed = evidence?.committedDiscrepancies || [];

  const now = Math.floor(Date.now() / 1000);
  const target =
    committed.find((d) => d.challengeDeadlineUnix && now <= Number(d.challengeDeadlineUnix)) ||
    committed[0] ||
    null;

  return {
    actionable,
    reason,
    hasDiscrepancy: committed.length > 0,
    // A discrepancy the user can no longer act on. Worth saying out loud rather
    // than hiding, or the timeline looks broken with no explanation.
    windowClosed: committed.length > 0 && !actionable,
    milestone: target?.milestone || null,
    milestoneLabel: target ? milestoneLabel(target.milestone) : null,
    challengeDeadline: target?.challengeDeadline || null
  };
}

/** Fault selector options, taken from the gateway rather than hardcoded. */
export function faultOptions(evidence) {
  const available = evidence?.simulation?.availableFaults || [];
  return available.map((fault) => ({
    value: fault,
    label: fault === "none" ? "No fault (reset)" : fault.replace(/_/g, " ")
  }));
}

export const activeFault = (evidence) =>
  evidence?.simulation?.enabled ? evidence.simulation.fault : "none";

/** The named checks, for the source panel. */
export function verificationChecks(evidence) {
  const v = evidence?.verification || {};
  return [
    { key: "vgmMatch", label: "VGM match", passed: v.vgmMatch, source: "VGM" },
    { key: "inspectionPassed", label: "Inspection passed", passed: v.inspectionPassed, source: "Inspection" },
    { key: "aisDeparted", label: "AIS departure", passed: v.aisDeparted, source: "AIS" },
    { key: "ceisaApproved", label: "CEISA clearance", passed: v.ceisaApproved, source: "CEISA" },
    { key: "eblCidValid", label: "Document CID valid", passed: v.eblCidValid, source: "IPFS" }
  ].filter((c) => c.passed !== undefined);
}
