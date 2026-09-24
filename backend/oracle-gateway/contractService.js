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

const MILESTONE_NAMES = ["none", "inspected", "shipped", "arrived_cleared"];
const STATE_NAMES = [
  "Created", "Inspected", "Shipped", "ArrivedCleared",
  "TimelockActive", "Disputed", "Completed", "Refunded"
];

const ORACLE_ROLES = [
  { index: 0, key: "quality_auditor", roleName: "ROLE_QUALITY_AUDITOR", milestone: 1, verifierName: "Quality Auditor" },
  { index: 1, key: "logistics", roleName: "ROLE_LOGISTICS", milestone: 2, verifierName: "Logistics" },
  { index: 2, key: "customs", roleName: "ROLE_CUSTOMS", milestone: 3, verifierName: "Customs" }
];

function loadAbi(generation = CONTRACT_GENERATION.LEGACY) {
  const file = generation === CONTRACT_GENERATION.V3
    ? "SternEscrowV3.sol/SternEscrowV3.json"
    : "SternEscrow.sol/SternEscrow.json";
  const artifactPath = path.resolve(__dirname, "../../artifacts/contracts", file);
  if (!fs.existsSync(artifactPath)) {
    const error = new Error("Contract artifact not found. Run `npm run compile` first.");
    error.statusCode = 400;
    error.code = "CONTRACT_ARTIFACT_MISSING";
    throw error;
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
}

// A seam for the request-count test, and only for that.
//
// scripts/test-activity-scan.js measures how many eth_getLogs a refresh costs,
// which is the thing that was wrong with it. That count has to come from the
// shipped scan rather than a copy of it, so the test substitutes a provider
// that counts calls. Null in every other case, including production, where
// these two functions behave exactly as they always did.
let testProvider = null;
let testContract = null;

const CONTRACT_GENERATION = Object.freeze({ LEGACY: "legacy", V2: "v2", V3: "v3" });

function contractAddressFor(generation) {
  const address = generation === CONTRACT_GENERATION.V3 ? config.v3ContractAddress
    : generation === CONTRACT_GENERATION.V2 ? config.v2ContractAddress : config.legacyContractAddress;
  if (!ethers.isAddress(address || "")) {
    const variable = generation === CONTRACT_GENERATION.V3 ? "V3_CONTRACT_ADDRESS"
      : generation === CONTRACT_GENERATION.V2 ? "V2_CONTRACT_ADDRESS" : "LEGACY_CONTRACT_ADDRESS or CONTRACT_ADDRESS";
    const error = new Error(`Missing ${variable}.`);
    error.statusCode = 400;
    error.code = "CONTRACT_ADDRESS_MISSING";
    throw error;
  }
  return ethers.getAddress(address);
}

// Legacy escrow IDs stay as plain numbers so all existing links and API calls
// keep working. V2 IDs are namespaced because both deployed contracts start
// their counters at zero.
function parseEscrowRef(value) {
  const raw = String(value ?? "").trim();
  const v2 = /^v2:(\d+)$/.exec(raw);
  const v3 = /^v3:(\d+)$/.exec(raw);
  const legacy = /^(\d+)$/.exec(raw);
  const match = v3 || v2 || legacy;
  if (!match || !Number.isSafeInteger(Number(match[1]))) {
    const error = new Error("escrowId must be numeric, v2:<id>, or v3:<id>.");
    error.statusCode = 400;
    error.code = "INVALID_ESCROW_ID";
    throw error;
  }
  const generation = v3 ? CONTRACT_GENERATION.V3 : v2 ? CONTRACT_GENERATION.V2 : CONTRACT_GENERATION.LEGACY;
  const id = Number(match[1]);
  return {
    generation,
    id,
    escrowId: generation === CONTRACT_GENERATION.LEGACY ? String(id) : `${generation}:${id}`,
    contractAddress: contractAddressFor(generation)
  };
}

function __setTestProviders({ provider = null, contract = null } = {}) {
  testProvider = provider;
  testContract = contract;
  resetScanCaches();
}
function getProvider() {
  if (testProvider) return testProvider;
  requireConfig(["rpcUrl"]);
  // Keep contract reads on the exact provider construction used before the
  // PostgreSQL and RPC-provider changes. This deliberately avoids
  // FetchRequest, FallbackProvider and stall timing while isolating the
  // deployed escrow read regression against the existing RPC_URL.
  return new ethers.JsonRpcProvider(config.rpcUrl);
}

function getVerifierWallets(provider) {
  requireConfig(["oraclePrivateKeys"]);
  if (config.oraclePrivateKeys.length !== 3) {
    const error = new Error("ORACLE_PRIVATE_KEYS must contain exactly 3 keys: Quality Auditor, Logistics, Customs.");
    error.statusCode = 400;
    error.code = "ORACLE_KEY_COUNT_INVALID";
    throw error;
  }
  return config.oraclePrivateKeys.map((key) => new ethers.Wallet(key, provider));
}

function getArbiterWallet(provider) {
  requireConfig(["arbiterPrivateKey"]);
  return new ethers.Wallet(config.arbiterPrivateKey, provider);
}

/**
 * Seconds since epoch as the CHAIN sees them.
 *
 * Every deadline in this contract is compared against block.timestamp, so any
 * check written against Date.now() is comparing two different clocks and will
 * be wrong at exactly the moment it matters — the edge of a window.
 */
async function chainNow(provider) {
  const block = await provider.getBlock("latest");
  return Number(block.timestamp);
}

function getContract(signerOrProvider, generation = CONTRACT_GENERATION.LEGACY) {
  if (testContract) return testContract;
  return new ethers.Contract(contractAddressFor(generation), loadAbi(generation), signerOrProvider);
}

// Does the contract at the configured address have resolveDisputeByAgreement?
//
// The ABI cannot answer this. The ABI is the artifact this repo just compiled;
// the address may hold a deployment from before the function existed, and
// calling it there reverts with nothing useful. So ask the bytecode: Solidity's
// dispatcher embeds each external function's 4-byte selector as a literal, so a
// selector that is absent from the deployed code is a function that is not
// there.
//
// Deployed code at an address never changes, so one probe per address is enough.
async function supportsAgreementSettlement(contractId) {
  // The V2 deployment was compiled with viaIR, which does not guarantee that a
  // selector appears as a raw byte sequence in the dispatcher. Its configured
  // generation is therefore the reliable contract capability boundary.
  return parseEscrowRef(contractId).generation !== CONTRACT_GENERATION.LEGACY;
}

function normalizeMilestone(milestone) {
  // MILESTONES is keyed by name, but the contract side of this file works in
  // numeric ids — so passing one straight back in threw "Unknown milestone: 1".
  // Accept the id it already returns, so a round-trip is not an error.
  if (typeof milestone === "number" || typeof milestone === "bigint") {
    const id = Number(milestone);
    if (id >= 0 && id < MILESTONE_NAMES.length) return id;
  }
  const key = String(milestone || "").replace(/[\s-]/g, "_");
  const value = MILESTONES[key] ?? MILESTONES[key.toLowerCase()];
  if (value === undefined) {
    const error = new Error(`Unknown milestone: ${milestone}`);
    error.statusCode = 400;
    error.code = "UNKNOWN_MILESTONE";
    throw error;
  }
  return value;
}

function milestoneName(value) {
  return MILESTONE_NAMES[Number(value)] || `unknown_${value}`;
}

function stateName(value) {
  return STATE_NAMES[Number(value)] || `Unknown(${value})`;
}

function toIso(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function pickVerifier(wallets, milestone) {
  const index = normalizeMilestone(milestone) - 1;
  if (index < 0 || index >= wallets.length) {
    const error = new Error(`No verifier key configured for milestone ${milestone}`);
    error.statusCode = 400;
    error.code = "VERIFIER_NOT_CONFIGURED";
    throw error;
  }
  return wallets[index];
}

/**
 * Whether the e-BL is a reason to refuse this milestone.
 *
 * Only a document that was actually retrieved and then found wrong counts —
 * wrong container, not a bill of lading, or bytes that do not hash back to the
 * address the contract stores. A check that could not run says nothing about
 * the shipment, so it must not stop a settlement: `eblCheckable` is what keeps
 * a slow IPFS gateway from looking like a failed document.
 *
 * Defaults to not blocking when the field is absent, so a caller that builds
 * a verification object by hand behaves as it did before.
 */
function eblBlocks(verification) {
  return verification.eblCheckable === true && verification.eblCidValid === false;
}

/**
 * Whether the customs documents are a reason to refuse milestone 3.
 *
 * Same shape as eblBlocks, and the distinction matters even more here. Three
 * states, not two:
 *
 *   - nothing attached (`customsDocsValid === null`): does not block. Every
 *     escrow created before customs documents existed is in this state, and
 *     refusing their third milestone retroactively would be a false refusal
 *     about a shipment that cleared perfectly well.
 *   - attached and checked and wrong: blocks. A PEB that does not resolve, or
 *     whose bytes do not hash back to its address, is not evidence of a
 *     clearance, and Cleared is the milestone that claims one.
 *   - attached but the check could not run: does not block, for the same reason
 *     a slow IPFS gateway must not hold up a settlement.
 */
function customsBlocks(verification) {
  return verification.customsDocsCheckable === true && verification.customsDocsValid === false;
}

/**
 * Whether an interpretive clause is a reason to refuse THIS milestone.
 *
 * The third blocker, after eblBlocks and customsBlocks, and the only one whose
 * default is to refuse. The other two exist to avoid false refusals — a slow
 * IPFS gateway is not evidence about a shipment. This one is the opposite: a
 * clause that a person has not answered yet SHOULD hold the milestone, because
 * the whole point of declaring it was that a machine cannot settle it.
 *
 * `clausesDeclared` is what keeps that from being retroactive. An escrow that
 * declared no clauses — every escrow created before this existed — is never
 * blocked by one.
 */
function clauseBlocks(milestone, verification) {
  if (verification.clausesDeclared !== true) return false;
  const normalized = normalizeMilestone(milestone);
  const name = MILESTONE_NAMES[normalized];
  return verification.clausesBlock?.[name] === true;
}

function milestonePassed(milestone, verification) {
  const normalized = normalizeMilestone(milestone);
  // The e-BL is the document the whole escrow is written against, so a
  // milestone cannot be committed while it is known to be the wrong document.
  // It gates every milestone rather than one, because the objection does not
  // expire: if this is not the bill of lading for this container, nothing
  // downstream of it is worth writing on chain.
  if (eblBlocks(verification)) return false;
  // A term the parties wrote into the instrument, that a named person has to
  // judge, and that nobody has judged yet. Committing the proof anyway would
  // settle the objective half of a condition and quietly drop the other half.
  if (clauseBlocks(normalized, verification)) return false;
  if (normalized === MILESTONES.inspected) {
    return verification.vgmMatch === true && verification.inspectionPassed === true;
  }
  if (normalized === MILESTONES.shipped) return verification.aisDeparted === true;
  if (normalized === MILESTONES.arrivedcleared) {
    // Cleared is the milestone that claims the goods are legally through both
    // borders, so the customs documents gate this one and only this one.
    if (customsBlocks(verification)) return false;
    return verification.ceisaApproved === true;
  }
  return false;
}

function serializeEscrow(escrow, decimals = 2) {
  return {
    contractValue: escrow.contractValue.toString(),
    value: ethers.formatUnits(escrow.contractValue, decimals),
    // Stated rather than left to be inferred. Anything that computes a share of
    // the value — a negotiated split, say — works in the smallest unit, and a
    // client that guesses the scale is off by a factor of a hundred.
    decimals: Number(decimals),
    currency: "IDRT-demo",
    importer: escrow.importer,
    exporter: escrow.exporter,
    arbiter: escrow.arbiter,
    documentCid: escrow.documentCid,
    commodity: escrow.commodity,
    containerRef: escrow.containerRef,
    globalDeadline: toIso(escrow.globalDeadline),
    globalDeadlineUnix: escrow.globalDeadline.toString(),
    createdAt: toIso(escrow.createdAt),
    createdAtUnix: escrow.createdAt.toString(),
    state: stateName(escrow.state),
    stateId: Number(escrow.state),
    timelockReleaseAt: toIso(escrow.timelockReleaseAt),
    timelockReleaseAtUnix: escrow.timelockReleaseAt.toString()
  };
}

// The token address and its decimals are fixed for the life of a deployment,
// and reading them cost two sequential round trips on EVERY escrow read — so
// every refresh paid for a fact that cannot change. Keyed on the escrow
// contract so a redeploy in the same process still re-reads.
const decimalsCache = new Map();

async function getIdrtDecimals(contract) {
  const escrowAddress = await contract.getAddress();
  if (decimalsCache.has(escrowAddress)) return decimalsCache.get(escrowAddress);

  const tokenAddress = await contract.idrtToken();
  const token = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], contract.runner);
  const decimals = Number(await token.decimals());
  decimalsCache.set(escrowAddress, decimals);
  return decimals;
}

