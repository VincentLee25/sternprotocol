// Tests the rule that decides whether the e-BL stops a milestone.
//
//   node scripts/test-ebl-gate.js
//
// Needs no chain and no network: milestonePassed is a pure function over a
// verification object, and the whole point of this file is the distinction it
// draws. "The document is wrong" and "we could not look at the document" both
// arrive as eblCidValid === false, and they must not be treated the same. The
// first has to stop a milestone. The second must not, or a public IPFS gateway
// being slow for half a minute would hold up a settlement that is otherwise
// due — which is a worse failure than the one the gate exists to prevent.
process.env.PINATA_JWT = process.env.PINATA_JWT || "";

const { milestonePassed, eblBlocks } = require("../backend/oracle-gateway/contractService.js");

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (actual === expected) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} — expected ${expected}, got ${actual}`);
  }
}

// Every non-e-BL source passing, so anything that fails below fails because of
// the e-BL and nothing else.
const SOURCES_OK = {
  vgmMatch: true,
  inspectionPassed: true,
  aisDeparted: true,
  ceisaApproved: true
};

const MILESTONES = ["inspected", "shipped", "arrived_cleared"];

function forEachMilestone(label, verification, expected) {
  for (const milestone of MILESTONES) {
    check(`${label} — ${milestone}`, milestonePassed(milestone, verification), expected);
  }
}

console.log("\n1. e-BL verified: milestones proceed");
forEachMilestone("proceeds", { ...SOURCES_OK, eblCidValid: true, eblCheckable: true }, true);

console.log("\n2. e-BL checked and wrong: every milestone is stopped");
// The objection does not expire. If this is not the bill of lading for this
// container, nothing downstream of it is worth writing on chain.
forEachMilestone("stopped", { ...SOURCES_OK, eblCidValid: false, eblCheckable: true }, false);

console.log("\n3. e-BL could not be checked: milestones still proceed");
// A gateway timeout is not evidence about a shipment.
forEachMilestone("proceeds", { ...SOURCES_OK, eblCidValid: false, eblCheckable: false }, true);

console.log("\n4. the placeholder mock behaves as it always did");
// A deployment with no pinning service configured must be unaffected by all of
// this, in both directions.
forEachMilestone("proceeds", { ...SOURCES_OK, eblCidValid: true, eblCheckable: true }, true);

console.log("\n5. a verification object with no e-BL fields at all");
// Older callers build these by hand. Absent must mean "does not block".
forEachMilestone("proceeds", { ...SOURCES_OK }, true);

console.log("\n6. the e-BL does not rescue a milestone whose own source failed");
check(
  "inspected still fails when VGM fails",
  milestonePassed("inspected", { ...SOURCES_OK, vgmMatch: false, eblCidValid: true, eblCheckable: true }),
  false
);
check(
  "shipped still fails when AIS fails",
  milestonePassed("shipped", { ...SOURCES_OK, aisDeparted: false, eblCidValid: true, eblCheckable: true }),
  false
);
check(
  "arrived_cleared still fails when CEISA fails",
  milestonePassed("arrived_cleared", { ...SOURCES_OK, ceisaApproved: false, eblCidValid: true, eblCheckable: true }),
  false
);

console.log("\n7. eblBlocks on its own");
check("checked and wrong blocks", eblBlocks({ eblCidValid: false, eblCheckable: true }), true);
check("checked and right does not", eblBlocks({ eblCidValid: true, eblCheckable: true }), false);
check("unreachable does not", eblBlocks({ eblCidValid: false, eblCheckable: false }), false);
check("absent fields do not", eblBlocks({}), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
