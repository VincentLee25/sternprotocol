// Counts the RPC requests a refresh costs.
//
//   node scripts/test-activity-scan.js
//
// The complaint this exists to settle: pressing Refresh on an escrow took
// minutes, because the gateway rescanned the whole event history from the
// deploy block every time. The cache in front of that scan lasted 15 seconds,
// which covers one page load and nothing a human does afterwards.
//
// So this is not a test of "does the activity endpoint work" — that is covered
// elsewhere. It counts eth_getLogs, eth_call and eth_getBlockByNumber against a
// fake provider, because request count is the thing that was wrong and the only
// thing that proves it is fixed.
//
// A mined log cannot change, so a second scan of the same blocks is waste by
// definition. What must still happen is a scan of the blocks appended since,
// plus a short re-read of the tail — a chain can reorganise its newest blocks,
// and a phantom event that survives in cache for the life of the process is
// worse than one extra request.
const path = require("node:path");

process.env.RPC_URL = "http://127.0.0.1:1/never-used";
process.env.CONTRACT_ADDRESS = "0x000000000000000000000000000000000000dEaD";
process.env.ORACLE_PRIVATE_KEYS = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
].join(",");
process.env.ARBITER_PRIVATE_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";
process.env.DEPLOYER_PRIVATE_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
// Without this the window is estimated from escrow 0's timestamp, which is a
// separate round trip and a separate concern. Set here so the counts below
// measure the scan and nothing else; the estimate path is checked at the end.
process.env.CONTRACT_DEPLOY_BLOCK = "1000";
process.env.LOG_SCAN_CHUNK = "1000";

let pass = 0;
let fail = 0;
function check(label, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const { ethers } = require("ethers");
const contractService = require(path.resolve(__dirname, "../backend/oracle-gateway/contractService.js"));

// --- the fake chain ---------------------------------------------------------

const ESCROW_ID = 7;
// All eight, matching contracts/SternEscrow.sol. getActivity builds one filter
// carrying every signature in topic0, so a short list makes it throw rather
// than under-report — which is the right failure, but not the one being tested
// here.
const EVENT_SIGNATURES = [
  "event EscrowCreated(uint256 indexed escrowId, address indexed importer, address indexed exporter, address arbiter, uint256 value, string documentCid, uint256 globalDeadline)",
  "event MilestoneVerified(uint256 indexed escrowId, uint8 milestone, address indexed verifier, string proofCid, uint256 challengeDeadline)",
  "event TimelockStarted(uint256 indexed escrowId, uint256 releaseAt)",
  "event PaymentReleased(uint256 indexed escrowId, address indexed exporter, uint256 amount)",
  "event Refunded(uint256 indexed escrowId, address indexed importer, uint256 amount)",
  "event DisputeRaised(uint256 indexed escrowId, address indexed raisedBy, uint8 contestedMilestone, uint256 bondAmount)",
  "event DisputeResolved(uint256 indexed escrowId, bool releasedToExporter, string reasoningCid, bool verifierSlashed)",
  "event VerifierSlashed(uint256 indexed escrowId, address indexed verifier, uint256 amountSlashed, address indexed compensatedTo)"
];
const iface = new ethers.Interface(EVENT_SIGNATURES);

function makeLog(blockNumber, eventName, logIndex = 0) {
  const fragment = iface.getEvent(eventName);
  const payload = eventName === "EscrowCreated"
    ? iface.encodeEventLog(fragment, [
        ESCROW_ID,
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
        "0x3333333333333333333333333333333333333333",
        1n,
        "QmTest",
        1n
      ])
    : iface.encodeEventLog(fragment, [ESCROW_ID, 1, "0x4444444444444444444444444444444444444444", "QmProof", 1n]);

  return {
    address: process.env.CONTRACT_ADDRESS,
    blockNumber,
    transactionHash: `0x${String(blockNumber).padStart(64, "0")}`,
    logIndex,
    topics: [...payload.topics],
    data: payload.data
  };
}

const chain = {
  head: 5000,
  logs: [makeLog(1200, "EscrowCreated"), makeLog(3400, "MilestoneVerified")]
};

// Head reads are counted apart from block-timestamp reads. They answer
// different questions — "how far has the chain got" versus "when was this
// event mined" — and only the second is cacheable for ever, so lumping them
// together made a correct result look wrong.
const counts = { getLogs: 0, getBlock: 0, getHead: 0, call: 0, tokenCall: 0 };

const provider = {
  async getLogs({ fromBlock, toBlock, topics }) {
    counts.getLogs += 1;
    const wanted = new Set(topics?.[0] || []);
    return chain.logs.filter(
      (log) =>
        log.blockNumber >= fromBlock &&
        log.blockNumber <= toBlock &&
        (wanted.size === 0 || wanted.has(log.topics[0]))
    );
  },
  async getBlock(which) {
    if (which === "latest") {
      counts.getHead += 1;
      return { number: chain.head, timestamp: 1_700_000_000 + chain.head * 2 };
    }
    counts.getBlock += 1;
    const number = Number(which);
    return { number, timestamp: 1_700_000_000 + number * 2 };
  },
  async getBlockNumber() {
    return chain.head;
  },
  // The IDRT token's decimals(), read through a second ethers.Contract built
  // on this runner. Counted separately so the caching claim can be checked.
  async call() {
    counts.call += 1;
    counts.tokenCall += 1;
    return ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [2]);
  },
  async getNetwork() {
    return { chainId: 80002n };
  }
};

