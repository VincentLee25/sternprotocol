const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { config, requireConfig } = require("./config");

const MILESTONES = {
  none: 0,
  inspected: 1,
  shipped: 2,
  arrivedcleared: 3,
  arrived_cleared: 3,
  arrivedCleared: 3
};

function loadAbi() {
  const artifactPath = path.resolve(
    __dirname,
    "../../artifacts/contracts/SternEscrow.sol/SternEscrow.json"
  );

  if (!fs.existsSync(artifactPath)) {
    const error = new Error("Contract artifact not found. Run `npm run compile` first.");
    error.statusCode = 400;
    throw error;
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
}

function getProvider() {
  requireConfig(["rpcUrl", "contractAddress"]);
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

function getVerifierWallets(provider) {
  requireConfig(["oraclePrivateKeys"]);
  return config.oraclePrivateKeys.map((key) => new ethers.Wallet(key, provider));
}

function getArbiterWallet(provider) {
  requireConfig(["arbiterPrivateKey"]);
  return new ethers.Wallet(config.arbiterPrivateKey, provider);
}

function getContract(signerOrProvider) {
  return new ethers.Contract(config.contractAddress, loadAbi(), signerOrProvider);
}

function normalizeMilestone(milestone) {
  const key = String(milestone || "").replace(/[\s-]/g, "_");
  const value = MILESTONES[key] ?? MILESTONES[key.toLowerCase()];
  if (value === undefined) {
    const error = new Error(`Unknown milestone: ${milestone}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function pickVerifier(wallets, milestone) {
  const index = normalizeMilestone(milestone) - 1;
  if (index < 0 || index >= wallets.length) {
    const error = new Error(`No verifier key configured for milestone ${milestone}`);
    error.statusCode = 400;
    throw error;
  }
  return wallets[index];
}

function milestonePassed(milestone, verification) {
  const normalized = normalizeMilestone(milestone);
  if (normalized === MILESTONES.inspected) return verification.vgmMatch === true && verification.inspectionPassed === true;
  if (normalized === MILESTONES.shipped) return verification.aisDeparted === true;
  if (normalized === MILESTONES.arrivedcleared) return verification.ceisaApproved === true;
  return true;
}

async function submitMilestoneProof(contractId, milestone, proofCid, verification) {
  const provider = getProvider();
  const wallets = getVerifierWallets(provider);
  const wallet = pickVerifier(wallets, milestone);
  const contract = getContract(wallet);
  const passed = milestonePassed(milestone, verification);
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [passed]);

  const tx = await contract.submitMilestoneProof(contractId, normalizeMilestone(milestone), proofCid, payload);
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    verifier: wallet.address,
    milestone,
    automatedCheckPassed: passed
  };
}

async function raiseDispute(contractId, contestedMilestone = "none") {
  const provider = getProvider();
  const [wallet] = getVerifierWallets(provider);
  const tx = await getContract(wallet).raiseDispute(contractId, normalizeMilestone(contestedMilestone));
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

async function resolveDispute(contractId, options = {}) {
  const provider = getProvider();
  const wallet = getArbiterWallet(provider);
  const tx = await getContract(wallet).resolveDispute(
    contractId,
    Boolean(options.releaseToExporter),
    options.reasoningCid || "bafy-dispute-reason-demo",
    Boolean(options.slashVerifier),
    Boolean(options.bondFrivolous)
  );
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
}

module.exports = { submitMilestoneProof, raiseDispute, resolveDispute, normalizeMilestone };