async function getOracleIdentity() {
  const provider = getProvider();
  const contract = getContract(provider);
  const wallets = getVerifierWallets(provider);
  const rows = [];

  for (const role of ORACLE_ROLES) {
    const roleHash = await contract[role.roleName]();
    const address = wallets[role.index].address;
    rows.push({
      index: role.index,
      role: role.key,
      address,
      roleHash,
      milestone: milestoneName(role.milestone),
      verifierName: role.verifierName,
      roleVerified: await contract.hasRole(roleHash, address)
    });
  }

  const arbiter = getArbiterWallet(provider);
  const adminRole = await contract.DEFAULT_ADMIN_ROLE();

  return {
    ok: true,
    oracles: rows,
    arbiter: {
      address: arbiter.address,
      defaultAdmin: await contract.hasRole(adminRole, arbiter.address)
    }
  };
}

async function getOracleStatus() {
  const provider = getProvider();
  const contract = getContract(provider);
  const network = await provider.getNetwork();
  const block = await provider.getBlock("latest");
  const identity = await getOracleIdentity();
  const entries = [];

  for (const oracle of identity.oracles) {
    const balance = await provider.getBalance(oracle.address);
    const bond = await contract.verifierBonds(oracle.address);
    const strikes = await contract.verifierSlashCount(oracle.address);
    entries.push({
      ...oracle,
      nativeBalanceWei: balance.toString(),
      nativeBalance: ethers.formatEther(balance),
      gasLow: balance < BigInt(config.nativeGasWarningWei),
      verifierBond: bond.toString(),
      verifierSlashCount: strikes.toString()
    });
  }

  const arbiter = getArbiterWallet(provider);
  const arbiterBalance = await provider.getBalance(arbiter.address);

  return {
    ok: true,
    network: {
      chainId: network.chainId.toString(),
      latestBlock: block?.number ?? null,
      latestBlockTimestamp: block?.timestamp ?? null,
      contractAddress: config.contractAddress,
      contracts: {
        legacy: contractAddressFor(CONTRACT_GENERATION.LEGACY),
        v2: contractAddressFor(CONTRACT_GENERATION.V2),
        ...(config.v3ContractAddress ? { v3: contractAddressFor(CONTRACT_GENERATION.V3) } : {}),
        newEscrowContract: contractAddressFor(config.v3ContractAddress ? CONTRACT_GENERATION.V3 : CONTRACT_GENERATION.V2)
      },
      rpcConfigured: Boolean(config.rpcUrl)
    },
    oracles: entries,
    arbiter: {
      address: arbiter.address,
      defaultAdmin: identity.arbiter.defaultAdmin,
      nativeBalanceWei: arbiterBalance.toString(),
      nativeBalance: ethers.formatEther(arbiterBalance),
      gasLow: arbiterBalance < BigInt(config.nativeGasWarningWei)
    }
  };
}

