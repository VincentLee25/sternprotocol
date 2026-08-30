import { ethers } from "ethers";

export const sternEscrowAbi = [
  "event EscrowCreated(uint256 indexed escrowId, address indexed importer, address indexed exporter, address arbiter, uint256 value, string documentCid, uint256 globalDeadline)",
  "event MilestoneVerified(uint256 indexed escrowId, uint8 milestone, address indexed verifier, string proofCid, uint256 challengeDeadline)",
  "event TimelockStarted(uint256 indexed escrowId, uint256 releaseAt)",
  "event PaymentReleased(uint256 indexed escrowId, address indexed exporter, uint256 amount)",
  "event Refunded(uint256 indexed escrowId, address indexed importer, uint256 amount)",
  "event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, uint8 contestedMilestone, uint256 bondAmount)",
  "event DisputeResolved(uint256 indexed escrowId, bool releasedToExporter, string reasoningCid, bool verifierSlashed)",
  "function nextEscrowId() view returns (uint256)",
  "function challengeWindowSeconds() view returns (uint256)",
  "function timelockDurationSeconds() view returns (uint256)",
  "function disputeBondBps() view returns (uint256)",
  "function slashBps() view returns (uint256)",
  "function MIN_VERIFIER_BOND() view returns (uint256)",
  "function idrtToken() view returns (address)",
  "function isReleaseEligible(uint256 escrowId) view returns (bool)",
  "function verifierBonds(address verifier) view returns (uint256)",
  "function verifierSlashCount(address verifier) view returns (uint256)",
  "function getMilestoneProof(uint256 escrowId,uint8 milestone) view returns ((bool submitted,address verifier,string proofCid,uint256 submittedAtBlock,uint256 challengeDeadline))",
  "function getDispute(uint256 escrowId) view returns ((bool open,address raisedBy,uint256 bondAmount,uint8 disputedMilestone,address resolvedVerifier,string reasoningCid,bool releaseToExporter))",
  "function createEscrow(address exporter,address arbiter,string documentCid,uint256 contractValue,uint256 globalDeadline,string commodity,string containerRef) returns (uint256)",
  "function createEscrowWithPermit(address exporter,address arbiter,string documentCid,uint256 contractValue,uint256 globalDeadline,string commodity,string containerRef,uint256 permitDeadline,uint8 v,bytes32 r,bytes32 s) returns (uint256)",
  "function submitMilestoneProof(uint256 escrowId,uint8 milestone,string proofCid,bytes automatedCheckPayload)",
  "function initiateTimelock(uint256 escrowId)",
  "function releasePayment(uint256 escrowId)",
  "function claimRefund(uint256 escrowId)",
  "function raiseDispute(uint256 escrowId,uint8 contestedMilestone)",
  "function resolveDispute(uint256 escrowId,bool releaseToExporter,string reasoningCid,bool slashVerifier,bool bondFrivolous)",
  "function getEscrow(uint256 escrowId) view returns ((uint256 contractValue,address importer,address exporter,address arbiter,string documentCid,string commodity,string containerRef,uint256 globalDeadline,uint256 createdAt,uint8 state,uint256 timelockReleaseAt))"
];

export const idrtDemoAbi = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

export async function getBrowserContract({ requireSigner = true } = {}) {
  if (!window.ethereum) {
    throw new Error("No injected wallet found");
  }

  const address = import.meta.env.VITE_CONTRACT_ADDRESS;

  if (!address) {
    throw new Error("Missing VITE_CONTRACT_ADDRESS");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  if (!requireSigner) {
    return new ethers.Contract(address, sternEscrowAbi, provider);
  }

  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new ethers.Contract(address, sternEscrowAbi, signer);
}

export async function getBrowserIdrtContract(tokenAddress, { requireSigner = true } = {}) {
  if (!window.ethereum) {
    throw new Error("No injected wallet found");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  if (!requireSigner) {
    return new ethers.Contract(tokenAddress, idrtDemoAbi, provider);
  }

  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return new ethers.Contract(tokenAddress, idrtDemoAbi, signer);
}
