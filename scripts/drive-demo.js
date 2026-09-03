// Menjalankan langkah-langkah yang TIDAK BISA dilakukan dari browser, terhadap
// satu escrow yang sudah kamu buat lewat UI.
//
// Bedanya dengan test-full-lifecycle.js: script itu bikin escrow-nya sendiri
// dari nol, jadi tidak nyambung dengan yang muncul di layar. Yang ini menerima
// escrowId, supaya alurnya: kamu buat escrow di browser -> jalankan ini ->
// refresh browser -> selesaikan sendiri dari UI.
//
// Kenapa harus lewat terminal: submitMilestoneProof mensyaratkan
// hasRole(requiredRole, msg.sender) + bond >= MIN_VERIFIER_BOND. Smart Account
// pengguna tidak punya keduanya, dan memang tidak boleh punya — kalau importir
// bisa menandatangani "kapal sudah berangkat" sendiri, escrow-nya tidak ada
// gunanya.
//
// Cara pakai:
//   npx hardhat run scripts/drive-demo.js --network amoy            # escrow terakhir
//   ESCROW_ID=5 npx hardhat run scripts/drive-demo.js --network amoy
//   ESCROW_ID=5 STOP_AFTER=inspected npx hardhat run scripts/drive-demo.js --network amoy
//
// STOP_AFTER berguna untuk demo dispute: berhenti setelah milestone tertentu,
// lalu nyalakan fault simulation di UI. Discrepancy hanya bisa muncul kalau
// proof-nya sudah lebih dulu ada di chain.
//
// Yang TIDAK dilakukan script ini: release. Itu sengaja ditinggalkan supaya
// tombol "Release settlement" di browser yang menyelesaikannya — itulah yang
// mau kamu tunjukkan saat demo.

const hre = require("hardhat");

const MILESTONE = { inspected: 1, shipped: 2, arrived_cleared: 3 };
const STATE = [
  "Created", "Inspected", "Shipped", "ArrivedCleared",
  "TimelockActive", "Disputed", "Completed", "Refunded"
];

const STEPS = [
  { key: "inspected", label: "Inspected", signer: 1, who: "Quality Auditor" },
  { key: "shipped", label: "Shipped", signer: 2, who: "Logistics" },
  { key: "arrived_cleared", label: "Arrived & cleared", signer: 3, who: "Customs" }
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const truePayload = () => hre.ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS belum diisi di .env.");

  // Urutan signer sama persis dengan scripts/deploy.js: [deployer, auditor, logistics, customs]
  const signers = await hre.ethers.getSigners();
  const [, auditor, logistics, customs] = signers;
  if (!auditor || !logistics || !customs) {
    throw new Error("ORACLE_PRIVATE_KEYS harus berisi 3 key: Quality Auditor, Logistics, Customs.");
  }

  const escrow = await hre.ethers.getContractAt("SternEscrow", contractAddress);

  // Tanpa ESCROW_ID, ambil yang terakhir dibuat — biasanya itu yang barusan
  // kamu buat dari browser.
  let escrowId = process.env.ESCROW_ID;
  if (!escrowId) {
    const next = await escrow.nextEscrowId();
    if (next === 0n) throw new Error("Belum ada escrow sama sekali di kontrak ini. Buat dulu lewat UI.");
    escrowId = (next - 1n).toString();
    console.log(`ESCROW_ID tidak diisi, memakai escrow terakhir: #${escrowId}`);
  }

  const view = await escrow.getEscrow(escrowId);
  const challengeWindow = Number(await escrow.challengeWindowSeconds());
  const timelockDuration = Number(await escrow.timelockDurationSeconds());

  console.log(`\nEscrow #${escrowId} — ${view.commodity} (${view.containerRef})`);
  console.log(`  importer  ${view.importer}`);
  console.log(`  exporter  ${view.exporter}`);
  console.log(`  state     ${STATE[Number(view.state)]}`);
  console.log(`  challenge window ${challengeWindow}s | timelock ${timelockDuration}s`);

  if (challengeWindow > 300) {
    console.log(
      `\n  PERINGATAN: challenge window ${challengeWindow}s (~${Math.round(challengeWindow / 60)} menit).` +
      "\n  Script ini akan benar-benar menunggu selama itu, dua kali. Untuk demo," +
      "\n  deploy ulang dengan CHALLENGE_WINDOW_SECONDS pendek."
    );
  }

  const verifiers = [null, auditor, logistics, customs];
  const stopAfter = (process.env.STOP_AFTER || "").trim().toLowerCase();

  for (const step of STEPS) {
    // State escrow dibaca ulang tiap langkah, jadi script ini aman dijalankan
    // dua kali: milestone yang sudah lewat akan dilewati, bukan gagal.
    const current = Number((await escrow.getEscrow(escrowId)).state);
    if (current >= MILESTONE[step.key]) {
      console.log(`\n[skip] ${step.label} sudah terverifikasi.`);
      continue;
    }
    if (current !== MILESTONE[step.key] - 1) {
      throw new Error(
        `Tidak bisa submit ${step.label}: state sekarang ${STATE[current]}. ` +
        "Kontrak memaksa urutan Inspected -> Shipped -> ArrivedCleared."
      );
    }

    const signer = verifiers[step.signer];
    console.log(`\n[${step.key}] ${step.who} (${signer.address}) menandatangani...`);
    const tx = await escrow
      .connect(signer)
      .submitMilestoneProof(escrowId, MILESTONE[step.key], `bafy-demo-${escrowId}-${step.key}`, truePayload());
    const receipt = await tx.wait();
    console.log(`  ok — tx ${receipt.hash}`);

    if (stopAfter === step.key) {
      console.log(
        `\nBerhenti setelah ${step.label} (STOP_AFTER).` +
        "\nProof-nya sekarang ada di chain. Nyalakan fault simulation di UI untuk" +
        "\nmemunculkan discrepancy, lalu buka dispute dari browser."
      );
      return;
    }

    // Milestone berikutnya ditolak kontrak sampai challenge window lewat:
    //   require(block.timestamp > proofs[...].challengeDeadline, "challenge window open")
    if (step.key !== "arrived_cleared") {
      console.log(`  menunggu challenge window ${challengeWindow}s...`);
      await sleep((challengeWindow + 5) * 1000);
    }
  }

  const afterMilestones = Number((await escrow.getEscrow(escrowId)).state);
  if (afterMilestones === 3) {
    console.log("\nSemua milestone terverifikasi. Memulai timelock...");
    await (await escrow.initiateTimelock(escrowId)).wait();
    console.log(`  menunggu timelock ${timelockDuration}s...`);
    await sleep((timelockDuration + 5) * 1000);
  }

  const final = await escrow.getEscrow(escrowId);
  const eligible = await escrow.isReleaseEligible(escrowId);
  console.log(`\nSelesai. State: ${STATE[Number(final.state)]} | release eligible: ${eligible}`);
  console.log(
    "\nSekarang refresh browser dan klik \"Release settlement\" di UI." +
    "\nLangkah terakhir sengaja tidak dilakukan script ini — itu bagian yang mau kamu tunjukkan."
  );
}

main().catch((error) => {
  console.error("\nGAGAL:", error.reason || error.message);
  process.exit(1);
});