async function getOnchainEvidence(contractId, milestone) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const normalized = normalizeMilestone(milestone);
  const proof = await contract.getMilestoneProof(target.id, normalized);
  return {
    contractId: target.escrowId,
    milestone: milestoneName(normalized),
    milestoneId: normalized,
    submitted: proof[0],
    verifier: proof[1],
    proofCid: proof[2],
    blockNumber: proof[3].toString(),
    challengeDeadline: toIso(proof[4]),
    challengeDeadlineUnix: proof[4].toString()
  };
}

async function getEscrow(contractId) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const id = target.id;
  // The former serial sequence made one page open wait on seven independent
  // RPC calls. Read-only chain facts have no dependency on one another, so
  // issue them together and let the RPC fallback settle each call.
  const [raw, decimals, inspected, shipped, arrivedCleared, dispute, releaseEligible] = await Promise.all([
    contract.getEscrow(id),
    getIdrtDecimals(contract),
    getOnchainEvidence(target.escrowId, "inspected"),
    getOnchainEvidence(target.escrowId, "shipped"),
    getOnchainEvidence(target.escrowId, "arrived_cleared"),
    getDispute(target.escrowId),
    contract.isReleaseEligible(id)
  ]);
  const escrow = serializeEscrow({
    contractValue: raw[0], importer: raw[1], exporter: raw[2], arbiter: raw[3],
    documentCid: raw[4], commodity: raw[5], containerRef: raw[6], globalDeadline: raw[7],
    createdAt: raw[8], state: raw[9], timelockReleaseAt: raw[10]
  }, decimals);

  const milestones = { inspected, shipped, arrived_cleared: arrivedCleared };
  return { escrowId: target.escrowId, contractGeneration: target.generation, contractAddress: target.contractAddress, ...escrow, milestones, dispute, releaseEligible };
}

async function getContractReadiness(generation) {
  const provider = getProvider();
  const contract = getContract(provider, generation);
  const wallets = getVerifierWallets(provider);
  const minimumBond = await contract.MIN_VERIFIER_BOND();
  const verifiers = await Promise.all(ORACLE_ROLES.map(async (role) => {
    const address = wallets[role.index].address;
    const roleHash = await contract[role.roleName]();
    const [hasRole, bond] = await Promise.all([
      contract.hasRole(roleHash, address),
      contract.verifierBonds(address)
    ]);
    return { milestone: milestoneName(role.milestone), ready: hasRole && bond >= minimumBond };
  }));
  return { contractAddress: contractAddressFor(generation), generation,
    ready: verifiers.every(item => item.ready), verifiers };
}
const getV2Readiness = () => getContractReadiness(CONTRACT_GENERATION.V2);
async function getNewEscrowReadiness() {
  const generation = config.v3ContractAddress ? CONTRACT_GENERATION.V3 : CONTRACT_GENERATION.V2;
  const readiness = await getContractReadiness(generation);
  if (generation !== CONTRACT_GENERATION.V3) return readiness;
  if (!config.arbiterPrivateKey) return { ...readiness, ready: false, reason: "V3 settlement keeper key is not configured." };
  const provider = getProvider();
  const balance = await provider.getBalance(getArbiterWallet(provider).address);
  if (balance < config.nativeGasWarningWei) {
    return { ...readiness, ready: false, reason: "V3 settlement keeper needs Amoy gas." };
  }
  return readiness;
}

async function listEscrows({ address, role, state, includeArchived } = {}) {
  const provider = getProvider();
  const normalizedAddress = address ? ethers.getAddress(address) : null;
  const normalizedRole = role ? String(role).toLowerCase() : null;
  if (normalizedRole && !["importer", "exporter", "arbiter"].includes(normalizedRole)) {
    const error = new Error("role must be importer, exporter, or arbiter.");
    error.statusCode = 400;
    error.code = "INVALID_ROLE_FILTER";
    throw error;
  }
  if (normalizedRole && !normalizedAddress) {
    const error = new Error("address is required when role is provided.");
    error.statusCode = 400;
    error.code = "ADDRESS_REQUIRED_FOR_ROLE";
    throw error;
  }
  async function rowsFor(generation) {
    const contract = getContract(provider, generation);
    const total = Number(await contract.nextEscrowId());
    const decimals = await getIdrtDecimals(contract);
    const rows = [];
    for (let id = 0; id < total; id += 1) {
      const raw = await contract.getEscrow(id);
      const matchesAddress = !normalizedAddress || [raw[1], raw[2], raw[3]].some((a) => a.toLowerCase() === normalizedAddress.toLowerCase());
      const matchesRole = !normalizedRole || raw[{ importer: 1, exporter: 2, arbiter: 3 }[normalizedRole]].toLowerCase() === normalizedAddress.toLowerCase();
      const stateLabel = stateName(raw[9]);
      if (normalizedAddress && !matchesAddress) continue;
      if (normalizedRole && !matchesRole) continue;
      if (state && String(state).toLowerCase() !== stateLabel.toLowerCase()) continue;
      const target = parseEscrowRef(generation === CONTRACT_GENERATION.LEGACY ? id : `${generation}:${id}`);
      rows.push({ escrowId: target.escrowId, contractGeneration: generation, contractAddress: target.contractAddress, ...serializeEscrow({
        contractValue: raw[0], importer: raw[1], exporter: raw[2], arbiter: raw[3],
        documentCid: raw[4], commodity: raw[5], containerRef: raw[6], globalDeadline: raw[7],
        createdAt: raw[8], state: raw[9], timelockReleaseAt: raw[10]
      }, decimals) });
    }
    return { rows, total };
  }

  // V3 is the single active book once configured. Older deployments remain
  // addressable by their explicit escrow references and can be listed with
  // includeArchived=true, without mixing historical IDs into the active book.
  const generations = config.v3ContractAddress && includeArchived !== "true"
    ? [CONTRACT_GENERATION.V3]
    : [CONTRACT_GENERATION.LEGACY, CONTRACT_GENERATION.V2,
      ...(config.v3ContractAddress ? [CONTRACT_GENERATION.V3] : [])];
  const books = await Promise.all(generations.map(async generation => ({
    generation, ...(await rowsFor(generation))
  })));
  const rows = books.flatMap(book => book.rows).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const totals = Object.fromEntries(books.map(book => [book.generation, book.total]));
  const activeGeneration = config.v3ContractAddress ? CONTRACT_GENERATION.V3 : CONTRACT_GENERATION.V2;
  return {
    escrows: rows,
    total: rows.length,
    nextEscrowId: String(totals[activeGeneration] ?? 0),
    nextEscrowIds: {
      legacy: String(totals.legacy ?? 0),
      v2: String(totals.v2 ?? 0),
      v3: String(totals.v3 ?? 0)
    }
  };
}