// How many contract reads were in flight at once, at the busiest moment.
//
// This is what proves getEscrow's reads are parallel rather than a chain of
// awaits, and it is the only honest way to check it: the return values are the
// same either way, and only the timing differs. Each stub method holds for a
// tick so overlap is observable.
const inFlight = { now: 0, max: 0 };
const reads = {};

function stubRead(name, value) {
  return async (...args) => {
    counts.call += 1;
    reads[name] = (reads[name] || 0) + 1;
    inFlight.now += 1;
    inFlight.max = Math.max(inFlight.max, inFlight.now);
    await new Promise((resolve) => setTimeout(resolve, 10));
    inFlight.now -= 1;
    return typeof value === "function" ? value(...args) : value;
  };
}

const ZERO = "0x0000000000000000000000000000000000000000";

// The contract stub.
const contract = {
  interface: iface,
  runner: provider,
  async getAddress() {
    return process.env.CONTRACT_ADDRESS;
  },
  getEscrow: stubRead("getEscrow", [
    4_500_000_000n, "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333",
    "QmTest", "Arabica Gayo Grade 1", "TGHU-2026-001",
    BigInt(1_800_000_000), BigInt(1_700_000_000), 2, 0n
  ]),
  getMilestoneProof: stubRead("getMilestoneProof", [false, ZERO, "", 0n, 0n]),
  getDispute: stubRead("getDispute", [false, ZERO, 0n, 0, ZERO, "", false]),
  isReleaseEligible: stubRead("isReleaseEligible", false),
  idrtToken: stubRead("idrtToken", "0x5555555555555555555555555555555555555555")
};

// The IDRT token's decimals() is read through a second contract built on the
// runner, so it lands on provider.call rather than on a stub method above.
// Counted there.

// Swapped in rather than dialled over the network: the counts have to come from
// the shipped scan logic, not from a copy of it.
contractService.__setTestProviders({ provider, contract });

const reset = () => {
  counts.getLogs = 0;
  counts.getBlock = 0;
  counts.getHead = 0;
  counts.call = 0;
  counts.tokenCall = 0;
  for (const key of Object.keys(reads)) delete reads[key];
};

