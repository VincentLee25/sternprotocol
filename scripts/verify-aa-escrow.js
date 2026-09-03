const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const safe = process.env.SAFE_ADDRESS;
  const escrowId = process.env.ESCROW_ID;

  if (!contractAddress || !hre.ethers.isAddress(contractAddress)) throw new Error("Set CONTRACT_ADDRESS.");
  if (!safe || !hre.ethers.isAddress(safe)) throw new Error("Set SAFE_ADDRESS.");
  if (!escrowId) throw new Error("Set ESCROW_ID.");

  const [reader] = await hre.ethers.getSigners();
  const escrow = await hre.ethers.getContractAt("SternEscrow", contractAddress, reader);
  const tokenAddress = await escrow.idrtToken();
  const idrt = await hre.ethers.getContractAt("IDRTDemo", tokenAddress, reader);
  const decimals = await idrt.decimals();
  const state = await escrow.getEscrow(escrowId);
  const balance = await idrt.balanceOf(safe);
  const escrowBalance = await idrt.balanceOf(contractAddress);
  const allowance = await idrt.allowance(safe, contractAddress);

  console.log(JSON.stringify({
    sternEscrow: contractAddress,
    idrt: tokenAddress,
    safe,
    escrowId,
    importer: state.importer,
    exporter: state.exporter,
    arbiter: state.arbiter,
    contractValue: hre.ethers.formatUnits(state.contractValue, decimals),
    state: Number(state.state),
    safeBalance: hre.ethers.formatUnits(balance, decimals),
    sternBalance: hre.ethers.formatUnits(escrowBalance, decimals),
    remainingAllowance: hre.ethers.formatUnits(allowance, decimals)
  }, null, 2));

  if (state.importer.toLowerCase() !== safe.toLowerCase()) throw new Error("FAIL: escrow importer is not the Safe.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