async function getTimelock(contractId) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const raw = await contract.getEscrow(target.id);
  // Chain clock here too, so the countdown cannot reach zero while
  // isReleaseEligible still says no — which reads as a stuck button.
  const now = await chainNow(provider);
  const releaseAt = Number(raw[10]);
  const challengeWindow = await contract.challengeWindowSeconds();
  const timelockDuration = await contract.timelockDurationSeconds();
  const dispute = await contract.getDispute(target.id);
  const disputeMilestoneId = Math.min(Math.max(Number(raw[9]), 1), 3);
  const relevantProof = await contract.getMilestoneProof(target.id, disputeMilestoneId);
  const finalDisputeDeadline = target.generation === CONTRACT_GENERATION.V3
    ? await contract.finalDisputeDeadline(target.id) : 0n;
  const canDisputeMilestone = target.generation === CONTRACT_GENERATION.V3
    ? Number(raw[9]) <= 2 && BigInt(now) <= raw[7]
    : relevantProof[0] && BigInt(now) <= relevantProof[4];
  const canDisputeGeneral = target.generation === CONTRACT_GENERATION.V3
    ? Number(raw[9]) === 3 && BigInt(now) <= finalDisputeDeadline
    : Number(raw[9]) === 4 && BigInt(now) < raw[10];
  const canRelease = await contract.isReleaseEligible(target.id);
  return {
    escrowId: target.escrowId,
    state: stateName(raw[9]),
    timelockReleaseAt: toIso(raw[10]),
    timelockReleaseAtUnix: raw[10].toString(),
    secondsRemaining: Math.max(0, releaseAt - now),
    canRelease,
    canDispute: !dispute.open && (canDisputeMilestone || canDisputeGeneral),
    ...(target.generation === CONTRACT_GENERATION.V3 ? {
      finalDisputeDeadline: toIso(finalDisputeDeadline),
      finalDisputeDeadlineUnix: finalDisputeDeadline.toString(),
      disputeDeadline: toIso(Number(raw[9]) === 3 ? finalDisputeDeadline : raw[7]),
      disputeDeadlineUnix: (Number(raw[9]) === 3 ? finalDisputeDeadline : raw[7]).toString(),
      disputeSecondsRemaining: Math.max(0, Number(finalDisputeDeadline) - now),
      disputeWindowSeconds: (await contract.disputeWindowSeconds()).toString(),
      autoSettlementEnabled: Boolean(config.v3ContractAddress && config.arbiterPrivateKey)
    } : {}),
    challengeWindowSeconds: challengeWindow.toString(),
    timelockDurationSeconds: timelockDuration.toString()
  };
}

async function getDispute(contractId) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const d = await contract.getDispute(target.id);
  return {
    escrowId: target.escrowId,
    open: d[0],
    raisedBy: d[1],
    bondAmount: d[2].toString(),
    contestedMilestone: milestoneName(d[3]),
    contestedMilestoneId: Number(d[3]),
    resolvedVerifier: d[4],
    reasoningCid: d[5],
    releaseToExporter: d[6],
    // A negotiated split cannot be read off `releaseToExporter`: that bool is
    // false both for "everything back to the importer" and for "85% to the
    // exporter". Anything reading the outcome has to check this first.
    settledToExporter: d.length > 7 ? d[7].toString() : "0",
    settledByAgreement: target.generation === CONTRACT_GENERATION.V3
      ? Boolean(d[8]) : d.length > 7 && d[7] > 0n,
    resolved: !d[0] && (d[5] !== "" || d[4] !== ethers.ZeroAddress)
  };
}

async function prepareDispute(contractId, contestedMilestone = "none") {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const normalized = normalizeMilestone(contestedMilestone);
  const raw = await contract.getEscrow(target.id);
  const dispute = await contract.getDispute(target.id);
  const bondBps = await contract.disputeBondBps();
  const bondAmount = (raw[0] * bondBps) / 10000n;
  const now = BigInt(await chainNow(provider));
  let windowStillOpen = false;
  let challengeDeadline = 0n;
  if (target.generation === CONTRACT_GENERATION.V3) {
    if (Number(raw[9]) === 3) {
      challengeDeadline = await contract.finalDisputeDeadline(target.id);
      windowStillOpen = now <= challengeDeadline;
    } else if (Number(raw[9]) <= 2) {
      challengeDeadline = raw[7];
      windowStillOpen = now <= challengeDeadline;
    }
  } else if (normalized === 0) {
    windowStillOpen = Number(raw[9]) === 4 && now < raw[10];
    challengeDeadline = raw[10];
  } else {
    const proof = await contract.getMilestoneProof(target.id, normalized);
    challengeDeadline = proof[4];
    windowStillOpen = proof[0] && now <= proof[4];
  }
  const iface = new ethers.Interface(loadAbi(target.generation));
  const raiseDisputeData = iface.encodeFunctionData("raiseDispute", [target.id, normalized]);
  const tokenAddress = await contract.idrtToken();
  const tokenIface = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
  return {
    escrowId: target.escrowId,
    contestedMilestone: milestoneName(normalized),
    contestedMilestoneId: normalized,
    disputeBondAmount: bondAmount.toString(),
    disputeBondAmountFormatted: ethers.formatUnits(bondAmount, await getIdrtDecimals(contract)),
    currency: "IDRT-demo",
    windowStillOpen,
    challengeDeadline: toIso(challengeDeadline),
    challengeDeadlineUnix: challengeDeadline.toString(),
    disputeAlreadyOpen: dispute.open,
    userTransaction: {
      contractAddress: target.contractAddress,
      function: "raiseDispute(uint256,uint8)",
      calldata: raiseDisputeData
    },
    requiredApproval: {
      tokenAddress,
      spender: target.contractAddress,
      amount: bondAmount.toString(),
      calldata: tokenIface.encodeFunctionData("approve", [target.contractAddress, bondAmount])
    },
    note: target.generation === CONTRACT_GENERATION.V3
      ? "Only the importer may raise this dispute from their Particle Smart Account."
      : "The importer/exporter submits the dispute from their Particle Smart Account."
  };
}

// Amoy targets roughly two seconds a block. Only used to turn a creation
// timestamp into an approximate block to start scanning from; the margin below
// absorbs the error.
const AVG_BLOCK_SECONDS = 2;

