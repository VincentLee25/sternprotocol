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

function loadAbi() {
  const artifactPath = path.resolve(__dirname, "../../artifacts/contracts/SternEscrow.sol/SternEscrow.json");
  if (!fs.existsSync(artifactPath)) {
    const error = new Error("Contract artifact not found. Run `npm run compile` first.");
    error.statusCode = 400;
    error.code = "CONTRACT_ARTIFACT_MISSING";
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

function getContract(signerOrProvider) {
  return new ethers.Contract(config.contractAddress, loadAbi(), signerOrProvider);
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

function milestonePassed(milestone, verification) {
  const normalized = normalizeMilestone(milestone);
  if (normalized === MILESTONES.inspected) {
    return verification.vgmMatch === true && verification.inspectionPassed === true;
  }
  if (normalized === MILESTONES.shipped) return verification.aisDeparted === true;
  if (normalized === MILESTONES.arrivedcleared) return verification.ceisaApproved === true;
  return false;
}

function serializeEscrow(escrow, decimals = 2) {
  return {
    contractValue: escrow.contractValue.toString(),
    value: ethers.formatUnits(escrow.contractValue, decimals),
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

async function getIdrtDecimals(contract) {
  const tokenAddress = await contract.idrtToken();
  const token = new ethers.Contract(tokenAddress, ["function decimals() view returns (uint8)"], contract.runner);
  return Number(await token.decimals());
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
  const provider = getProvider();
  const contract = getContract(provider);
  const normalized = normalizeMilestone(milestone);
  const proof = await contract.getMilestoneProof(contractId, normalized);
  return {
    contractId: String(contractId),
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
  const provider = getProvider();
  const contract = getContract(provider);
  const id = Number(contractId);
  if (!Number.isSafeInteger(id) || id < 0) {
    const error = new Error("escrowId must be a non-negative integer.");
    error.statusCode = 400;
    error.code = "INVALID_ESCROW_ID";
    throw error;
  }
  const raw = await contract.getEscrow(id);
  const decimals = await getIdrtDecimals(contract);
  const escrow = serializeEscrow({
    contractValue: raw[0], importer: raw[1], exporter: raw[2], arbiter: raw[3],
    documentCid: raw[4], commodity: raw[5], containerRef: raw[6], globalDeadline: raw[7],
    createdAt: raw[8], state: raw[9], timelockReleaseAt: raw[10]
  }, decimals);

  const milestones = {};
  for (const name of ["inspected", "shipped", "arrived_cleared"]) {
    milestones[name] = await getOnchainEvidence(id, name);
  }
  const dispute = await getDispute(id);
  const releaseEligible = await contract.isReleaseEligible(id);
  return { escrowId: String(id), ...escrow, milestones, dispute, releaseEligible };
}

async function listEscrows({ address, role, state } = {}) {
  const provider = getProvider();
  const contract = getContract(provider);
  const total = Number(await contract.nextEscrowId());
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
  const rows = [];
  const decimals = await getIdrtDecimals(contract);

  for (let id = 0; id < total; id += 1) {
    const raw = await contract.getEscrow(id);
    const matchesAddress = !normalizedAddress || [raw[1], raw[2], raw[3]].some((a) => a.toLowerCase() === normalizedAddress.toLowerCase());
    const matchesRole = !normalizedRole || raw[{ importer: 1, exporter: 2, arbiter: 3 }[normalizedRole]].toLowerCase() === normalizedAddress.toLowerCase();
    const stateLabel = stateName(raw[9]);
    if (normalizedAddress && !matchesAddress) continue;
    if (normalizedRole && !matchesRole) continue;
    if (state && String(state).toLowerCase() !== stateLabel.toLowerCase()) continue;
    rows.push({ escrowId: String(id), ...serializeEscrow({
      contractValue: raw[0], importer: raw[1], exporter: raw[2], arbiter: raw[3],
      documentCid: raw[4], commodity: raw[5], containerRef: raw[6], globalDeadline: raw[7],
      createdAt: raw[8], state: raw[9], timelockReleaseAt: raw[10]
    }, decimals) });
  }
  return { escrows: rows, total: rows.length, nextEscrowId: String(total) };
}

async function getTimelock(contractId) {
  const provider = getProvider();
  const contract = getContract(provider);
  const raw = await contract.getEscrow(contractId);
  // Chain clock here too, so the countdown cannot reach zero while
  // isReleaseEligible still says no — which reads as a stuck button.
  const now = await chainNow(provider);
  const releaseAt = Number(raw[10]);
  const challengeWindow = await contract.challengeWindowSeconds();
  const dispute = await contract.getDispute(contractId);
  const disputeMilestoneId = Math.min(Math.max(Number(raw[9]), 1), 3);
  const relevantProof = await contract.getMilestoneProof(contractId, disputeMilestoneId);
  const canDisputeMilestone = relevantProof[0] && BigInt(now) <= relevantProof[4];
  const canDisputeGeneral = Number(raw[9]) === 4 && BigInt(now) < raw[10];
  const canRelease = await contract.isReleaseEligible(contractId);
  return {
    escrowId: String(contractId),
    state: stateName(raw[9]),
    timelockReleaseAt: toIso(raw[10]),
    timelockReleaseAtUnix: raw[10].toString(),
    secondsRemaining: Math.max(0, releaseAt - now),
    canRelease,
    canDispute: !dispute.open && (canDisputeMilestone || canDisputeGeneral),
    challengeWindowSeconds: challengeWindow.toString()
  };
}

async function getDispute(contractId) {
  const provider = getProvider();
  const contract = getContract(provider);
  const d = await contract.getDispute(contractId);
  return {
    escrowId: String(contractId),
    open: d[0],
    raisedBy: d[1],
    bondAmount: d[2].toString(),
    contestedMilestone: milestoneName(d[3]),
    contestedMilestoneId: Number(d[3]),
    resolvedVerifier: d[4],
    reasoningCid: d[5],
    releaseToExporter: d[6],
    resolved: !d[0] && (d[5] !== "" || d[4] !== ethers.ZeroAddress)
  };
}

async function prepareDispute(contractId, contestedMilestone = "none") {
  const provider = getProvider();
  const contract = getContract(provider);
  const normalized = normalizeMilestone(contestedMilestone);
  const raw = await contract.getEscrow(contractId);
  const dispute = await contract.getDispute(contractId);
  const bondBps = await contract.disputeBondBps();
  const bondAmount = (raw[0] * bondBps) / 10000n;
  const now = BigInt(await chainNow(provider));
  let windowStillOpen = false;
  let challengeDeadline = 0n;
  if (normalized === 0) {
    windowStillOpen = Number(raw[9]) === 4 && now < raw[10];
    challengeDeadline = raw[10];
  } else {
    const proof = await contract.getMilestoneProof(contractId, normalized);
    challengeDeadline = proof[4];
    windowStillOpen = proof[0] && now <= proof[4];
  }
  const iface = new ethers.Interface(loadAbi());
  const raiseDisputeData = iface.encodeFunctionData("raiseDispute", [contractId, normalized]);
  const tokenAddress = await contract.idrtToken();
  const tokenIface = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
  return {
    escrowId: String(contractId),
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
      contractAddress: config.contractAddress,
      function: "raiseDispute(uint256,uint8)",
      calldata: raiseDisputeData
    },
    requiredApproval: {
      tokenAddress,
      spender: config.contractAddress,
      amount: bondAmount.toString(),
      calldata: tokenIface.encodeFunctionData("approve", [config.contractAddress, bondAmount])
    },
    note: "Backend only prepares data. The importer/exporter must submit the approval and raiseDispute transactions from their own Particle Smart Account."
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
async function activityWindow(provider, contract) {
  const latest = await latestBlock(provider);
  const to = latest?.number ?? (await provider.getBlockNumber());
  if (config.contractDeployBlock != null) return { from: config.contractDeployBlock, to };

  try {
    const createdAt = Number((await contract.getEscrow(0))[8]);
    if (createdAt > 0 && latest?.timestamp > createdAt) {
      const blocksAgo = Math.ceil((latest.timestamp - createdAt) / AVG_BLOCK_SECONDS);
      const margin = Math.ceil(blocksAgo * 0.2) + 5000;
      return { from: Math.max(0, to - blocksAgo - margin), to };
    }
  } catch {
    // No escrow 0, or the chain is unreachable — fall through.
  }
  return { from: Math.max(0, to - 500_000), to };
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

// One scan serves every escrow.
//
// The range is the same for all of them, so scanning it once per escrow meant
// doing identical work a dozen times over — with the window this needs, 42
// requests each instead of 42 in total. Cached briefly: long enough for one
// dashboard load, short enough that a new transaction shows up on the next one.
let logCache = { key: null, result: null, at: 0 };
const LOG_CACHE_MS = 15_000;

async function contractLogs(provider, contract, filter, from, to) {
  const key = `${filter.address}:${from}:${Math.floor(to / 50)}`;
  if (logCache.key === key && Date.now() - logCache.at < LOG_CACHE_MS) return logCache.result;
  const result = await getLogsInRange(provider, filter, from, to);
  logCache = { key, result, at: Date.now() };
  return result;
}

async function getActivity(contractId) {
  const provider = getProvider();
  const contract = getContract(provider);
  const id = Number(contractId);
  const events = [];
  const specs = [
    ["EscrowCreated", "escrow_created"],
    ["MilestoneVerified", "milestone_verified"],
    ["TimelockStarted", "timelock_started"],
    ["PaymentReleased", "payment_released"],
    ["Refunded", "refunded"],
    ["DisputeRaised", "dispute_raised"],
    ["DisputeResolved", "dispute_resolved"],
    ["VerifierSlashed", "verifier_slashed"]
  ];
  const { from, to } = await activityWindow(provider, contract);

  // ONE filter for all eight events, and no escrow id in it.
  //
  // Every one of these declares escrowId as its first indexed parameter, so a
  // single filter carries all eight signatures in topic0. Leaving topic1 open
  // means the scan is identical for every escrow, so it can be done once and
  // shared — the difference between 42 requests and 588 on a dashboard holding a
  // dozen escrows. The id is matched below, on data already in hand.
  const byTopic = new Map();
  for (const [eventName, type] of specs) {
    byTopic.set(contract.interface.getEvent(eventName).topicHash, { eventName, type });
  }
  const filter = {
    address: await contract.getAddress(),
    topics: [[...byTopic.keys()]]
  };

  const idTopic = ethers.zeroPadValue(ethers.toBeHex(id), 32).toLowerCase();
  const { logs: all, prunedThrough } = await contractLogs(provider, contract, filter, from, to);
  const logs = all.filter((log) => String(log.topics[1] || "").toLowerCase() === idTopic);

  // One read per block, not one per event. Three milestones committed in the
  // same block used to cost three identical round trips.
  const blockCache = new Map();
  const blockAt = async (number) => {
    if (!blockCache.has(number)) blockCache.set(number, await provider.getBlock(number));
    return blockCache.get(number);
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
    escrowId: String(id),
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
async function verifyAndSubmitAll(contractId, verification, { proofCidPrefix = "bafy-verified" } = {}) {
  const provider = getProvider();
  const contract = getContract(provider);
  const results = {};
  let stop = false;

  for (const name of ["inspected", "shipped", "arrived_cleared"]) {
    const id = normalizeMilestone(name);

    if (stop) {
      results[name] = { status: "blocked", reason: "An earlier milestone is not committed yet." };
      continue;
    }

    const proof = await contract.getMilestoneProof(contractId, id);
    if (proof[0]) {
      results[name] = { status: "already_submitted", proofCid: proof[2], verifier: proof[1] };
      continue;
    }

    // The contract wants the escrow sitting exactly one state below this
    // milestone. Asking it anyway would just burn gas on a revert.
    // Positional, matching the rest of this file — EscrowView puts state at 9.
    // Named access depends on the ABI carrying output names, and nothing else
    // here relies on that.
    const state = Number((await contract.getEscrow(contractId))[9]);
    if (state !== id - 1) {
      results[name] = { status: "blocked", reason: `Escrow is ${stateName(state)}; this milestone needs ${stateName(id - 1)}.` };
      stop = true;
      continue;
    }

    if (id > 1) {
      const prev = await contract.getMilestoneProof(contractId, id - 1);
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
      results[name] = {
        status: "source_failed",
        reason: "The automated check did not pass, so no proof was written on chain."
      };
      stop = true;
      continue;
    }

    try {
      const submitted = await submitMilestoneProof(contractId, name, `${proofCidPrefix}-${contractId}-${name}`, verification);
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
      results[name] = { status: "error", reason: raw };
      stop = true;
    }
  }

  return { contractId: String(contractId), results };
}

async function submitMilestoneProof(contractId, milestone, proofCid, verification) {
  const provider = getProvider();
  const wallets = getVerifierWallets(provider);
  const wallet = pickVerifier(wallets, milestone);
  const contract = getContract(wallet);
  const passed = milestonePassed(milestone, verification);
  if (!passed) {
    const error = new Error("Automated verification failed; milestone was not submitted on-chain.");
    error.statusCode = 422;
    error.code = "AUTOMATED_CHECK_FAILED";
    throw error;
  }
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [passed]);
  const tx = await contract.submitMilestoneProof(contractId, normalizeMilestone(milestone), proofCid, payload);
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
  const tx = await getContract(wallet).resolveDispute(
    contractId,
    options.releaseToExporter,
    options.reasoningCid.trim(),
    options.slashVerifier,
    options.bondFrivolous
  );
  const receipt = await tx.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, arbiter: wallet.address };
}

module.exports = {
  submitMilestoneProof,
  verifyAndSubmitAll,
  resolveDispute,
  normalizeMilestone,
  getOracleIdentity,
  getOracleStatus,
  getOnchainEvidence,
  chainNow,
  getProvider,
  getEscrow,
  listEscrows,
  getTimelock,
  getDispute,
  prepareDispute,
  getActivity,
  getVerifiers,
  stateName,
  milestoneName
};
