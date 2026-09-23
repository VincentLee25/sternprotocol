// Times each chain read GET /escrows/:id makes, one at a time, and names the
// one that hangs.
//
//   node scripts/probe-escrow.js 16
//   node scripts/probe-escrow.js 16 --each-rpc      (repeat against every RPC)
//
// GET /escrows/16 issues seven reads in parallel, so a timeout on the route
// says only that ONE of them did not come back. This runs them in sequence,
// each on its own clock, and prints how long each took — which turns "escrow 16
// times out" into "getMilestoneProof(16, shipped) takes 31s on publicnode".
//
// Read-only. It calls nothing that writes, needs no keys beyond RPC_URL and
// CONTRACT_ADDRESS, and does not touch the database, the contract or the UI.
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const { config } = require("../backend/oracle-gateway/config");

const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 20000);
const escrowId = process.argv[2] || "16";
const eachRpc = process.argv.includes("--each-rpc");

function loadAbi() {
  const artifact = path.resolve(__dirname, "../artifacts/contracts/SternEscrow.sol/SternEscrow.json");
  if (!fs.existsSync(artifact)) {
    console.error("Contract artifact missing. Run `npx hardhat compile` first.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(artifact, "utf8")).abi;
}

/** A call that cannot hang for ever, and that reports how long it took. */
async function timed(label, run) {
  const started = Date.now();
  let timer;
  try {
    const result = await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TIMEOUT after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
      })
    ]);
    const ms = Date.now() - started;
    console.log(`  ${String(ms).padStart(6)}ms  ok       ${label}`);
    return { label, ms, ok: true, result };
  } catch (error) {
    const ms = Date.now() - started;
    const timedOut = /TIMEOUT/.test(error.message);
    console.log(
      `  ${String(ms).padStart(6)}ms  ${timedOut ? "TIMEOUT " : "ERROR   "} ${label}` +
        (timedOut ? "" : ` — ${error.shortMessage || error.message}`)
    );
    return { label, ms, ok: false, timedOut, error };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(rpcUrl) {
  console.log(`\nRPC  ${rpcUrl}`);
  console.log(`Contract ${config.contractAddress}`);
  console.log(`Escrow #${escrowId}, timeout ${TIMEOUT_MS}ms per call\n`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(config.contractAddress, loadAbi(), provider);
  const results = [];

  // The node itself, first. If this is slow, nothing below it means anything.
  results.push(await timed("eth_blockNumber (is the RPC alive at all)", () => provider.getBlockNumber()));

  // The seven reads GET /escrows/:id makes, in the order contractService issues
  // them — except here they run one after another, so the slow one is visible.
  results.push(await timed(`getEscrow(${escrowId})`, () => contract.getEscrow(escrowId)));

  const token = await timed("idrtToken()", () => contract.idrtToken());
  results.push(token);
  if (token.ok) {
    const erc20 = new ethers.Contract(token.result, ["function decimals() view returns (uint8)"], provider);
    results.push(await timed("decimals() on the IDRT token", () => erc20.decimals()));
  }

  for (const [name, id] of [["inspected", 1], ["shipped", 2], ["arrived_cleared", 3]]) {
    results.push(await timed(`getMilestoneProof(${escrowId}, ${name})`, () => contract.getMilestoneProof(escrowId, id)));
  }

  results.push(await timed(`getDispute(${escrowId})`, () => contract.getDispute(escrowId)));
  results.push(await timed(`isReleaseEligible(${escrowId})`, () => contract.isReleaseEligible(escrowId)));

  const bad = results.filter((r) => !r.ok);
  const slowest = results.reduce((a, b) => (b.ms > a.ms ? b : a), results[0]);

  console.log("");
  if (bad.length === 0) {
    console.log(`  All reads answered. Slowest: ${slowest.label} at ${slowest.ms}ms.`);
  } else {
    for (const r of bad) {
      console.log(`  ${r.timedOut ? "TIMED OUT" : "FAILED"}: ${r.label}`);
    }
  }
  return { rpcUrl, results, bad };
}

async function main() {
  if (!config.contractAddress) {
    console.error("CONTRACT_ADDRESS is not set in .env.");
    process.exit(1);
  }
  // Checked before anything is printed, so a missing artifact does not look
  // like an RPC problem.
  loadAbi();

  // Each endpoint separately when asked, because "the gateway times out" and
  // "this one provider times out" call for different fixes: the first is the
  // contract or the escrow, the second is the RPC, and RPC_FALLBACK_URLS means
  // a single run can silently be answered by a different node than the one
  // being blamed.
  const urls = eachRpc ? [config.rpcUrl, ...config.rpcFallbackUrls].filter(Boolean) : [config.rpcUrl];

  const runs = [];
  for (const url of urls) runs.push(await probe(url));

  if (runs.length > 1) {
    console.log("\nAcross endpoints:");
    for (const run of runs) {
      const failed = run.bad.map((r) => r.label).join(", ");
      console.log(`  ${run.rpcUrl}\n    ${failed ? `problems: ${failed}` : "all reads answered"}`);
    }
    const everywhere = runs.every((run) => run.bad.length > 0);
    console.log(
      everywhere
        ? "\n  Every endpoint has a problem, so this is not one provider being slow."
        : "\n  At least one endpoint answered everything, so the failure belongs to the endpoints that did not."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
