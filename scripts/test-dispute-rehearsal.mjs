// disputeRehearsal is the whole point of the new button: it must pick the
// right milestone, the right fault, and refuse honestly when neither exists.
// Imported relative to this file so the suite runs from any checkout on any
// platform, rather than only where it was written.
const { disputeRehearsal, openWindows } = await import(
  new URL("../frontend/src/lib/evidence.js", import.meta.url)
);

let pass = 0, fail = 0;
const check = (l, a, e) => { String(a) === String(e) ? (pass++, console.log(`  ok   ${l} = ${a}`)) : (fail++, console.log(`  FAIL ${l} — mau ${e}, dapat ${a}`)); };
const NOW = 1_000_000;

const ev = (comparison) => ({ comparison, onchain: {} });
const proof = (submitted, deadlineOffset, discrepancy = false) => ({
  onchainProofSubmitted: submitted,
  discrepancyAfterCommit: discrepancy,
  challengeDeadlineUnix: deadlineOffset == null ? null : String(NOW + deadlineOffset)
});

console.log("\n1. belum ada proof");
let r = disputeRehearsal(ev({ inspected: proof(false, null) }), NOW);
check("possible", r.possible, false);
check("alasannya soal verify", /verify a milestone first/i.test(r.reason), true);

console.log("\n2. satu proof, jendela terbuka");
r = disputeRehearsal(ev({ inspected: proof(true, 80) }), NOW);
check("possible", r.possible, true);
check("milestone", r.milestone, "inspected");
check("fault yang dipilih", r.fault, "inspection");
check("sisa detik", r.secondsLeft, 80);

console.log("\n3. dua proof, harus pilih yang paling baru");
r = disputeRehearsal(ev({ inspected: proof(true, 10), shipped: proof(true, 90) }), NOW);
check("milestone", r.milestone, "shipped");
check("fault", r.fault, "ais");
check("sisa detik", r.secondsLeft, 90);

console.log("\n4. milestone ketiga");
r = disputeRehearsal(ev({ inspected: proof(true, -500), shipped: proof(true, -100), arrived_cleared: proof(true, 85) }), NOW);
check("milestone", r.milestone, "arrived_cleared");
check("fault", r.fault, "customs");

console.log("\n5. semua jendela sudah tutup");
r = disputeRehearsal(ev({ inspected: proof(true, -500), shipped: proof(true, -100) }), NOW);
check("possible", r.possible, false);
check("alasannya soal jendela tutup", /past its challenge window/i.test(r.reason), true);

console.log("\n6. jendela terbuka dan sudah ada ketidaksesuaian");
r = disputeRehearsal(ev({ shipped: proof(true, 60, true) }), NOW);
check("possible", r.possible, true);
check("alreadyDiscrepant", r.alreadyDiscrepant, true);

console.log("\n7. tepat di detik nol dianggap tutup");
r = disputeRehearsal(ev({ shipped: proof(true, 0) }), NOW);
check("possible", r.possible, false);

console.log("\n8. openWindows untuk hitung mundur per baris");
const w = openWindows(ev({ inspected: proof(true, -30), shipped: proof(true, 45), arrived_cleared: proof(false, null) }), NOW);
check("jumlah baris", w.length, 2);
check("inspected sudah minus", w.find(x => x.key === "inspected").secondsLeft, -30);
check("shipped sisa 45", w.find(x => x.key === "shipped").secondsLeft, 45);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
