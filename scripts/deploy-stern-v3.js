// Explicit V3 deployment, separate from the live legacy and V2 contracts.
// Run only after approving a new testnet deployment; this script never edits app config.
const hre = require("hardhat");

const TOKEN = "0xA35565f63ab61b299970BEc1518B692b14AEf244";
const ADMIN = "0x0d87D6554b4Df3b5f910263e399900AA320B96a4";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (deployer.address.toLowerCase() !== ADMIN.toLowerCase()) {
    throw new Error("Configured deployer is not the established STERN admin.");
  }
  const factory = await hre.ethers.getContractFactory("SternEscrowV3");
  // 30s intermediate proof challenge, 60s final dispute window,
  // 60s settlement timelock, 3% dispute bond, 50% verifier slash.
  const contract = await factory.deploy(TOKEN, ADMIN, 30, 60, 60, 300, 5000);
  await contract.waitForDeployment();
  console.log(`STERN V3 address: ${await contract.getAddress()}`);
  console.log(`Deployment tx: ${contract.deploymentTransaction().hash}`);
  console.log(`Final dispute window: ${await contract.disputeWindowSeconds()} seconds`);
  console.log(`Timelock: ${await contract.timelockDurationSeconds()} seconds`);
}

main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1; });
