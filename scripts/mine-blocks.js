const hre = require("hardhat");

async function main() {
  const blocks = Number(process.env.BLOCKS || 128);
  const hexBlocks = `0x${blocks.toString(16)}`;

  await hre.network.provider.send("hardhat_mine", [hexBlocks]);
  console.log(`Mined ${blocks} block(s)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
