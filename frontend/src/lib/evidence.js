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
    challengeDeadline: target?.challengeDeadline || null,
    // `actionable` is a snapshot taken when the evidence was fetched, and it
    // never expires on its own — so a panel left open kept offering a dispute
    // whose window had already closed, until prepareDispute refused it on the
    // click. The caller needs the deadline itself to keep the offer honest.
    challengeDeadlineUnix: target?.challengeDeadlineUnix
      ? Number(target.challengeDeadlineUnix)
      : null
  };
}

// Which source feeds which milestone. Getting this pairing wrong is the most
// common reason a rehearsal produces no discrepancy at all: switching on `ais`
// cannot make the Inspected milestone disagree, because Inspected was never
// based on AIS. Nothing in the UI said so, and the failure is silent.
const MILESTONE_FAULT = {
  inspected: { fault: "inspection", source: "the inspection report" },
  shipped: { fault: "ais", source: "vessel tracking" },
  arrived_cleared: { fault: "customs", source: "customs clearance" }
};

/**
 * Everything needed to stage a dispute in one press.
 *
 * Raising a dispute by hand means holding three things at once: which
 * milestones have a committed proof, which fault corresponds to each one, and
 * how many seconds are left before the window shuts. On a deployment with a
 * short challenge window that last one runs out while you work the first two
 * out, and the panel's only feedback is the CTA never appearing.
 *
 * So this picks the milestone itself — the most recently committed one whose
 * window is still open, because nothing is waiting behind it and the whole
 * window is available — and names the fault that will make it disagree.
 */
export function disputeRehearsal(evidence, nowSeconds = Math.floor(Date.now() / 1000)) {
  const rows = milestoneRows(evidence);
  const committed = rows.filter((row) => row.submitted);

  if (!committed.length) {
    return {
      possible: false,
      reason: "Nothing is committed yet. A dispute contests a proof that already exists, so verify a milestone first."
    };
  }

  const open = committed
    .filter((row) => row.challengeDeadlineUnix && row.challengeDeadlineUnix - nowSeconds > 0)
    // Latest first: the newest proof has the most of its window left, and no
    // later milestone is queued behind it.
    .sort((a, b) => b.challengeDeadlineUnix - a.challengeDeadlineUnix);

  if (!open.length) {
    return {
      possible: false,
      reason:
        "Every committed proof is past its challenge window. Those proofs now stand, which is the design — a proof is contested inside its window or not at all. Verify the next milestone and act while its window is open."
    };
  }

  const target = open[0];
  const already = target.discrepancy;
  const mapping = MILESTONE_FAULT[target.key];

  return {
    possible: true,
    alreadyDiscrepant: already,
    milestone: target.key,
    milestoneLabel: target.label,
    fault: mapping.fault,
    sourceLabel: mapping.source,
    secondsLeft: target.challengeDeadlineUnix - nowSeconds,
    challengeDeadlineUnix: target.challengeDeadlineUnix
  };
}

