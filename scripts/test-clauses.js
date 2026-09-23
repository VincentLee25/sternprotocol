// Interpretive clauses: declaring them, judging them, and the milestone they
// hold until somebody does.
//
// The thing under test is not "does the store write a row". It is the rule:
// a clause a person has to answer holds its milestone until that person has
// answered it in writing, and an escrow that declared no clauses behaves
// exactly as it did before this feature existed.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stern-clause-")), "clauses.json");
process.env.CLAUSE_STORE_FILE = STORE;

const clauses = require("../backend/oracle-gateway/clauseService.js");
const ipfs = require("../backend/oracle-gateway/ipfsService.js");
const { clauseBlocks } = require("../backend/oracle-gateway/contractService.js");

// Pinning is stubbed, and it has to be.
//
// This used to `delete process.env.PINATA_JWT` and assume that left the gateway
// without a pinning service. It did the opposite: config.js loads .env AFTER
// this file runs, and dotenv only fills a variable that is absent — so deleting
// it guaranteed the real token was put back. On a machine with Pinata
// configured the review pinned for real, `reasoningCid` came back as a genuine
// CID, and section 5 failed. On a machine without one it passed. A test whose
// result depends on whose laptop it runs on is worse than no test.
//
// So both paths are driven here instead of inferred from the environment, and
// neither one touches the network.
let pinning = { mode: "unavailable" };
ipfs.pinDocument = async (bytes, fileName) => {
  if (pinning.mode === "unavailable") {
    throw new Error("IPFS pinning is not configured on this gateway.");
  }
  pinning.lastFileName = fileName;
  pinning.lastBytes = bytes;
  return { cid: "QmTestClauseReviewCid00000000000000000000000000" };
};

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

const REVIEWER = "0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381";
const OTHER = "0x0997657e121213909bE3E9d7701df0753Fb102ed";
const LAYAK_JUAL = "Biji kopi harus dalam kondisi layak jual dan bebas dari bau apek.";
const PACKAGING = "Kemasan harus layak untuk pengangkutan laut selama minimal 30 hari.";
const REASON =
  "Sampel dari tiga karung diperiksa di gudang Belawan; tidak ada bau apek, kadar air 11,8 persen, warna seragam.";