// The head barely moves between requests, and the dashboard asks for a dozen
// escrows at once. Reading it once per couple of seconds instead of once per
// escrow removes a round trip per row for a value that would be identical.
let headCache = { block: null, at: 0 };
async function latestBlock(provider) {
  if (headCache.block && Date.now() - headCache.at < 2000) return headCache.block;
  const block = await provider.getBlock("latest");
  headCache = { block, at: Date.now() };
  return block;
}

/**
 * Where to start scanning, for the CONTRACT rather than for one escrow.
 *
 * queryFilter defaults fromBlock to 0. On a chain 47 million blocks deep that
 * asks a public RPC for the whole history, which every provider refuses — and
 * the refusal was being swallowed into an empty list, so the activity feed was
 * not empty, it was never fetched.
 *
 * Anchored on the OLDEST escrow, because one window then serves every escrow and
 * the scan below can be shared. CONTRACT_DEPLOY_BLOCK replaces the estimate
 * entirely and is worth setting: the guess has to allow a wide margin, and the
 * margin is what makes the scan expensive.
 */
// The estimated start block, once worked out.
//
// It must be STABLE across calls, not merely cheap: the incremental log cache
// above is keyed on `from`, so an estimate that drifts a few blocks between
// refreshes would look like a different range every time and throw the cache
// away — which is precisely the full rescan this is all meant to stop. It also
// saves a getEscrow(0) round trip per call.
const windowStart = new Map();

async function activityWindow(provider, contract, target) {
  const latest = await latestBlock(provider);
  const to = latest?.number ?? (await provider.getBlockNumber());
  if (target.generation === CONTRACT_GENERATION.LEGACY && config.contractDeployBlock != null) {
    return { from: config.contractDeployBlock, to };
  }

  const key = target.contractAddress;
  const cached = windowStart.get(key);
  if (cached != null) return { from: cached, to };

  let from = Math.max(0, to - 500_000);
  try {
    const createdAt = Number((await contract.getEscrow(0))[8]);
    if (createdAt > 0 && latest?.timestamp > createdAt) {
      const blocksAgo = Math.ceil((latest.timestamp - createdAt) / AVG_BLOCK_SECONDS);
      const margin = Math.ceil(blocksAgo * 0.2) + 5000;
      from = Math.max(0, to - blocksAgo - margin);
    }
  } catch {
    // No escrow 0, or the chain is unreachable — keep the wide fallback.
  }

  windowStart.set(key, from);
  return { from, to };
}

/**
 * Whether the provider is complaining about the RANGE, as opposed to anything
 * else.
 *
 * Every layer of the message has to be looked at, not just the first. ethers
 * wraps a provider error as `shortMessage: "could not coalesce error"` with the
 * real complaint — "exceed maximum block range: 10000" — nested inside. Reading
 * `shortMessage || message` therefore matched nothing, and the scan gave up
 * instead of narrowing, which is exactly what it was written to survive.
 */
const RANGE_COMPLAINT =
  /more than \d+ results|block range|range is too|limit exceeded|query timeout|too many|exceeds/i;

// A different refusal entirely, and one no amount of narrowing can fix: the node
// has discarded the blocks. Public RPCs keep only recent history — this one about
// ten days of it — so a contract older than that simply has no early logs there.
//
// Worth separating because the JSON-RPC code is the same (-32701) for both on at
// least one provider. Treating this as a range problem made the scan shrink to
// its 500-block floor and then fail, which is the worst of both: slow, and still
// nothing to show.
const PRUNED = /pruned|history has been|not available|missing trie node|state.*unavailable/i;

function errorText(error) {
  return [
    error?.shortMessage,
    error?.message,
    error?.error?.message,
    error?.info?.error?.message
  ].filter(Boolean).join(" | ");
}

const isPruned = (error) => PRUNED.test(errorText(error));
const isRangeComplaint = (error) => !isPruned(error) && RANGE_COMPLAINT.test(errorText(error));

/**
 * getLogs across a wide range, in windows the provider will actually accept.
 *
 * Forward chunking rather than bisecting a failure. Bisecting spends a failed
 * request at every level before it finds a size that works — six of them, for
 * the range this hits in practice — and each failure is a round trip that
 * returns nothing. Starting at a size providers accept costs none of that, and
 * the window still shrinks if this one is stricter than most.
 */
async function getLogsInRange(provider, filter, fromBlock, toBlock) {
  const logs = [];
  let window = config.logScanChunk;
  let start = fromBlock;
  // The oldest block the node still holds, once it has told us. Reported upwards
  // so the UI can say the log is partial rather than implying it is complete.
  let prunedThrough = null;

  while (start <= toBlock) {
    const end = Math.min(start + window - 1, toBlock);
    try {
      logs.push(...(await provider.getLogs({ ...filter, fromBlock: start, toBlock: end })));
      start = end + 1;
    } catch (error) {
      if (isPruned(error)) {
        // Skip forward instead of giving up. The node cannot serve these blocks
        // and never will, but the recent ones are fine — and a partial history
        // is far more useful than an error where a timeline should be.
        prunedThrough = end;
        start = end + 1;
        continue;
      }
      // Shrink and retry the SAME window. Anything else is the caller's problem —
      // a rate limit answered by splitting would only multiply the requests that
      // provoked it.
      if (!isRangeComplaint(error) || window <= 500) throw error;
      window = Math.max(500, Math.floor(window / 4));
    }
  }
  return { logs, prunedThrough };
}

// One scan serves every escrow, and after the first one it only ever scans
// forward.
//
// The range is the same for all escrows, so scanning it once per escrow meant
// doing identical work a dozen times over — with the window this needs, 42
// requests each instead of 42 in total. That part was already fixed. What was
// not: the cache lasted 15 seconds, so a manual Refresh half a minute later
// rescanned the entire history from the deploy block. Pressing Refresh cost
// exactly what the first page load cost, for ever.
//
// A mined log never changes, so there is nothing to re-read. This keeps what it
// has and asks only for the blocks appended since — one request instead of
// forty-two, and the wide range is paid once per process.
const logCache = new Map();

// Two different waits, and they answer different questions.
//
// HEAD_TTL: how long to serve the cache without even asking the node for the
// head. It only has to cover the burst of calls one page load makes.
//
// The tail overlap: how far back to re-scan on every top-up. A chain can
// reorganise its most recent blocks, so the newest logs are not yet immutable;
// re-reading a short tail and de-duplicating is what keeps a reorg from leaving
// a phantom event in the cache for the life of the process.
const HEAD_TTL_MS = 5_000;
const REORG_OVERLAP_BLOCKS = 64;

const logKey = (log) => `${log.transactionHash}:${log.logIndex ?? log.index}`;

/** Drops every scan cache. Used when the test seam swaps the provider. */
function resetScanCaches() {
  logCache.clear();
  blockTimeCache.clear();
  decimalsCache.clear();
  headCache = { block: null, at: 0 };
  windowStart.clear();
}

// Block number -> block. A mined block's timestamp does not change, so this is
// shared across calls and never expires. Bounded below so a long-running
// gateway cannot grow it without limit.
const blockTimeCache = new Map();
const MAX_CACHED_BLOCKS = 2000;