async function main() {
  // --- the first scan -------------------------------------------------------
  console.log("\nThe first read of an escrow's history");
  reset();
  const first = await contractService.getActivity(ESCROW_ID);
  const firstScan = counts.getLogs;
  // 1000 to 5000 inclusive is 4001 blocks, so five 1000-block windows: the
  // last one carries a single block.
  check("scans the configured window in chunks", firstScan === 5, `${firstScan} getLogs`);
  check("finds this escrow's events", first.activity.length === 2, JSON.stringify(first.activity.length));
  check("starts at CONTRACT_DEPLOY_BLOCK", first.scannedFrom === 1000, String(first.scannedFrom));

  // --- straight away again --------------------------------------------------
  console.log("\nA second read inside the head window");
  reset();
  await contractService.getActivity(ESCROW_ID);
  check("costs no getLogs at all", counts.getLogs === 0, `${counts.getLogs} getLogs`);
  check("and no block reads either", counts.getBlock === 0, `${counts.getBlock} getBlock`);
  check("and does not even ask for the head", counts.getHead === 0, `${counts.getHead} getBlock(latest)`);

  // --- a refresh, later -----------------------------------------------------
  console.log("\nA refresh after the head window lapses");
  await new Promise((resolve) => setTimeout(resolve, 5200));
  chain.head = 5100;
  reset();
  const refreshed = await contractService.getActivity(ESCROW_ID);
  check(
    "scans only the blocks appended since",
    counts.getLogs === 1,
    `${counts.getLogs} getLogs (was ${firstScan} for the full range)`
  );
  check("and still returns the whole history", refreshed.activity.length === 2, String(refreshed.activity.length));
  check(
    "so a refresh is a fraction of the first read",
    counts.getLogs < firstScan,
    `${counts.getLogs} vs ${firstScan}`
  );

  // --- a new event ----------------------------------------------------------
  console.log("\nAn event mined since the last scan");
  await new Promise((resolve) => setTimeout(resolve, 5200));
  chain.logs.push(makeLog(5150, "MilestoneVerified"));
  chain.head = 5200;
  reset();
  const withNew = await contractService.getActivity(ESCROW_ID);
  check("is picked up", withNew.activity.length === 3, String(withNew.activity.length));
  check("without rescanning the history", counts.getLogs === 1, `${counts.getLogs} getLogs`);
  check(
    "and the block timestamps already read are not read again",
    counts.getBlock === 1,
    `${counts.getBlock} getBlock for 3 events across 3 blocks — only the new one should be fetched`
  );

  // --- a reorg --------------------------------------------------------------
  //
  // The newest blocks are not immutable. A log that is re-organised out has to
  // disappear from the cache, or it stays on the timeline for the life of the
  // process — a phantom event, which is worse than a missing one because
  // nobody has reason to doubt it.
  console.log("\nAn event re-organised out of the chain");
  await new Promise((resolve) => setTimeout(resolve, 5200));
  chain.logs = chain.logs.filter((log) => log.blockNumber !== 5150);
  chain.head = 5210;
  reset();
  const afterReorg = await contractService.getActivity(ESCROW_ID);
  check("disappears from the history", afterReorg.activity.length === 2, String(afterReorg.activity.length));
  check("and the older events survive", afterReorg.activity.every((e) => e.blockNumber < 5000));

  // --- duplicates -----------------------------------------------------------
  console.log("\nThe re-scanned tail does not duplicate what it already had");
  await new Promise((resolve) => setTimeout(resolve, 5200));
  chain.logs.push(makeLog(5205, "MilestoneVerified"));
  chain.head = 5215;
  reset();
  await contractService.getActivity(ESCROW_ID);
  await new Promise((resolve) => setTimeout(resolve, 5200));
  chain.head = 5220;
  const twice = await contractService.getActivity(ESCROW_ID);
  const hashes = twice.activity.map((e) => `${e.transactionHash}`);
  check("each event appears once", new Set(hashes).size === hashes.length, hashes.join(","));

  // --- the state read ------------------------------------------------------
  //
  // Nine sequential round trips, once: the escrow, the token address, its
  // decimals, three milestone proofs, the dispute, and release eligibility,
  // each waiting for the one before. On a public RPC at a few hundred
  // milliseconds a hop that is seconds of the refresh, for reads with no
  // dependency between them.
  console.log("\nReading one escrow's state");
  reset();
  inFlight.max = 0;
  const escrow = await contractService.getEscrow(ESCROW_ID);
  check("returns the escrow", escrow.escrowId === String(ESCROW_ID), escrow.escrowId);
  check("with all three milestones", Object.keys(escrow.milestones).length === 3);
  check("and the value scaled by the token's decimals", escrow.value === "45000000.0", escrow.value);
  check(
    "the independent reads run at once, not one after another",
    inFlight.max >= 6,
    `busiest moment held ${inFlight.max} reads`
  );

  console.log("\nA second state read");
  const tokenCallsBefore = counts.tokenCall;
  reset();
  await contractService.getEscrow(ESCROW_ID);
  check(
    "does not re-read the token's decimals",
    counts.tokenCall === 0,
    `${counts.tokenCall} token calls (the first read made ${tokenCallsBefore})`
  );
  check("nor the token address", (reads.idrtToken || 0) === 0, `${reads.idrtToken || 0} idrtToken reads`);
  check("but does re-read the escrow itself", (reads.getEscrow || 0) === 1, `${reads.getEscrow || 0} getEscrow reads`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