async function main() {
  console.log("\n1. declaring clauses, as manifestService will before pinning");
  const declared = clauses.normaliseClauses([
    { text: LAYAK_JUAL, milestone: "inspected", reviewer: REVIEWER, reviewerRole: "quality-surveyor" },
    { text: PACKAGING, milestone: "shipped", reviewer: REVIEWER },
    { text: "Berat kotor terverifikasi sesuai VGM.", milestone: "shipped", kind: "automated" }
  ]);
  check("ids come from position, not randomness", declared.map((c) => c.id).join(","), "cl1,cl2,cl3");
  check("interpretive by default", declared[0].kind, "interpretive");
  check("interpretive clauses are required by default", declared[0].required, true);
  check("an automated clause needs no reviewer", declared[2].reviewer, "null");
  check("an automated clause does not gate by default", declared[2].required, false);

  console.log("\n2. a clause nobody can answer is refused at declaration");
  await refuses(
    "interpretive clause with no reviewer",
    () => clauses.normaliseClauses([{ text: LAYAK_JUAL, milestone: "inspected" }]),
    "CLAUSE_REVIEWER_REQUIRED"
  );
  await refuses(
    "clause attached to no milestone holds nothing",
    () => clauses.normaliseClauses([{ text: LAYAK_JUAL, reviewer: REVIEWER }]),
    "CLAUSE_MILESTONE_INVALID"
  );
  await refuses(
    "text too short to judge",
    () => clauses.normaliseClauses([{ text: "bagus", milestone: "inspected", reviewer: REVIEWER }]),
    "CLAUSE_TEXT_INVALID"
  );

  console.log("\n3. before anyone reviews, the clause holds its own milestone only");
  const before = clauses.assess("7", declared);
  check("the escrow is known to have clauses", before.declared, true);
  check("inspected is blocked", before.milestones.inspected.blocked, true);
  check("and says why", /belum dinilai/.test(before.milestones.inspected.reason), true);
  check("shipped is blocked by its own clause", before.milestones.shipped.blocked, true);
  check("arrived_cleared has no clauses and is not blocked", before.milestones.arrived_cleared.blocked, false);
  check("the automated clause is not counted as interpretive", before.milestones.shipped.interpretive, 1);

  console.log("\n4. a verdict needs an argument behind it");
  await refuses(
    "no reasoning",
    () => clauses.review("7", "cl1", { verdict: "met", reviewedBy: REVIEWER }),
    "CLAUSE_REASONING_REQUIRED"
  );
  await refuses(
    "reasoning too short to be disputed",
    () => clauses.review("7", "cl1", { verdict: "met", reasoning: "sudah dicek, oke", reviewedBy: REVIEWER }),
    "CLAUSE_REASONING_REQUIRED"
  );
  await refuses(
    "an invented verdict",
    () => clauses.review("7", "cl1", { verdict: "probably", reasoning: REASON, reviewedBy: REVIEWER }),
    "CLAUSE_VERDICT_INVALID"
  );
  await refuses(
    "an anonymous reviewer",
    () => clauses.review("7", "cl1", { verdict: "met", reasoning: REASON, reviewedBy: "nobody" }),
    "CLAUSE_REVIEWER_INVALID"
  );

  console.log("\n5. a recorded verdict releases the milestone it governs");
  // With no pinning service: the review still gates, and says it is not pinned
  // rather than implying a citation it does not have.
  pinning = { mode: "unavailable" };
  const verdict = await clauses.review("7", "cl1", { verdict: "met", reasoning: REASON, reviewedBy: REVIEWER });
  check("verdict stored", verdict.verdict, "met");
  check("no pinning service, and it says so instead of implying a CID", verdict.reasoningCid, "null");
  check("the unpinned state is named", Boolean(verdict.reasoningNotPinned), true);

  const after = clauses.assess("7", declared);
  check("inspected is released", after.milestones.inspected.blocked, false);
  check("shipped is still waiting on its own clause", after.milestones.shipped.blocked, true);

  console.log("\n6. 'met with reservation' records the reservation without stopping settlement");
  await clauses.review("7", "cl2", {
    verdict: "met_with_reservation",
    reasoning: "Karung lapis dalam tipis untuk 30 hari; eksportir menambah liner, tercatat sebagai catatan.",
    reviewedBy: REVIEWER
  });
  const reserved = clauses.assess("7", declared);
  check("shipped is released", reserved.milestones.shipped.blocked, false);
  check("the reservation is in the record", reserved.clauses[1].state, "met_with_reservation");

  console.log("\n6b. with a pinning service, the reasoning is cited by address");
  pinning = { mode: "available" };
  const pinned = await clauses.review("7", "cl2", {
    verdict: "met",
    reasoning: "Liner tambahan dipasang dan diperiksa; kemasan layak untuk 30 hari pelayaran.",
    reviewedBy: REVIEWER
  });
  check("the CID is recorded", pinned.reasoningCid, "QmTestClauseReviewCid00000000000000000000000000");
  check("and nothing claims it was not pinned", Boolean(pinned.reasoningNotPinned), false);
  check("the pinned document is named for its escrow and clause", pinning.lastFileName, "stern-clause-7-cl2.json");
  const body = JSON.parse(pinning.lastBytes.toString("utf8"));
  check("and carries its own type marker", body.stern, "stern/clause-review@1");
  check("with the verdict inside the pinned bytes", body.verdict, "met");
  pinning = { mode: "unavailable" };

  console.log("\n7. not_met blocks, and a revision is appended rather than overwriting");
  await clauses.review("7", "cl1", {
    verdict: "not_met",
    reasoning: "Pemeriksaan ulang di dermaga menemukan bau apek pada dua karung dari lot yang sama.",
    reviewedBy: OTHER
  });
  const revised = clauses.assess("7", declared);
  check("inspected is blocked again", revised.milestones.inspected.blocked, true);
  check("and for the right reason", /tidak terpenuhi/.test(revised.milestones.inspected.reason), true);
  const record = clauses.reviewsFor("7");
  check("the current verdict is the latest", record.reviews.cl1.verdict, "not_met");
  check("the earlier verdict is still legible", record.history.filter((h) => h.clauseId === "cl1")[0].verdict, "met");

  console.log("\n8. the gate the gateway actually consults");
  // clauseBlocks reads a verification object, which is what oracleService builds
  // from assess(). Tested directly because this is the function that decides
  // whether a proof transaction is sent.
  const verification = (assessment) => ({
    clausesDeclared: assessment.declared,
    clausesBlock: {
      inspected: assessment.milestones.inspected.blocked,
      shipped: assessment.milestones.shipped.blocked,
      arrived_cleared: assessment.milestones.arrived_cleared.blocked
    }
  });
  check("a blocked clause stops its milestone", clauseBlocks("inspected", verification(revised)), true);
  check("and only its milestone", clauseBlocks("shipped", verification(revised)), false);
  check("a satisfied clause does not stop it", clauseBlocks("shipped", verification(reserved)), false);

  console.log("\n9. an escrow that declared no clauses is untouched by any of this");
  // Every escrow created before this feature existed. If one of them started
  // reporting a blocked milestone, the feature would have broken the product to
  // add to it.
  const none = clauses.assess("99", []);
  check("not flagged as having clauses", none.declared, false);
  check("nothing blocked", none.milestones.inspected.blocked, false);
  check("the gate ignores it entirely", clauseBlocks("inspected", verification(none)), false);
  check(
    "even a verification with no clause fields at all",
    clauseBlocks("inspected", { eblOk: true }),
    false
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
