// Existing verifier accounts only. Defaults to read-only; --apply writes V3 roles and bonds.
require("dotenv").config();
const { ethers } = require("ethers");

const ABI = [
  "function ROLE_QUALITY_AUDITOR() view returns (bytes32)",
  "function ROLE_LOGISTICS() view returns (bytes32)",
  "function ROLE_CUSTOMS() view returns (bytes32)",
  "function idrtToken() view returns (address)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantVerifierRole(bytes32,address)",
  "function verifierBonds(address) view returns (uint256)",
  "function MIN_VERIFIER_BOND() view returns (uint256)",
  "function postVerifierBond(uint256)"
];
const TOKEN_ABI = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
const ROLES = ["ROLE_QUALITY_AUDITOR", "ROLE_LOGISTICS", "ROLE_CUSTOMS"];

async function main() {
  const target = process.env.V3_CONTRACT_ADDRESS;
  const keys = (process.env.ORACLE_PRIVATE_KEYS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!ethers.isAddress(target || "") || keys.length !== 3 || !process.env.DEPLOYER_PRIVATE_KEY) {
    throw new Error("V3_CONTRACT_ADDRESS, existing admin key, and exactly three verifier keys are required.");
  }
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  if ((await provider.getNetwork()).chainId !== 80002n) throw new Error("RPC must be Polygon Amoy.");
  const admin = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  if (admin.address.toLowerCase() !== "0x0d87D6554b4Df3b5f910263e399900AA320B96a4") {
    throw new Error("Configured admin does not match the established STERN admin.");
  }
  const contract = new ethers.Contract(target, ABI, provider);
  const legacy = new ethers.Contract("0xd281f2B9f9C26144EB7303F0f3F7cdB797E93468", ABI, provider);
  if ((await contract.idrtToken()).toLowerCase() !== "0xA35565f63ab61b299970BEc1518B692b14AEf244".toLowerCase()) {
    throw new Error("V3 token does not match the established IDRT token.");
  }
  const token = new ethers.Contract("0xA35565f63ab61b299970BEc1518B692b14AEf244", TOKEN_ABI, provider);
  const minimum = await contract.MIN_VERIFIER_BOND();
  const apply = process.argv.includes("--apply");
  for (let i = 0; i < keys.length; i++) {
    const verifier = new ethers.Wallet(keys[i], provider);
    const role = await contract[ROLES[i]]();
    if (!(await legacy.hasRole(await legacy[ROLES[i]](), verifier.address))) {
      throw new Error(`Verifier ${i + 1} is not an established legacy verifier.`);
    }
    const [hasRole, bond] = await Promise.all([
      contract.hasRole(role, verifier.address), contract.verifierBonds(verifier.address)
    ]);
    const shortfall = bond < minimum ? minimum - bond : 0n;
    console.log(`Verifier ${i + 1}: role=${hasRole}, bond shortfall=${shortfall}`);
    if (!apply) continue;
    if (!hasRole) await (await contract.connect(admin).grantVerifierRole(role, verifier.address)).wait();
    if (shortfall > 0n) {
      if ((await token.balanceOf(verifier.address)) < shortfall) throw new Error(`Verifier ${i + 1} lacks IDRT for bond.`);
      await (await token.connect(verifier).approve(target, shortfall)).wait();
      await (await contract.connect(verifier)["postVerifierBond(uint256)"](shortfall)).wait();
    }
  }
}

main().catch(error => { console.error(error.shortMessage || error.message); process.exitCode = 1; });