function trimBlockCache() {
  if (blockTimeCache.size <= MAX_CACHED_BLOCKS) return;
  // Insertion order: drop the oldest entries, which are the ones least likely
  // to be asked for again.
  const excess = blockTimeCache.size - MAX_CACHED_BLOCKS;
  let dropped = 0;
  for (const key of blockTimeCache.keys()) {
    blockTimeCache.delete(key);
    if (++dropped >= excess) break;
  }
}

async function contractLogs(provider, contract, filter, from, to) {
  const key = `${filter.address}:${filter.topics?.[0]?.length ?? 0}:${from}`;
  const hit = logCache.get(key);
  const now = Date.now();

  // Fresh enough that the head is not worth asking about.
  if (hit && now - hit.at < HEAD_TTL_MS) return { logs: hit.logs, prunedThrough: hit.prunedThrough };

  // Nothing cached for this range: the one full scan.
  if (!hit) {
    const { logs, prunedThrough } = await getLogsInRange(provider, filter, from, to);
    logCache.set(key, { logs, prunedThrough, scannedTo: to, at: now });
    return { logs, prunedThrough };
  }

  // Top up. `to` can sit behind scannedTo when a provider serves a slightly
  // stale head, and scanning backwards would be a wasted request.
  const start = Math.max(from, hit.scannedTo - REORG_OVERLAP_BLOCKS + 1);
  if (to < start) {
    hit.at = now;
    return { logs: hit.logs, prunedThrough: hit.prunedThrough };
  }

  const { logs: tail, prunedThrough } = await getLogsInRange(provider, filter, start, to);

  // Drop everything inside the re-scanned window and take the node's answer for
  // it, so a reorged-out log disappears rather than lingering.
  const merged = hit.logs.filter((log) => log.blockNumber < start);
  const seen = new Set(merged.map(logKey));
  for (const log of tail) {
    if (seen.has(logKey(log))) continue;
    seen.add(logKey(log));
    merged.push(log);
  }

  const next = {
    logs: merged,
    // A pruning report from the first scan still stands; the tail cannot
    // discover that early blocks came back.
    prunedThrough: hit.prunedThrough ?? prunedThrough,
    scannedTo: Math.max(hit.scannedTo, to),
    at: now
  };
  logCache.set(key, next);
  return { logs: next.logs, prunedThrough: next.prunedThrough };
}

async function getActivity(contractId) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const id = target.id;
  const events = [];
  const specs = [
    ["EscrowCreated", "escrow_created"],
    ["MilestoneVerified", "milestone_verified"],
    ["TimelockStarted", "timelock_started"],
    ["PaymentReleased", "payment_released"],
    ["Refunded", "refunded"],
    ["DisputeRaised", "dispute_raised"],
    ["DisputeResolved", "dispute_resolved"],
    ["DisputeSettledByAgreement", "dispute_settled_by_agreement"],
    ["DisputeSettledByArbiter", "dispute_settled_by_arbiter"],
    ["VerifierSlashed", "verifier_slashed"]
  ];
  const { from, to } = await activityWindow(provider, contract, target);

  // ONE filter for all of these events, and no escrow id in it.
  //
  // Every one of them declares escrowId as its first indexed parameter, so a
  // single filter carries all of their signatures in topic0. Leaving topic1 open
  // means the scan is identical for every escrow, so it can be done once and
  // shared — the difference between 42 requests and 588 on a dashboard holding a
  // dozen escrows. The id is matched below, on data already in hand.
  const byTopic = new Map();
  for (const [eventName, type] of specs) {
    // An older artifact will not have every event in this list. Skipping one is
    // a gap in the log; throwing would be no log at all.
    let event;
    try {
      event = contract.interface.getEvent(eventName);
    } catch {
      continue;
    }
    if (event) byTopic.set(event.topicHash, { eventName, type });
  }
  const filter = {
    address: await contract.getAddress(),
    topics: [[...byTopic.keys()]]
  };

  const idTopic = ethers.zeroPadValue(ethers.toBeHex(id), 32).toLowerCase();
  const { logs: all, prunedThrough } = await contractLogs(provider, contract, filter, from, to);
  const logs = all.filter((log) => String(log.topics[1] || "").toLowerCase() === idTopic);

  // One read per block, ever. Three milestones committed in the same block used
  // to cost three identical round trips within one call; the cache is now
  // shared across calls too, because a mined block's timestamp is immutable and
  // re-reading it on every refresh bought nothing.
  const blockAt = async (number) => {
    if (!blockTimeCache.has(number)) {
      blockTimeCache.set(number, await provider.getBlock(number));
      trimBlockCache();
    }
    return blockTimeCache.get(number);
  };

  for (const log of logs) {
    const spec = byTopic.get(log.topics[0]);
    if (!spec) continue;
    const { eventName, type } = spec;
    const parsed = contract.interface.parseLog(log)?.args || [];
    const block = await blockAt(log.blockNumber);
    const actorIndex = {
      EscrowCreated: 1,
      MilestoneVerified: 2,
      PaymentReleased: 1,
      Refunded: 1,
      DisputeRaised: 1,
      VerifierSlashed: 1
    }[eventName];
    const candidate = actorIndex == null ? null : parsed[actorIndex];
    const actorAddress = typeof candidate === "string" && ethers.isAddress(candidate) ? candidate : null;
    events.push({
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      time: block ? new Date(block.timestamp * 1000).toISOString() : null,
      type,
      actorAddress,
      text: eventName
    });
  }
  events.sort((a, b) => (a.blockNumber - b.blockNumber) || a.transactionHash.localeCompare(b.transactionHash));
  // `truncatedBefore` is the honest half of a partial answer: these are all the
  // events the node still holds, and anything earlier than this block is gone
  // from it. Without saying so, a short list looks like a complete one.
  return {
    escrowId: target.escrowId,
    activity: events,
    truncatedBefore: prunedThrough,
    scannedFrom: from
  };
}

async function getVerifiers() {
  const status = await getOracleStatus();
  return {
    verifiers: status.oracles.map((o) => ({
      address: o.address,
      name: o.verifierName,
      role: o.role,
      milestone: o.milestone,
      bond: o.verifierBond,
      slashCount: Number(o.verifierSlashCount),
      active: o.roleVerified && Number(o.verifierSlashCount) < 3
    }))
  };
}

/**
 * Runs the gateway's own verification across all three milestones and commits
 * whatever passes, in order.
 *
 * No new verifier logic: it calls the same milestonePassed() and the same
 * submitMilestoneProof() everything else uses. The point is only that the work
 * can now be triggered without a terminal.
 *
 * It cannot commit all three in one go on a real contract, and does not pretend
 * to. The contract requires the previous milestone's challenge window to have
 * elapsed:
 *
 *   require(block.timestamp > proofs[Inspected].challengeDeadline, "challenge window open")
 *
 * so a call that lands during that window commits what it can and reports the
 * rest as "challenge_window_open", with the time it opens. That is not a
 * failure — the caller repeats the call afterwards. Flattening it into an error
 * would have an operator retrying immediately and getting the same answer.
 *
 * Every status this can return, so the frontend can be written against a closed
 * set:
 *   submitted             — proof is now on chain
 *   already_submitted     — it was already there; nothing to do
 *   challenge_window_open — the previous milestone is still inside its window
 *   source_failed         — the automated check says no, so it was NOT submitted
 *   blocked               — escrow state does not allow this milestone yet
 *   error                 — the transaction itself reverted or the node refused
 */
