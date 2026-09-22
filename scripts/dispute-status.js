// Says whether a dispute can be raised on an escrow right now, and when it
// cannot, which of the three conditions is missing.
//
//   node scripts/dispute-status.js 20
//   GATEWAY=https://your-app.up.railway.app node scripts/dispute-status.js 20
//
// "Review dispute" appears only when all three hold at the same moment:
//
//   1. a proof is committed on chain for that milestone
//   2. the source that proof was based on now disagrees
//   3. that milestone's challenge window is still open, by the CHAIN's clock
//
// Rehearsing this is fiddly because the third condition expires on its own,
// and the panel gives one sentence for every way it can fail. This prints the
// state of each condition per milestone, so the answer is a fact rather than a
// guess — and the seconds remaining, which is the number that actually decides
// whether there is time to press the button.
const GATEWAY = (process.env.GATEWAY || "http://localhost:4000").replace(/\/+$/, "");
const ESCROW = process.argv[2];

// Which source feeds which milestone. Getting this backwards is the most
// common reason a fault produces no discrepancy: switching on `ais` cannot
// make the Inspected milestone disagree, because Inspected was never based on
// AIS.
const FEEDS = {
  inspected: "VGM + inspection — use fault: vgm, inspection, or quality",
  shipped: "AIS — use fault: ais or logistics",
  arrived_cleared: "CEISA — use fault: customs or ceisa"
};

const LABEL = {
  inspected: "Inspected",
  shipped: "Shipped",
  arrived_cleared: "Arrived & cleared"
};

function mark(ok) {
  return ok ? "ya " : "TIDAK";
}

function human(seconds) {
  if (seconds == null) return "—";
  if (seconds <= 0) return "sudah tutup";
  if (seconds < 60) return `${seconds} detik lagi`;
  return `${Math.floor(seconds / 60)} menit ${seconds % 60} detik lagi`;
}

async function main() {
  if (!ESCROW) {
    console.error("Sebutkan id escrow-nya, misal: node scripts/dispute-status.js 20");
    process.exit(2);
  }

  const evidence = await fetch(`${GATEWAY}/oracle/evidence/${ESCROW}`).then((r) => {
    if (!r.ok) throw new Error(`gateway menjawab HTTP ${r.status}`);
    return r.json();
  });

  const fault = evidence.simulation?.enabled ? evidence.simulation.fault : "none";
  console.log(`gateway : ${GATEWAY}`);
  console.log(`escrow  : ${ESCROW}`);
  console.log(`fault   : ${fault}${fault === "none" ? "  (tidak ada ketidaksesuaian yang bisa dibuat)" : ""}`);

  // The local clock is only used to show the countdown. The gateway already
  // decided `actionable` against block.timestamp, and the contract has the
  // final say — see the note under disputeDemo below.
  const now = Math.floor(Date.now() / 1000);

  console.log("\nper milestone:");
  console.log("  milestone            proof?  sumber gagal?  jendela          sisa");
  for (const key of ["inspected", "shipped", "arrived_cleared"]) {
    const cmp = evidence.comparison?.[key] || {};
    const deadline = cmp.challengeDeadlineUnix ? Number(cmp.challengeDeadlineUnix) : null;
    const left = deadline ? deadline - now : null;
    const open = left != null && left > 0;
    console.log(
      `  ${LABEL[key].padEnd(20)} ${mark(Boolean(cmp.onchainProofSubmitted)).padEnd(7)} ` +
        `${mark(cmp.currentSourcePasses === false).padEnd(14)} ` +
        `${(open ? "terbuka" : deadline ? "tutup" : "—").padEnd(16)} ${human(left)}`
    );
  }

  const opportunity = evidence.disputeDemo || {};
  console.log(`\ndisputeDemo.actionable : ${opportunity.actionable}`);
  console.log(`alasan gateway         : ${opportunity.reason || "—"}`);

  if (opportunity.actionable) {
    const target = (evidence.committedDiscrepancies || [])[0] || {};
    const left = target.challengeDeadlineUnix ? Number(target.challengeDeadlineUnix) - now : null;
    console.log(
      `\nBISA. Buka escrow-nya, panel Evidence akan menampilkan "Review dispute"` +
        ` untuk ${LABEL[target.milestone] || target.milestone}. Sisa ${human(left)} — jangan menunggu.`
    );
    process.exit(0);
  }

  // Name the missing condition rather than repeating that it is not available.
  console.log("\nBELUM BISA. Yang kurang:");

  const rows = ["inspected", "shipped", "arrived_cleared"].map((key) => {
    const cmp = evidence.comparison?.[key] || {};
    const deadline = cmp.challengeDeadlineUnix ? Number(cmp.challengeDeadlineUnix) : null;
    return {
      key,
      submitted: Boolean(cmp.onchainProofSubmitted),
      sourceFails: cmp.currentSourcePasses === false,
      windowOpen: deadline != null && deadline - now > 0,
      deadline
    };
  });

  if (!rows.some((r) => r.submitted)) {
    console.log("  Belum ada proof yang ter-commit. Tekan Verify milestones dulu.");
    console.log("  Sengketa selalu tentang proof yang SUDAH ada, bukan yang belum.");
  } else if (!rows.some((r) => r.submitted && r.sourceFails)) {
    console.log("  Ada proof ter-commit, tapi belum ada sumber yang berubah jadi gagal.");
    if (fault === "none") {
      console.log("  Nyalakan Fault simulation. Petanya:");
    } else {
      console.log(`  Fault "${fault}" aktif, tapi tidak menyentuh milestone yang punya proof. Petanya:`);
    }
    for (const r of rows.filter((x) => x.submitted)) {
      console.log(`    ${LABEL[r.key]} <- ${FEEDS[r.key]}`);
    }
  } else {
    const stale = rows.filter((r) => r.submitted && r.sourceFails && !r.windowOpen);
    console.log("  Ketidaksesuaiannya ada, tapi jendela tantangannya sudah tutup:");
    for (const r of stale) {
      console.log(`    ${LABEL[r.key]} tutup pada ${new Date(r.deadline * 1000).toLocaleString("id-ID")}`);
    }
    console.log(
      "\n  Proof-nya sekarang berdiri sah dan pelunasan jalan terus. Itu rancangannya:" +
        "\n  sebuah proof dilawan di dalam jendelanya, atau tidak sama sekali."
    );
    console.log(
      "\n  Untuk mencoba lagi: buat escrow baru, commit milestone TERAKHIR lebih dulu" +
        "\n  (Verify sampai Arrived & cleared ter-commit), lalu segera nyalakan fault" +
        "\n  customs dan ajukan sengketanya. Setelah milestone ketiga tidak ada proses" +
        "\n  lain yang menunggu, jadi seluruh jendela itu milik Anda."
    );
  }

  process.exit(1);
}

main().catch((error) => {
  console.error(
    `\nGagal membaca ${GATEWAY}/oracle/evidence/${ESCROW}: ${error.message}` +
      "\nPastikan gateway-nya hidup, atau set GATEWAY ke alamat Railway Anda."
  );
  process.exit(2);
});
