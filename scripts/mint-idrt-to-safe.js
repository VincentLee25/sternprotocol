const hre = require("hardhat");

async function main() {
  const safe = process.env.SAFE_ADDRESS;
  const amount = process.env.IDRT_AMOUNT || "1000";
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!safe || !hre.ethers.isAddress(safe)) throw new Error("Set SAFE_ADDRESS to the Particle-created Safe address.");
  if (!contractAddress || !hre.ethers.isAddress(contractAddress)) throw new Error("Set CONTRACT_ADDRESS to the deployed SternEscrow address.");

  const [admin] = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("SternEscrow", contractAddress, admin);
  const tokenAddress = await escrow.idrtToken();
  const idrt = await hre.ethers.getContractAt("IDRTDemo", tokenAddress, admin);
  const decimals = await idrt.decimals();
  const units = hre.ethers.parseUnits(amount, decimals);

  const before = await idrt.balanceOf(safe);
  const tx = await idrt.mint(safe, units);
  const receipt = await tx.wait();
  const after = await idrt.balanceOf(safe);

  console.log("SternEscrow:", contractAddress);
  console.log("IDRTDemo:", tokenAddress);
  console.log("Admin:", admin.address);
  console.log("Safe:", safe);
  console.log("Minted:", amount, "IDRT");
  console.log("Balance before:", hre.ethers.formatUnits(before, decimals));
  console.log("Balance after:", hre.ethers.formatUnits(after, decimals));
  console.log("Tx:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