/**
 * What goes on chain as this milestone's proof CID.
 *
 * For Cleared, when customs documents have been attached, it is the real CID of
 * the customs manifest — so the proof recorded on chain resolves to the PEB,
 * the PIB and the receipt for the duty, and anyone can fetch them and check the
 * hashes. That is the thing a proof CID was always supposed to be.
 *
 * Everything else keeps the synthetic string it has always had. It is honest
 * about what it is — the gateway attesting that its own checks passed, with no
 * document behind it — and changing the format for the first two milestones
 * would rewrite what earlier escrows can be compared against for no gain.
 */
function proofCidFor(contractId, milestone, prefix) {
  if (milestone === "arrived_cleared") {
    try {
      const record = require("./manifestService").customsFor(contractId);
      if (record?.cid) return record.cid;
    } catch {
      // No store or an unreadable one: fall through to the synthetic string
      // rather than failing a milestone over a missing file.
    }
  }
  return `${prefix}-${contractId}-${milestone}`;
}

async function verifyAndSubmitAll(contractId, verification, { proofCidPrefix = "bafy-verified" } = {}) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const contract = getContract(provider, target.generation);
  const results = {};
  let stop = false;

  for (const name of ["inspected", "shipped", "arrived_cleared"]) {
    const id = normalizeMilestone(name);

    if (stop) {
      results[name] = { status: "blocked", reason: "An earlier milestone is not committed yet." };
      continue;
    }

    const proof = await contract.getMilestoneProof(target.id, id);
    if (proof[0]) {
      results[name] = { status: "already_submitted", proofCid: proof[2], verifier: proof[1] };
      continue;
    }

    // The contract wants the escrow sitting exactly one state below this
    // milestone. Asking it anyway would just burn gas on a revert.
    // Positional, matching the rest of this file — EscrowView puts state at 9.
    // Named access depends on the ABI carrying output names, and nothing else
    // here relies on that.
    const state = Number((await contract.getEscrow(target.id))[9]);
    if (state !== id - 1) {
      results[name] = { status: "blocked", reason: `Escrow is ${stateName(state)}; this milestone needs ${stateName(id - 1)}.` };
      stop = true;
      continue;
    }

    if (id > 1) {
      const prev = await contract.getMilestoneProof(target.id, id - 1);
      // The CHAIN's clock, not this machine's. The contract compares against
      // block.timestamp, and on Amoy that trails wall time by seconds. Using
      // Date.now() here meant that right at the edge of a window the guard let
      // the call through and the contract reverted with "challenge window
      // open" — reported as an error when it was only a matter of waiting.
      //
      // Reading the latest block errs the safe way: if the chain has not caught
      // up we report "still waiting" instead of spending gas on a revert.
      const now = BigInt(await chainNow(provider));
      if (prev[0] && now <= prev[4]) {
        results[name] = {
          status: "challenge_window_open",
          reason: "The previous milestone is still inside its challenge window.",
          retryAfter: toIso(prev[4])
        };
        stop = true;
        continue;
      }
    }

    if (!milestonePassed(name, verification)) {
      // The refusal is the product working. A failing source must never reach
      // the chain, and the caller should see why rather than a bare "failed".
      //
      // Name the e-BL when it is the e-BL. Every milestone is gated on it, so
      // a wrong document fails all three at once — and a generic "the
      // automated check did not pass" would send someone hunting through VGM,
      // AIS and CEISA for a fault that is not in any of them.
      results[name] = {
        status: "source_failed",
        reason: eblBlocks(verification)
          ? "The e-BL document failed verification, so no proof was written on chain. Every milestone is gated on it: re-create the escrow with the correct bill of lading."
          : clauseBlocks(name, verification)
            ? "Sebuah klausul interpretatif pada milestone ini belum dijawab, atau dinilai tidak terpenuhi. Klausul semacam itu memang tidak bisa diputuskan mesin — penilainya harus menuliskan putusan dan alasannya dulu."
            : customsBlocks(verification) && name === "arrived_cleared"
              ? "The customs documents attached to this escrow failed verification, so no proof was written on chain. Cleared claims the goods are legally through both borders: re-upload the PEB, PIB and proof of payment."
              : "The automated check did not pass, so no proof was written on chain."
      };
      stop = true;
      continue;
    }

    try {
      const submitted = await submitMilestoneProof(target.escrowId, name, proofCidFor(target.escrowId, name, proofCidPrefix), verification);
      results[name] = {
        status: "submitted",
        transactionHash: submitted.transactionHash,
        blockNumber: submitted.blockNumber,
        verifier: submitted.verifier
      };
    } catch (error) {
      const raw = error.reason || error.shortMessage || error.message || "";
      // "insufficient funds for intrinsic transaction cost" is the node telling
      // us a wallet cannot pay gas, but it names neither the wallet nor the
      // balance — so the reader has no way to know WHICH of the three verifiers
      // to top up. The gateway knows both; say them.
      if (/insufficient funds/i.test(raw)) {
        let detail = "";
        try {
          const wallet = pickVerifier(getVerifierWallets(provider), name);
          const balance = await provider.getBalance(wallet.address);
          detail = ` Verifier ${wallet.address} holds ${ethers.formatEther(balance)} MATIC. Fund it from an Amoy faucet and press Verify again.`;
        } catch {
          detail = " Fund the verifier wallets with Amoy MATIC and press Verify again.";
        }
        results[name] = {
          status: "verifier_out_of_gas",
          reason: `The ${name} verifier cannot pay gas.${detail}`
        };
        stop = true;
        continue;
      }
      // "verifier bond required" is the contract's phrasing and it sends people
      // to check the wrong number. A verifier's WALLET balance is not its bond:
      // the bond is IDRT already transferred into the contract, and it drops by
      // half every time an arbiter slashes that verifier. So the usual cause is
      // a dispute resolved against them during testing, with the wallet still
      // holding plenty of IDRT.
      if (/verifier bond required/i.test(raw)) {
        let detail = "";
        try {
          const wallet = pickVerifier(getVerifierWallets(provider), name);
          const [bond, minBond, strikes] = await Promise.all([
            contract.verifierBonds(wallet.address),
            contract.MIN_VERIFIER_BOND(),
            contract.verifierSlashCount(wallet.address)
          ]);
          const fmt = (v) => ethers.formatUnits(v, 2);
          detail =
            ` Verifier ${wallet.address} has ${fmt(bond)} bonded, and ${fmt(minBond)} is required` +
            ` (slashed ${strikes} time${strikes === 1n ? "" : "s"}).` +
            ` Its wallet balance is a separate thing — top the bond back up with \`npm run post-bond\`.`;
          if (strikes >= 3n) {
            detail +=
              " Three slashes revokes the role permanently, so post-bond cannot help here:" +
              " an admin has to grant the role to a fresh wallet.";
          }
        } catch {
          detail = " Top the verifier bonds back up with `npm run post-bond`.";
        }
        results[name] = { status: "verifier_bond_required", reason: `The ${name} verifier has no bond posted.${detail}` };
        stop = true;
        continue;
      }
      results[name] = { status: "error", reason: raw };
      stop = true;
    }
  }

  return { contractId: target.escrowId, results };
}

