// Negotiating a way out of a dispute, and the one thing this feature must never
// do: tell the parties a settlement is executable when the deployed contract
// cannot execute it.
//
// The chain is stubbed. What is being tested is who may post, who may accept,
// what an accepted agreement says, and — section 6 — that executability is
// reported from the deployment rather than asserted.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stern-nego-")), "negotiations.json");
process.env.NEGOTIATION_STORE_FILE = STORE;

const contractService = require("../backend/oracle-gateway/contractService.js");
const negotiation = require("../backend/oracle-gateway/negotiationService.js");
const ipfs = require("../backend/oracle-gateway/ipfsService.js");

// Pinning is stubbed, and it has to be.
//
// This used to `delete process.env.PINATA_JWT` and assume that left the gateway
// with no pinning service. It did the opposite: config.js loads .env after this
// file runs, and dotenv fills any variable that is absent — so deleting it
// guaranteed a configured token came back. The agreement then pinned for real
// and section 8's AGREEMENT_NOT_PINNED never happened. Both paths are driven
// from here instead, and neither touches the network.
let pinning = { mode: "unavailable" };
ipfs.pinDocument = async (bytes, fileName) => {
  if (pinning.mode === "unavailable") {
    throw new Error("IPFS pinning is not configured on this gateway.");
  }
  pinning.lastFileName = fileName;
  pinning.lastBytes = bytes;
  return { cid: "QmTestAgreementCid000000000000000000000000000000" };
};

const IMPORTER = "0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381";
const EXPORTER = "0x0997657e121213909bE3E9d7701df0753Fb102ed";
const ARBITER = "0x1B2C3d4E5f60718293A4b5C6d7E8f90A1b2C3d4E";
const OUTSIDER = "0x9999999999999999999999999999999999999999";
const VALUE = "4500000000"; // 45.000.000,00 IDRT-demo, 2 decimals

// The chain, as far as this service can see it.
let chain = { disputeOpen: true, contractValue: VALUE, state: "Disputed" };
let splitSupported = false;

