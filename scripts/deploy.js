const hre = require("hardhat");

const CHALLENGE_WINDOW_SECONDS = 6 * 60 * 60;
const TIMELOCK_DURATION_SECONDS = 24 * 60 * 60;
const DISPUTE_BOND_BPS = 300;
const SLASH_BPS = 5000;
const DEMO_BALANCE_IDRT = "150000000.00";

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  const isLocalNetwork = hre.network.name === "hardhat" || hre.network.name === "localhost";
  const verifierSigners = isLocalNetwork ? [signers[1], signers[4], signers[5]] : signers.slice(1, 4);

  if (verifierSigners.length < 3 || verifierSigners.some((signer) => !signer)) {
    throw new Error(
      `Need 3 verifier signers, found ${verifierSigners.filter(Boolean).length}. ` +
        "Set ORACLE_PRIVATE_KEYS in .env to 3 comma-separated verifier private keys."
    );
  }

  const IDRTDemo = await hre.ethers.getContractFactory("IDRTDemo");
  const idrt = await IDRTDemo.deploy(deployer.address);
  await idrt.waitForDeployment();

  const SternEscrow = await hre.ethers.getContractFactory("SternEscrow");
  const sternEscrow = await SternEscrow.deploy(
    await idrt.getAddress(),
    deployer.address,
    Number(process.env.CHALLENGE_WINDOW_SECONDS || CHALLENGE_WINDOW_SECONDS),
    Number(process.env.TIMELOCK_DURATION_SECONDS || TIMELOCK_DURATION_SECONDS),
    Number(process.env.DISPUTE_BOND_BPS || DISPUTE_BOND_BPS),
    Number(process.env.SLASH_BPS || SLASH_BPS)
  );
  await sternEscrow.waitForDeployment();

  const roles = [
    [await sternEscrow.ROLE_QUALITY_AUDITOR(), "ROLE_QUALITY_AUDITOR"],
    [await sternEscrow.ROLE_LOGISTICS(), "ROLE_LOGISTICS"],
    [await sternEscrow.ROLE_CUSTOMS(), "ROLE_CUSTOMS"]
  ];
  const minBond = await sternEscrow.MIN_VERIFIER_BOND();
  const demoBalance = hre.ethers.parseUnits(process.env.DEMO_BALANCE_IDRT || DEMO_BALANCE_IDRT, 2);

  for (let i = 0; i < verifierSigners.length; i++) {
    const verifier = verifierSigners[i];
    const [role, label] = roles[i];
    await (await sternEscrow.grantVerifierRole(role, verifier.address)).wait();
    await (await idrt.mint(verifier.address, demoBalance)).wait();
    await (await idrt.connect(verifier).approve(await sternEscrow.getAddress(), minBond)).wait();
    await (await sternEscrow.connect(verifier).postVerifierBond()).wait();
    console.log(`${label}: ${verifier.address} (IDRT bond posted)`);
  }

  console.log("IDRTDemo deployed to:", await idrt.getAddress());
  console.log("SternEscrow deployed to:", await sternEscrow.getAddress());
  console.log("Admin:", deployer.address);
  console.log("Challenge window seconds:", await sternEscrow.challengeWindowSeconds());
  console.log("Timelock duration seconds:", await sternEscrow.timelockDurationSeconds());
  console.log("Dispute bond bps:", await sternEscrow.disputeBondBps());
  console.log("Slash bps:", await sternEscrow.slashBps());
  console.log("Verifier min bond:", hre.ethers.formatUnits(minBond, 2), "IDRT-demo");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