async function submitMilestoneProof(contractId, milestone, proofCid, verification) {
  const target = parseEscrowRef(contractId);
  const provider = getProvider();
  const wallets = getVerifierWallets(provider);
  const wallet = pickVerifier(wallets, milestone);
  const contract = getContract(wallet, target.generation);
  const passed = milestonePassed(milestone, verification);
  if (!passed) {
    const error = new Error("Automated verification failed; milestone was not submitted on-chain.");
    error.statusCode = 422;
    error.code = "AUTOMATED_CHECK_FAILED";
    throw error;
  }
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [passed]);
  const tx = await contract.submitMilestoneProof(target.id, normalizeMilestone(milestone), proofCid, payload);
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    verifier: wallet.address,
    milestone: milestoneName(normalizeMilestone(milestone)),
    automatedCheckPassed: passed
  };
}

async function resolveDispute(contractId, options = {}) {
  const target = parseEscrowRef(contractId);
  if (typeof options.releaseToExporter !== "boolean" ||
      typeof options.slashVerifier !== "boolean" ||
      typeof options.bondFrivolous !== "boolean" ||
      typeof options.reasoningCid !== "string" ||
      !options.reasoningCid.trim()) {
    const error = new Error("releaseToExporter, slashVerifier, bondFrivolous (booleans) and reasoningCid (non-empty string) are required.");
    error.statusCode = 400;
    error.code = "INVALID_DISPUTE_RESOLUTION";
    throw error;
  }
  if (options.bondFrivolous && options.slashVerifier) {
    const error = new Error("bondFrivolous and slashVerifier cannot both be true.");
    error.statusCode = 400;
    error.code = "INVALID_DISPUTE_RESOLUTION";
    throw error;
  }
  const provider = getProvider();
  const wallet = getArbiterWallet(provider);
  const tx = await getContract(wallet, target.generation).resolveDispute(
    target.id,
    options.releaseToExporter,
    options.reasoningCid.trim(),
    options.slashVerifier,
    options.bondFrivolous
  );
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, arbiter: wallet.address };
}

// Executes exactly what both parties signed in negotiationService.
//
// The amount is not taken from the request. It is recomputed here from the
// accepted agreement the gateway itself pinned, because a caller who could name
// the amount could name any amount and the pinned document would no longer be
// what got paid out.
async function resolveDisputeByAgreement(contractId, options = {}) {
  const target = parseEscrowRef(contractId);
  if (target.generation === CONTRACT_GENERATION.LEGACY) {
    const error = new Error("Negotiated split settlement is available on V2 and V3 escrows.");
    error.statusCode = 422;
    error.code = "AGREEMENT_SETTLEMENT_V2_REQUIRED";
    throw error;
  }
  const agreementId = typeof options.agreementId === "string" ? options.agreementId.trim() : "";
  if (!agreementId) {
    const error = new Error("agreementId (the accepted negotiation agreement) is required.");
    error.statusCode = 400;
    error.code = "INVALID_AGREEMENT";
    throw error;
  }

  const negotiation = require("./negotiationService");
  const agreement = await negotiation.acceptedAgreement(target.escrowId, agreementId);
  if (target.generation === CONTRACT_GENERATION.V2 && agreement.outcome !== "split") {
    const error = new Error(
      "Only a negotiated split goes through this call. A full release or full refund is resolveDispute, which also decides slashing and the frivolous bond."
    );
    error.statusCode = 422;
    error.code = "NOT_A_SPLIT";
    throw error;
  }
  if (!agreement.agreementCid) {
    const error = new Error(
      "The agreement was accepted but never pinned, so there is no document the payout can be audited against. Re-accept once IPFS pinning is available."
    );
    error.statusCode = 503;
    error.code = "AGREEMENT_NOT_PINNED";
    throw error;
  }

  const provider = getProvider();
  const wallet = getArbiterWallet(provider);
  const contract = getContract(wallet, target.generation);

  // The chain's current value, not the value recorded when the deal was struck.
  // If they disagree the escrow moved underneath the agreement and the split
  // would pay out a different share than the one both sides signed.
  const raw = await contract.getEscrow(target.id);
  const onchainValue = raw[0].toString();
  if (onchainValue !== agreement.contractValue) {
    const error = new Error(
      `Escrow value changed since the agreement was accepted (${agreement.contractValue} -> ${onchainValue}). Negotiate again against the current value.`
    );
    error.statusCode = 409;
    error.code = "VALUE_CHANGED";
    throw error;
  }

  const amountToExporter = agreement.outcome === "release_to_exporter"
    ? BigInt(agreement.contractValue)
    : agreement.outcome === "refund_to_importer" ? 0n : BigInt(agreement.amountToExporter);
  const tx = await contract.resolveDisputeByAgreement(
    target.id,
    amountToExporter,
    agreement.agreementCid
  );
  const receipt = await tx.wait();
  return {
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    arbiter: wallet.address,
    amountToExporter: amountToExporter.toString(),
    amountToImporter: (BigInt(agreement.contractValue) - amountToExporter).toString(),
    agreementCid: agreement.agreementCid
  };
}

// A chain transaction is required to move time-based state. Scan only V3:
// legacy and V2 keep their original manual settlement behavior.
async function advanceReadyV3Settlements() {
  if (!config.v3ContractAddress || !config.arbiterPrivateKey) return [];
  const provider = getProvider();
  if ((await provider.getNetwork()).chainId !== BigInt(config.rpcChainId)) {
    throw new Error("V3 settlement keeper RPC chain does not match RPC_CHAIN_ID.");
  }
  const contract = getContract(getArbiterWallet(provider), CONTRACT_GENERATION.V3);
  const now = await chainNow(provider);
  const total = Number(await contract.nextEscrowId());
  const advanced = [];
  for (let id = 0; id < total; id += 1) {
    const escrow = await contract.getEscrow(id);
    const state = Number(escrow.state);
    const due = state === 3
      ? now > Number(await contract.finalDisputeDeadline(id))
      : state === 4 && now >= Number(escrow.timelockReleaseAt);
    if (!due) continue;
    try {
      const receipt = await (await contract.advanceSettlement(id)).wait();
      advanced.push({ escrowId: `v3:${id}`, transactionHash: receipt.hash });
    } catch (error) {
      // One failed escrow must not prevent a later, valid escrow from settling.
      console.error(`V3 settlement keeper could not advance escrow ${id}: ${error.shortMessage || error.message}`);
    }
  }
  return advanced;
}

module.exports = {
  submitMilestoneProof,
  verifyAndSubmitAll,
  resolveDispute,
  resolveDisputeByAgreement,
  supportsAgreementSettlement,
  // Exported so the gate can be tested directly. Both are pure functions over
  // a verification object, and the rule they encode — which sources stop which
  // milestone — is worth a test that does not need a chain to run.
  milestonePassed,
  eblBlocks,
  __setTestProviders,
  customsBlocks,
  clauseBlocks,
  proofCidFor,
  normalizeMilestone,
  getOracleIdentity,
  getOracleStatus,
  getOnchainEvidence,
  chainNow,
  getProvider,
  parseEscrowRef,
  getEscrow,
  listEscrows,
  getTimelock,
  getDispute,
  prepareDispute,
  getActivity,
  getVerifiers,
  getV2Readiness,
  getNewEscrowReadiness,
  advanceReadyV3Settlements,
  stateName,
  milestoneName
};
