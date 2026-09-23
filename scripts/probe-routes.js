// Times the gateway's escrow routes the way the dashboard actually hits them.
//
//   node scripts/probe-routes.js
//   node scripts/probe-routes.js --api http://localhost:4000 --id 16
//
// probe-escrow.js showed that every chain read for one escrow answers in around
// 110ms. That rules out a broken escrow and a bad RPC, and it says nothing at
// all about what the dashboard does — which is not one read but a burst:
//
//   GET /escrows          the gateway loops getEscrow(id) for EVERY escrow,
//                         one after another, server-side
//   GET /escrows/:id      once per row, and each one issues seven chain reads
//
// With 28 escrows that is roughly 28 + 28x7 = 196 RPC calls to open one page.
// A public endpoint that answers a single call in 110ms may rate-limit a burst
// of two hundred, and a 429 answered by a retry or a fallback endpoint is the
// same wall-clock cost as a slow call — which is what a page-level timeout sees.
//
// Read-only: three GETs and nothing else. It touches no database, no contract,
// and no configuration.
const API = (() => {
  const i = process.argv.indexOf("--api");
  return (i > -1 ? process.argv[i + 1] : process.env.API_URL) || "http://localhost:4000";
})();
const ID = (() => {
  const i = process.argv.indexOf("--id");
  return i > -1 ? process.argv[i + 1] : "16";
})();

async function timed(label, url) {
  const started = Date.now();
  try {
    const res = await fetch(url);
    const body = await res.text();
    const ms = Date.now() - started;
    const ok = res.ok;
    console.log(
      `  ${String(ms).padStart(6)}ms  ${ok ? "ok      " : `HTTP ${res.status}`}  ${label}`
    );
    return { label, ms, ok, status: res.status, body };
  } catch (error) {
    const ms = Date.now() - started;
    console.log(`  ${String(ms).padStart(6)}ms  FAILED    ${label} — ${error.message}`);
    return { label, ms, ok: false, error };
  }
}

async function main() {
  console.log(`\nGateway ${API}\n`);

  console.log("1. the two routes on their own");
  const list = await timed("GET /escrows", `${API}/escrows`);
  const one = await timed(`GET /escrows/${ID}`, `${API}/escrows/${ID}`);

  if (!list.ok) {
    console.log("\n  The list did not answer, so there is nothing to burst. Fix that first.");
    return;
  }

  let rows = [];
  try {
    rows = JSON.parse(list.body).escrows || [];
  } catch {
    console.log("\n  The list did not return JSON.");
    return;
  }
  console.log(`\n  ${rows.length} escrows in the registry.`);

  console.log("\n2. the same list a second time (warm caches)");
  // The gateway caches the token's decimals and the head block, so a second
  // read separates "the chain is slow" from "the first read pays for warming".
  await timed("GET /escrows", `${API}/escrows`);

  console.log("\n3. the burst the dashboard makes: every row's detail at once");
  const burstStarted = Date.now();
  const results = await Promise.all(
    rows.map((row) =>
      timed(`GET /escrows/${row.escrowId}`, `${API}/escrows/${row.escrowId}`)
    )
  );
  const burstMs = Date.now() - burstStarted;

  const failed = results.filter((r) => !r.ok);
  const slowest = results.reduce((a, b) => (b.ms > a.ms ? b : a), results[0] || { ms: 0, label: "-" });
  const total = results.reduce((sum, r) => sum + r.ms, 0);

  console.log(`\n  Wall clock for the whole burst: ${burstMs}ms`);
  console.log(`  Slowest single row: ${slowest.label} at ${slowest.ms}ms`);
  console.log(`  Mean per row: ${Math.round(total / (results.length || 1))}ms`);
  console.log(`  Rows that failed: ${failed.length}`);
  for (const r of failed) console.log(`    ${r.label} — ${r.status || r.error?.message}`);

  console.log("");
  if (burstMs > 15000) {
    console.log(
      "  The burst alone exceeds the 15s the dashboard used to allow for everything,\n" +
        "  so the timeout was the page load as a whole rather than any one escrow."
    );
  } else if (slowest.ms > 5000) {
    console.log(
      `  One row is far slower than the rest (${slowest.label}). Run\n` +
        `  node scripts/probe-escrow.js <that id> --each-rpc to see which read it is.`
    );
  } else {
    console.log(
      "  Nothing here is slow. If the dashboard still times out, the difference is\n" +
        "  the browser: check the Network tab for which request hangs, and whether it\n" +
        "  is going to this gateway at all."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
