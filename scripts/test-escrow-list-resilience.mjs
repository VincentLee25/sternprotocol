// One escrow that will not load must not empty the dashboard.
//
// The reported failure: GET /escrows/16 times out, and the whole list goes with
// it — nine escrows that had already answered are discarded to report the one
// that had not, and the page shows a gateway error instead of the trade data it
// is holding.
//
// Two causes, and both had to go:
//   1. Promise.all rejects on the first failure and abandons the rest.
//   2. Overview wrapped the list AND every per-escrow read in one
//      AbortController on a 15s timer, so the slowest row cancelled the others.
//
// This drives the shipped function with an injected reader, so what is checked
// is the real decision logic rather than a copy of it.
import { settleRowDetails, retryFailedRows } from "../frontend/src/lib/escrowSource.js";

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

// What GET /escrows already returned for each escrow: parties, value, state.
// The per-escrow call adds milestones, the dispute and release eligibility.
const listRow = (id) => ({
  escrowId: String(id),
  commodity: `Shipment ${id}`,
  containerRef: `TGHU-${id}`,
  value: "450000.00",
  contractValue: "45000000",
  decimals: 2,
  documentCid: "QmDoc",
  globalDeadline: "2026-10-07T22:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  state: "Inspected",
  importer: "0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381",
  exporter: "0x0997657e121213909bE3E9d7701df0753Fb102ed",
  arbiter: "0x1B2C3d4E5f60718293A4b5C6d7E8f90A1b2C3d4E",
  contractAddress: "0xAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaaAAaa"
});

const detailFor = (id) => ({
  ...listRow(id),
  milestones: { inspected: { submitted: true }, shipped: { submitted: false }, arrived_cleared: { submitted: false } },
  dispute: { open: false },
  releaseEligible: false
});

// Six escrows; #16 is the one that hangs, as reported.
const ROWS = [11, 12, 13, 14, 15, 16].map(listRow);

function timeout(id) {
  const error = new Error("Timed out after 12s.");
  error.code = "ESCROW_DETAIL_TIMEOUT";
  error.name = "TimeoutError";
  error.escrowId = id;
  return error;
}

async function main() {
  console.log("\n1. five succeed, one times out");
  const settled = await settleRowDetails(ROWS, async (row) => {
    if (row.escrowId === "16") throw timeout("16");
    return { ...detailFor(Number(row.escrowId)), id: row.escrowId, source: "gateway" };
  });

  check("every escrow is still a row", settled.length, 6);
  check("the five that answered are complete", settled.filter((r) => !r.detailError).length, 5);
  check("and the one that did not is kept, not dropped", settled.filter((r) => r.detailError).length, 1);

  const broken = settled.find((r) => r.detailError);
  check("the failed row is #16", broken.id, 16);
  // The point of keeping it: GET /escrows already knew this much.
  check("it still shows what the list knew", broken.commodity, "Shipment 16");
  check("its value", broken.value, "450000.00");
  check("and its state", broken.state, "Inspected");
  check("the reason is carried for debugging", broken.detailErrorCode, "ESCROW_DETAIL_TIMEOUT");
  check("with the message", /Timed out/.test(broken.detailError), true);

  // "0 of 3 verified" on an escrow whose milestones were never read would be
  // the page inventing a fact. Unknown is not zero.
  check("milestones are unknown, not zero", broken.milestones, "null");
  check("and so is the verified count", broken.verified, "null");

  const good = settled.find((r) => r.id === "11" || r.id === 11);
  check("a successful row keeps its milestones", Boolean(good.milestones), true);
  check("and carries no error", Boolean(good.detailError), false);

  console.log("\n2. all six failing is still six rows, not an empty page");
  const allFailed = await settleRowDetails(ROWS, async (row) => {
    throw timeout(row.escrowId);
  });
  check("six rows", allFailed.length, 6);
  check("each with its own error", allFailed.every((r) => r.detailError), true);

  console.log("\n3. refresh retries only what failed");
  let reads = 0;
  const repaired = await retryFailedRows(settled, {
    fetchDetail: async (row) => {
      reads += 1;
      return { ...detailFor(Number(row.escrowId)), id: row.escrowId, source: "gateway" };
    }
  });
  check("one read, not six", reads, 1);
  check("still six rows", repaired.length, 6);
  check("and none broken now", repaired.filter((r) => r.detailError).length, 0);
  check("the repaired row has its milestones", Boolean(repaired.find((r) => String(r.id) === "16").milestones), true);
  check("the rows that were fine were not touched", repaired[0].commodity, "Shipment 11");

  console.log("\n4. a retry that fails again keeps the row and the reason");
  const stillBroken = await retryFailedRows(settled, {
    fetchDetail: async (row) => {
      throw timeout(row.escrowId);
    }
  });
  check("the row survives a second failure", stillBroken.length, 6);
  check("and still says why", Boolean(stillBroken.find((r) => String(r.id) === "16").detailError), true);

  console.log("\n5. nothing failed, nothing re-read");
  let untouched = 0;
  const clean = await retryFailedRows(repaired, {
    fetchDetail: async () => {
      untouched += 1;
      return {};
    }
  });
  check("no reads at all", untouched, 0);
  check("rows returned unchanged", clean.length, 6);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