contractService.getEscrow = async () => ({
  importer: IMPORTER,
  exporter: EXPORTER,
  arbiter: ARBITER,
  contractValue: chain.contractValue,
  value: "45000000.00",
  state: chain.state
});
contractService.getDispute = async () => ({
  open: chain.disputeOpen,
  raisedBy: IMPORTER,
  contestedMilestone: "inspected"
});
contractService.supportsAgreementSettlement = async () => splitSupported;

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (String(actual) === String(expected)) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} — expected ${expected}, got ${actual}`);
  }
}
async function refuses(label, fn, code) {
  try {
    await fn();
    fail += 1;
    console.log(`  FAIL ${label} — it was accepted`);
  } catch (error) {
    check(label, error.code, code);
  }
}

const NOTE_IMPORTER =
  "Kadar air 14,2 persen di atas kontrak 12,5 persen; kami minta potongan 15 persen dari nilai invoice.";
const NOTE_EXPORTER =
  "Sampel kami 12,9 persen. Kami bisa terima potongan 5 persen sebagai penyelesaian, bukan 15 persen.";

async function main() {
  console.log("\n1. only a party to the escrow may propose, and only during a dispute");
  await refuses(
    "an outsider cannot propose",
    () => negotiation.propose("7", { by: OUTSIDER, outcome: "refund_to_importer", note: NOTE_IMPORTER }),
    "NOT_A_PARTY"
  );
  await refuses(
    "a proposal needs a reason, not just a number",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "refund_to_importer", note: "minta refund" }),
    "NOTE_REQUIRED"
  );
  await refuses(
    "an invented outcome",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "half_maybe", note: NOTE_IMPORTER }),
    "OUTCOME_INVALID"
  );

  chain.disputeOpen = false;
  await refuses(
    "no open dispute, nothing to negotiate",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "refund_to_importer", note: NOTE_IMPORTER }),
    "NO_OPEN_DISPUTE"
  );
  chain.disputeOpen = true;

  console.log("\n2. a split is a split, not a disguised all-or-nothing");
  await refuses(
    "a percentage is required",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "split", note: NOTE_IMPORTER }),
    "SPLIT_INVALID"
  );
  await refuses(
    "10000 bps is a full release, not a split",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "split", splitToExporterBps: 10000, note: NOTE_IMPORTER }),
    "SPLIT_INVALID"
  );
  await refuses(
    "zero is a full refund, not a split",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "split", splitToExporterBps: 0, note: NOTE_IMPORTER }),
    "SPLIT_INVALID"
  );
  await refuses(
    "and not a fraction of a basis point",
    () => negotiation.propose("7", { by: IMPORTER, outcome: "split", splitToExporterBps: 8512.5, note: NOTE_IMPORTER }),
    "SPLIT_INVALID"
  );

  console.log("\n3. the proposal carries the amount, in the token's own units");
  const first = await negotiation.propose("7", {
    by: IMPORTER,
    outcome: "split",
    splitToExporterBps: 8500,
    note: NOTE_IMPORTER
  });
  check("proposer's role is read from the chain, not the request", first.byRole, "importer");
  // 85% of 45.000.000,00 is 38.250.000,00 — 3825000000 in units of 0,01.
  check("amount is computed, not re-derived later", first.amountToExporter, "3825000000");

  console.log("\n4. a counter-proposal supersedes the one on the table");
  const second = await negotiation.propose("7", {
    by: EXPORTER,
    outcome: "split",
    splitToExporterBps: 9500,
    note: NOTE_EXPORTER
  });
  const thread = await negotiation.forEscrow("7");
  check("both are in the thread", thread.proposals.length, 2);
  check("the first is superseded", thread.proposals[0].superseded, true);
  check("the second is live", thread.proposals[1].superseded, false);
  await refuses(
    "and the superseded one can no longer be accepted",
    () => negotiation.accept("7", first.id, { by: EXPORTER }),
    "PROPOSAL_SUPERSEDED"
  );

  console.log("\n5. acceptance takes two");
  await refuses(
    "the proposer cannot accept their own",
    () => negotiation.accept("7", second.id, { by: EXPORTER }),
    "SELF_ACCEPT"
  );
  await refuses(
    "an outsider cannot accept",
    () => negotiation.accept("7", second.id, { by: OUTSIDER }),
    "NOT_A_PARTY"
  );

  console.log("\n6. an agreed split is recorded — and reported unexecutable on a contract that cannot split");
  splitSupported = false;
  const agreed = await negotiation.accept("7", second.id, { by: IMPORTER });
  check("the agreement is the parties'", agreed.acceptedBy, IMPORTER);
  check("with the amount both signed", agreed.amountToExporter, "4275000000");
  check("it is not claimed to be executable", agreed.executable, false);
  check("and names why", /deploy ulang/.test(agreed.blockedReason), true);
  check("and offers the fallback rather than performing it", /release_to_exporter/.test(agreed.fallback), true);

  console.log("\n7. the same agreement, on a contract that can settle a split");
  splitSupported = true;
  const now = await negotiation.forEscrow("7");
  check("executable now", now.agreement.executable, true);
  check("no blocked reason left over", Boolean(now.agreement.blockedReason), false);
  check("the arbiter is told which call to make", /resolveDisputeByAgreement/.test(now.agreement.contractCall), true);
  // The panel has to know this before anyone proposes, not after both signed.
  check("the outcome list agrees", now.outcomes.split.executable, true);
  splitSupported = false;
  check("and flips back when the deployment cannot", (await negotiation.forEscrow("7")).outcomes.split.executable, false);

  console.log("\n8. executing an agreement executes that agreement");
  await refuses(
    "a settlement call needs to name the agreement",
    () => contractService.resolveDisputeByAgreement("7", {}),
    "INVALID_AGREEMENT"
  );
  await refuses(
    "and it must be the one that was accepted",
    () => contractService.resolveDisputeByAgreement("7", { agreementId: "pr1" }),
    "AGREEMENT_MISMATCH"
  );
  // The accepted agreement was never pinned (the stub above refused), so there
  // is no document the payout could be audited against. It refuses rather than
  // paying out against a record only this gateway can see.
  await refuses(
    "an unpinned agreement is not executed",
    () => contractService.resolveDisputeByAgreement("7", { agreementId: second.id }),
    "AGREEMENT_NOT_PINNED"
  );

  console.log("\n9. a withdrawn agreement stays in the record");
  const withdrawn = await negotiation.withdraw("7", { by: EXPORTER });
  check("withdrawn", withdrawn.ok, true);
  const reopened = await negotiation.forEscrow("7");
  check("the thread is open again", reopened.status, "open");
  check("no live agreement", reopened.agreement, "null");
  check("but it is not erased", reopened.withdrawn.length, 1);
  check("and who withdrew it is recorded", reopened.withdrawn[0].withdrawnBy, EXPORTER);
  await refuses(
    "nothing left to execute",
    () => contractService.resolveDisputeByAgreement("7", { agreementId: second.id }),
    "NO_AGREEMENT"
  );

  console.log("\n10. a binary outcome was always executable and still is");
  // Pinning available from here on, so the agreement is cited by address — the
  // state the product is actually deployed in.
  pinning = { mode: "available" };
  const binary = await negotiation.propose("7", {
    by: EXPORTER,
    outcome: "release_to_exporter",
    note: "Kami kirim ulang hasil uji lab independen; mohon dana dilepas sesuai kontrak asli."
  });
  const binaryAgreed = await negotiation.accept("7", binary.id, { by: IMPORTER });
  check("executable regardless of the deployment", binaryAgreed.executable, true);
  check("and it is resolveDispute that does it", /resolveDispute\(escrowId, true/.test(binaryAgreed.contractCall), true);

  console.log("\n11. the pinned agreement is the document the payout is checked against");
  check("the CID is recorded", binaryAgreed.cid, "QmTestAgreementCid000000000000000000000000000000");
  check("and nothing claims it was not pinned", Boolean(binaryAgreed.notPinned), false);
  check("named for its escrow", pinning.lastFileName, "stern-agreement-7.json");
  const document = JSON.parse(pinning.lastBytes.toString("utf8"));
  check("carries its own type marker", document.stern, "stern/dispute-agreement@1");
  check("and both signatures", `${document.proposedBy}|${document.acceptedBy}`, `${EXPORTER}|${IMPORTER}`);
  // Checked before the chain is touched, which is why this runs without one: a
  // full release carries slashing and frivolous-bond decisions that the split
  // call has no arguments for, so routing it through here would skip both.
  await refuses(
    "a full release is not routed through the split call",
    () => contractService.resolveDisputeByAgreement("7", { agreementId: binary.id }),
    "NOT_A_SPLIT"
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
