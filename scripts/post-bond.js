import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const ESCROW_ABI = [
  "function MIN_VERIFIER_BOND() view returns (uint256)",
  "function verifierBonds(address) view returns (uint256)",
  "function postVerifierBond() external",
  "function idrtToken() view returns (address)"
];

const ERC20_ABI = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(
    process.env.RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com/"
  );
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("CONTRACT_ADDRESS tidak ditemukan di .env");
    process.exit(1);
  }

  const privateKeys = (process.env.ORACLE_PRIVATE_KEYS || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (privateKeys.length === 0) {
    console.error("ORACLE_PRIVATE_KEYS tidak ditemukan di .env");
    process.exit(1);
  }

  console.log(`Terdeteksi ${privateKeys.length} verifier private keys dari .env.`);

  for (let i = 0; i < privateKeys.length; i++) {
    const key = privateKeys[i].startsWith("0x") ? privateKeys[i] : `0x${privateKeys[i]}`;
    const wallet = new ethers.Wallet(key, provider);
    const escrow = new ethers.Contract(contractAddress, ESCROW_ABI, wallet);
    const idrtAddress = await escrow.idrtToken();
    const idrt = new ethers.Contract(idrtAddress, ERC20_ABI, wallet);
    const decimals = await idrt.decimals();

    console.log(`\n[Verifier ${i + 1}] Address: ${wallet.address}`);

    try {
      const minBond = await escrow.MIN_VERIFIER_BOND();
      const currentBond = await escrow.verifierBonds(wallet.address);

      console.log(`Syarat Minimal Bond : ${ethers.formatUnits(minBond, decimals)} IDRT-demo`);
      console.log(`Bond Saat Ini        : ${ethers.formatUnits(currentBond, decimals)} IDRT-demo`);

      if (currentBond >= minBond) {
        console.log(`Verifier ${i + 1} sudah punya bond yang cukup. Skip.`);
        continue;
      }

      const allowance = await idrt.allowance(wallet.address, contractAddress);
      const needed = minBond - currentBond;
      if (allowance < needed) {
        console.log(`Approve ${ethers.formatUnits(needed, decimals)} IDRT-demo untuk bond...`);
        await (await idrt.approve(contractAddress, needed)).wait();
      }

      console.log(`Menyetor ${ethers.formatUnits(needed, decimals)} IDRT-demo ke postVerifierBond()...`);
      const tx = await escrow.postVerifierBond();
      console.log(`Tx sent: ${tx.hash}. Menunggu konfirmasi...`);
      await tx.wait();
      console.log(`SUCCESS: verifier ${i + 1} berhasil post IDRT bond.`);
    } catch (err) {
      console.error(`Gagal postVerifierBond untuk verifier ${i + 1}:`, err.message);
    }
  }
}

main().catch(console.error);
