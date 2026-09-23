// Deploys only a fresh SternEscrow implementation. It intentionally does not
// deploy IDRTDemo, alter the existing escrow contract, or update application
// configuration.
const hre = require("hardhat");

const IDRT_TOKEN = "0xA35565f63ab61b299970BEc1518B692b14AEf244";
const ADMIN = "0x0d87D6554b4Df3b5f910263e399900AA320B96a4";
const CHALLENGE_WINDOW_SECONDS = 30;
const TIMELOCK_DURATION_SECONDS = 60;
const DISPUTE_BOND_BPS = 300;
const SLASH_BPS = 5000;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (deployer.address.toLowerCase() !== ADMIN.toLowerCase()) {
    throw new Error("Configured deployer does not match the established STERN admin.");
  }

  const SternEscrow = await hre.ethers.getContractFactory("SternEscrow");
  const sternEscrow = await SternEscrow.deploy(
    IDRT_TOKEN,
    ADMIN,
    CHALLENGE_WINDOW_SECONDS,
    TIMELOCK_DURATION_SECONDS,
    DISPUTE_BOND_BPS,
    SLASH_BPS
  );
  await sternEscrow.waitForDeployment();

  const address = await sternEscrow.getAddress();
  const deployment = sternEscrow.deploymentTransaction();
  const receipt = await deployment.wait();
  const selector = hre.ethers.id("resolveDisputeByAgreement(uint256,uint256,string)").slice(2).toLowerCase();
  const bytecode = (await hre.ethers.provider.getCode(address)).toLowerCase();

  if (!bytecode.includes(selector)) throw new Error("V2 bytecode does not contain resolveDisputeByAgreement.");
  if ((await sternEscrow.timelockDurationSeconds()) !== 60n) throw new Error("V2 timelock is not 60 seconds.");

  console.log(`SternEscrow V2: ${address}`);
  console.log(`Deployment transaction: ${deployment.hash}`);
  console.log(`Deployment block: ${receipt.blockNumber}`);
  console.log(`IDRT token: ${await sternEscrow.idrtToken()}`);
  console.log(`Admin: ${await sternEscrow.treasuryAddress()}`);
  console.log(`Timelock duration seconds: ${await sternEscrow.timelockDurationSeconds()}`);
  console.log(`resolveDisputeByAgreement selector present: true`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
