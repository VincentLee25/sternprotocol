const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { config, requireConfig } = require("./config");

const ESCROW_ABI = ["function idrtToken() view returns (address)"];
const IDRT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address,uint256)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)"
];

function claimsPath() {
  return config.demoClaimsFile || path.resolve(__dirname, "../../.demo-claims.json");
}
function loadClaims() {
  try { return JSON.parse(fs.readFileSync(claimsPath(), "utf8")); } catch { return {}; }
}
function saveClaims(claims) {
  const file = claimsPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claims, null, 2));
  fs.renameSync(tmp, file);
}
function validateAddress(address) {
  if (!ethers.isAddress(address || "")) {
    const error = new Error("smartAccountAddress must be a valid EVM address.");
    error.statusCode = 400;
    throw error;
  }
  return ethers.getAddress(address);
}
function getProvider() {
  requireConfig(["rpcUrl", "contractAddress"]);
  return new ethers.JsonRpcProvider(config.rpcUrl);
}
async function getToken(provider) {
  const escrow = new ethers.Contract(config.contractAddress, ESCROW_ABI, provider);
  const tokenAddress = await escrow.idrtToken();
  return new ethers.Contract(tokenAddress, IDRT_ABI, provider);
}
async function getMinterWallet(provider) {
  requireConfig(["idrtMinterPrivateKey"]);
  return new ethers.Wallet(config.idrtMinterPrivateKey, provider);
}

async function getDemoBalance(address) {
  const normalized = validateAddress(address);
  const provider = getProvider();
  const token = await getToken(provider);
  const decimals = Number(await token.decimals());
  const claims = loadClaims();
  const balance = await token.balanceOf(normalized);
  return {
    smartAccountAddress: normalized,
    balance: ethers.formatUnits(balance, decimals),
    currency: "IDRT-demo",
    hasClaimed: Boolean(claims[normalized]),
    claim: claims[normalized] || null
  };
}

async function claimDemoBalance(address, role = "importer") {
  const normalized = validateAddress(address);
  const normalizedRole = String(role || "").toLowerCase();
  if (!["importer", "exporter"].includes(normalizedRole)) {
    const error = new Error('role must be either "importer" or "exporter".');
    error.statusCode = 400;
    throw error;
  }

  const claims = loadClaims();
  if (claims[normalized]) {
    const error = new Error("Demo balance already claimed for this wallet.");
    error.statusCode = 409;
    error.code = "DEMO_BALANCE_ALREADY_CLAIMED";
    error.details = claims[normalized];
    throw error;
  }

  const provider = getProvider();
  const token = await getToken(provider);
  const minter = await getMinterWallet(provider);
  const minterRole = await token.MINTER_ROLE();
  if (!(await token.hasRole(minterRole, minter.address))) {
    const error = new Error(`Configured demo minter ${minter.address} does not have MINTER_ROLE on IDRTDemo.`);
    error.statusCode = 500;
    throw error;
  }

  const decimals = Number(await token.decimals());
  const amount = ethers.parseUnits(config.demoBalanceIdrt, decimals);
  const tx = await token.connect(minter).mint(normalized, amount);
  const receipt = await tx.wait();
  const newBalance = await token.balanceOf(normalized);
  const claim = {
    role: normalizedRole,
    amount: ethers.formatUnits(amount, decimals),
    currency: "IDRT-demo",
    transactionHash: receipt.hash,
    claimedAt: new Date().toISOString()
  };
  claims[normalized] = claim;
  saveClaims(claims);

  return {
    status: "minted",
    smartAccountAddress: normalized,
    ...claim,
    newBalance: ethers.formatUnits(newBalance, decimals)
  };
}

module.exports = { getDemoBalance, claimDemoBalance };