/** Seconds left on every committed proof, for the per-row countdowns. */
export function openWindows(evidence, nowSeconds = Math.floor(Date.now() / 1000)) {
  return milestoneRows(evidence)
    .filter((row) => row.submitted && row.challengeDeadlineUnix)
    .map((row) => ({ key: row.key, secondsLeft: row.challengeDeadlineUnix - nowSeconds }));
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

/**
 * Reads the response of POST /oracle/verify/:id into rows for the UI.
 *
 * The agreed shape is `{ contractId, results: { inspected: "submitted", … } }`,
 * but "submitted" is only one of the outcomes that can honestly come back. The
 * contract enforces order and a challenge window between milestones, so a single
 * call can very reasonably commit the first and be unable to reach the second
 * yet. Anything the gateway did not commit is reported as it came, rather than
 * being flattened into a failure — a milestone waiting on its challenge window
 * is not an error, and saying so keeps the operator from re-pressing the button
 * expecting a different answer.
 */
const VERIFY_TONE = {
  submitted: "ok",
  already: "ok",
  already_submitted: "ok",
  skipped: "muted",
  pending: "wait",
  waiting: "wait",
  challenge_window_open: "wait",
  blocked: "wait",
  not_ready: "wait",
  // Not a protocol failure and not something waiting will fix — someone has to
  // top the wallet up. Amber rather than red: nothing is broken, it is out of
  // fuel.
  verifier_out_of_gas: "wait",
  // Same category: an operational shortfall, not the protocol refusing. The
  // verifier's stake fell below the minimum — usually because an arbiter slashed
  // it — and topping it back up fixes it.
  verifier_bond_required: "wait"
};

export function verifyResultRows(response) {
  const results = response?.results || {};
  return EVIDENCE_MILESTONES.map((m) => {
    // Accept either spelling of the third milestone, and either a bare string
    // or an object carrying a reason.
    const raw = results[m.key] ?? results[m.key.replace(/_(\w)/g, (_, c) => c.toUpperCase())];
    const status = typeof raw === "string" ? raw : raw?.status || null;
    const detail = typeof raw === "object" ? raw?.reason || raw?.error || null : null;
    const key = String(status || "").toLowerCase();
    return {
      key: m.key,
      label: m.label,
      oracle: m.oracle,
      status: status || "no result",
      detail,
      tone: status ? VERIFY_TONE[key] || "fail" : "muted",
      // The gateway returns these on a submitted milestone and they were being
      // dropped here, which left the panel asserting "submitted" with nothing
      // behind it. They are the moment the claim becomes checkable: the hash of
      // the transaction that carried the proof, and the wallet that signed it.
      transactionHash: typeof raw === "object" ? raw?.transactionHash || null : null,
      verifier: typeof raw === "object" ? raw?.verifier || null : null,
      blockNumber: typeof raw === "object" ? raw?.blockNumber ?? null : null
    };
  });
}

/**
 * The per-source rows the gateway already compared: what it expected, what the
 * source actually said, and whether that passed.
 *
 * The gateway sends this in `evidence[]` and the UI was throwing it away,
 * showing only a pass/fail chip. "CEISA failed" does not tell an operator what
 * went wrong; "expected approved, got rejected" does.
 */
export function sourceEvidence(evidence) {
  return (evidence?.evidence || []).map((item, i) => ({
    key: `${item.source}-${item.field}-${i}`,
    source: item.source,
    oracle: item.oracle,
    field: item.field,
    expected: formatValue(item.expected),
    actual: formatValue(item.actual),
    // What the reading is about, in the bill of lading's own terms, and where
    // the expected value came from. Without these the panel showed "expected
    // departed, actual in_port" — true, and silent about which vessel, which
    // voyage and which ports, so a reader could not tell the reading even
    // concerned this shipment.
    subject: item.subject || null,
    basis: item.basis || null,
    passed: item.passed !== false,
    simulated: Boolean(item.simulated)
  }));
}

// Booleans read badly as "true"/"false" next to strings like "not_departed".
function formatValue(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value === null || value === undefined) return "—";
  return String(value);
}

/** The named checks, for the source panel. */
export function verificationChecks(evidence) {
  const v = evidence?.verification || {};
  return [
    { key: "vgmMatch", label: "VGM match", passed: v.vgmMatch, source: "VGM" },
    { key: "inspectionPassed", label: "Inspection passed", passed: v.inspectionPassed, source: "Inspection" },
    { key: "aisDeparted", label: "AIS departure", passed: v.aisDeparted, source: "AIS" },
    { key: "ceisaApproved", label: "CEISA clearance", passed: v.ceisaApproved, source: "CEISA" },
    // Was "Document CID valid", back when the check was that a string started
    // with "bafybeistern". It now retrieves the document from IPFS and reads
    // it, so the label says what it means.
    { key: "eblCidValid", label: "e-BL verified", passed: v.eblCidValid, source: "IPFS" }
  ].filter((c) => c.passed !== undefined);
}

/**
 * The e-BL source, in the form the panel needs.
 *
 * Returns null when the gateway has no pinning service configured — in that
 * mode its answer is a placeholder, and showing it as a document verification
 * would be the same overstatement this whole path was built to remove.
 */
export function eblSummary(evidence) {
  const source = evidence?.sources?.ipfs;
  if (!source) return null;

  // "mock" is a deliberate mode — nobody configured pinning. "broken" is a
  // fault: pinning IS configured and the check could not run. Reporting the
  // second as unconfigured would hide a failure behind a setup notice.
  if (source.mode === "mock") {
    return { configured: false, note: source.note || null };
  }

  if (source.mode === "broken") {
    return {
      configured: true,
      broken: true,
      valid: false,
      available: false,
      cid: source.cid || null,
      reason: source.reason || "The e-BL check could not run on this gateway.",
      failedChecks: source.failedChecks || [],
      checks: {},
      fields: null
    };
  }

  return {
    configured: true,
    cid: source.cid || null,
    valid: source.valid === true,
    available: source.available !== false,
    reason: source.reason || "",
    simulatedFault: Boolean(source.simulatedFault),
    placeholder: Boolean(source.placeholder),
    failedChecks: source.failedChecks || [],
    checks: source.checks || {},
    fields: source.fields || null,
    containerRefExpected: source.containerRefExpected || null,
    pages: source.document?.pages ?? null,
    size: source.document?.size ?? null,
    sha256: source.document?.sha256 || null,
    retrievedFrom: source.document?.retrievedFrom || null
  };
}
