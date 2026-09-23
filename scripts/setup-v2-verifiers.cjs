// Idempotent V2 verifier setup. Never alters the legacy escrow.
// Run without --apply to inspect; --apply grants the existing verifier roles
// and posts only the shortfall of each required bond.
require("dotenv").config();
const { ethers } = require("ethers");

const LEGACY = "0xd281f2B9f9C26144EB7303F0f3F7cdB797E93468";
const V2 = "0x31a1EbDEaA206ef060747550a235E0B45c99980c";
const TOKEN = "0xA35565f63ab61b299970BEc1518B692b14AEf244";
const escrowAbi = [
  "function idrtToken() view returns (address)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function ROLE_QUALITY_AUDITOR() view returns (bytes32)",
  "function ROLE_LOGISTICS() view returns (bytes32)",
  "function ROLE_CUSTOMS() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function grantVerifierRole(bytes32,address)",
  "function MIN_VERIFIER_BOND() view returns (uint256)",
  "function verifierBonds(address) view returns (uint256)",
  "function postVerifierBond()"
];
const tokenAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];
const roles = ["ROLE_QUALITY_AUDITOR", "ROLE_LOGISTICS", "ROLE_CUSTOMS"];
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

async function main() {
  const apply = process.argv.includes("--apply");
  const keys = (process.env.ORACLE_PRIVATE_KEYS || "").split(",").map(value => value.trim()).filter(Boolean);
  if (keys.length !== 3) throw new Error("Exactly three existing ORACLE_PRIVATE_KEYS are required.");
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("Existing admin key is required.");
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  if ((await provider.getNetwork()).chainId !== 80002n) throw new Error("RPC is not Polygon Amoy.");
  const admin = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const verifiers = keys.map(key => new ethers.Wallet(key, provider));
  const legacy = new ethers.Contract(LEGACY, escrowAbi, provider);
  const v2 = new ethers.Contract(V2, escrowAbi, provider);
  const token = new ethers.Contract(TOKEN, tokenAbi, provider);
  if (!same(await legacy.idrtToken(), TOKEN) || !same(await v2.idrtToken(), TOKEN)) {
    throw new Error("Legacy/V2 IDRT token mismatch.");
  }
  if (!(await v2.hasRole(await v2.DEFAULT_ADMIN_ROLE(), admin.address))) {
    throw new Error("Configured admin does not administer V2.");
  }
  const minBond = await v2.MIN_VERIFIER_BOND();
  const plan = [];
  for (let i = 0; i < verifiers.length; i++) {
    const verifier = verifiers[i];
    const role = await v2[roles[i]]();
    if (!(await legacy.hasRole(await legacy[roles[i]](), verifier.address))) {
      throw new Error("A configured verifier does not hold its established legacy role.");
    }
    const [hasRole, bond, balance] = await Promise.all([
      v2.hasRole(role, verifier.address),
      v2.verifierBonds(verifier.address),
      token.balanceOf(verifier.address)
    ]);
    const shortfall = bond >= minBond ? 0n : minBond - bond;
    if (balance < shortfall) {
      throw new Error("Existing verifier " + (i + 1) + " lacks IDRT for its V2 bond. No role or bond was changed.");
    }
    plan.push({ verifier, role, hasRole, shortfall });
    console.log("Verifier " + (i + 1) + ": " + verifier.address + ", V2 role=" + hasRole + ", bond shortfall=" + shortfall.toString());
  }
  if (!apply) return console.log("Read-only V2 setup check complete.");
  for (let i = 0; i < plan.length; i++) {
    const { verifier, role, hasRole, shortfall } = plan[i];
    if (!hasRole) await (await v2.connect(admin).grantVerifierRole(role, verifier.address)).wait();
    if (shortfall > 0n) {
      const allowance = await token.allowance(verifier.address, V2);
      if (allowance < shortfall) await (await token.connect(verifier).approve(V2, shortfall)).wait();
      await (await v2.connect(verifier)["postVerifierBond()"]()).wait();
    }
    const ready = await v2.hasRole(role, verifier.address) &&
      (await v2.verifierBonds(verifier.address)) >= minBond;
    if (!ready) throw new Error("Verifier " + (i + 1) + " is not ready after setup.");
    console.log("Verifier " + (i + 1) + " ready on V2.");
  }
}

main().catch(error => {
  console.error("V2 verifier setup blocked:", error.shortMessage || error.reason || error.message);
  process.exitCode = 1;
});
