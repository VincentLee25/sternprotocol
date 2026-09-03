// Test end-to-end 1 escrow penuh: create -> Inspected -> Shipped -> ArrivedCleared
// -> Timelock -> release. Didesain buat kontrak "kembar" testing (window pendek),
// BUKAN kontrak asli 6h/24h kamu, kecuali kamu rela nunggu ~42 jam beneran.
//
// Cara pakai:
//   1. Deploy kontrak kembar dulu (window pendek):
//        CHALLENGE_WINDOW_SECONDS=60 TIMELOCK_DURATION_SECONDS=120 \
//        npx hardhat run scripts/deploy.js --network amoy
//   2. Copy address SternEscrow dari output-nya, isi sementara ke CONTRACT_ADDRESS di .env
//   3. Jalankan:
//        npx hardhat run scripts/test-full-lifecycle.js --network amoy
//   4. Setelah selesai, balikin CONTRACT_ADDRESS di .env ke kontrak asli kamu lagi.

const hre = require("hardhat");

const MILESTONE = { None: 0, Inspected: 1, Shipped: 2, ArrivedCleared: 3 };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truePayload() {
  return hre.ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [true]);
}

async function signPermit(idrt, idrtAddress, owner, spender, value, deadline) {
  const nonce = await idrt.nonces(owner.address);
  const network = await hre.ethers.provider.getNetwork();
  const domain = {
    name: await idrt.name(),
    version: "1",
    chainId: network.chainId,
    verifyingContract: idrtAddress
  };
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" }
    ]
  };
  const values = { owner: owner.address, spender, value, nonce, deadline };
  const signature = await owner.signTypedData(domain, types, values);
  return hre.ethers.Signature.from(signature);
}

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error("Set CONTRACT_ADDRESS di .env dulu -- isi address SternEscrow yang mau ditest.");
  }

  // Urutan sama persis dengan scripts/deploy.js: [deployer, auditor, logistics, customs]
  const signers = await hre.ethers.getSigners();
  const [deployer, auditor, logistics, customs] = signers;
  if (!auditor || !logistics || !customs) {
    throw new Error("Set ORACLE_PRIVATE_KEYS di .env ke 3 key (Quality Auditor, Logistics, Customs).");
  }

  const escrow = await hre.ethers.getContractAt("SternEscrow", contractAddress, deployer);
  const idrtAddress = await escrow.idrtToken();
  const idrt = await hre.ethers.getContractAt("IDRTDemo", idrtAddress, deployer);

  const contractValue = hre.ethers.parseUnits("5000000.00", 2); // Rp5.000.000 demo
  const exporterWallet = hre.ethers.Wallet.createRandom(); // cuma perlu address, gak pernah sign tx apapun

  console.log("Kontrak SternEscrow:", contractAddress);
  console.log("Kontrak IDRTDemo:", idrtAddress);
  console.log("Exporter (dummy, buat lihat saldo akhirnya):", exporterWallet.address);

  console.log("\n[1/7] Mint IDRT test balance ke importer (deployer)...");
  await (await idrt.mint(deployer.address, contractValue)).wait();

  console.log("[2/7] Sign permit (EIP-2612)...");
  const permitDeadline = Math.floor(Date.now() / 1000) + 3600;
  const { v, r, s } = await signPermit(idrt, idrtAddress, deployer, contractAddress, contractValue, permitDeadline);

  console.log("[3/7] Create escrow via createEscrowWithPermit...");
  const globalDeadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 hari
  const createTx = await escrow.createEscrowWithPermit(
    exporterWallet.address,
    deployer.address, // arbiter = deployer, cukup buat happy-path test (gak dipakai kalau gak ada dispute)
    "bafy-test-document",
    contractValue,
    globalDeadline,
    "Kopi Test",
    "TEST-0001",
    permitDeadline,
    v,
    r,
    s
  );
  const receipt = await createTx.wait();
  const parsed = receipt.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "EscrowCreated");
  const escrowId = parsed.args.escrowId;
  console.log("Escrow ID:", escrowId.toString());

  const challengeWindow = Number(await escrow.challengeWindowSeconds());
  const timelockDuration = Number(await escrow.timelockDurationSeconds());
  console.log(`Challenge window: ${challengeWindow}s | Timelock: ${timelockDuration}s`);

  async function submitMilestone(verifierSigner, milestone, label) {
    console.log(`\nSubmitting milestone ${label}...`);
    const tx = await escrow
      .connect(verifierSigner)
      .submitMilestoneProof(escrowId, milestone, `bafy-proof-${label}`, truePayload());
    await tx.wait();
    console.log(`${label} verified on-chain. Menunggu challenge window (${challengeWindow}s)...`);
    await sleep((challengeWindow + 5) * 1000);
  }

  console.log("\n[4/7] Milestone Inspected...");
  await submitMilestone(auditor, MILESTONE.Inspected, "inspected");

  console.log("[5/7] Milestone Shipped...");
  await submitMilestone(logistics, MILESTONE.Shipped, "shipped");

  console.log("[6/7] Milestone ArrivedCleared...");
  await submitMilestone(customs, MILESTONE.ArrivedCleared, "arrived-cleared");

  console.log("\nInitiating timelock...");
  await (await escrow.initiateTimelock(escrowId)).wait();
  console.log(`Menunggu timelock duration (${timelockDuration}s)...`);
  await sleep((timelockDuration + 5) * 1000);

  console.log("\n[7/7] Release payment...");
  await (await escrow.releasePayment(escrowId)).wait();

  const exporterBalance = await idrt.balanceOf(exporterWallet.address);
  console.log("\n=== HASIL ===");
  console.log("Saldo exporter setelah release:", hre.ethers.formatUnits(exporterBalance, 2), "IDRT-demo");
  console.log("Kalau angkanya 5000000.00, berarti siklus penuh sukses end-to-end.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
