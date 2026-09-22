// The gate as the gateway actually computes it, with a real pin and a real
// read-back, against a stand-in IPFS node.
process.env.PINATA_JWT = "";
process.env.IPFS_API_URL = "http://127.0.0.1:5641";
process.env.IPFS_GATEWAYS = "http://127.0.0.1:5641";

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Relative to this file, so the harness runs from any checkout on any platform.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const GATEWAY = path.join(REPO, "backend", "oracle-gateway");
const require = createRequire(path.join(GATEWAY, "index.js"));
const gw = (name) => path.join(GATEWAY, name);

const stub = spawn(process.execPath,
  [path.join(HERE, "ipfs-node-stub.js")],
  { stdio: "ignore", env: { ...process.env, STUB_PORT: "5641" } });

let pass = 0, fail = 0;
const check = (l, a, e) => { a === e ? (pass++, console.log("  ok   " + l)) : (fail++, console.log(`  FAIL ${l} — mau ${e}, dapat ${a}`)); };

for (let i = 0; i < 40; i++) { try { await fetch("http://127.0.0.1:5641/ipfs/x"); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

// Grab the real gate before the chain stub replaces this module in the cache.
const { milestonePassed } = require(gw("contractService.js"));
const ipfs = require(gw("ipfsService.js"));
const FIXTURE = path.join(REPO, "docs", "demo", "e-bl-TGHU-2026-001.pdf");
if (!fs.existsSync(FIXTURE)) {
  const { buildPdf } = require(path.join(REPO, "scripts", "make-demo-ebl.js"));
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, buildPdf("TGHU-2026-001"));
}
const pdf = fs.readFileSync(FIXTURE);
const pinned = await ipfs.pinDocument(pdf, "e-bl.pdf");

function stubChain(documentCid, containerRef) {
  require.cache[require.resolve(gw("contractService.js"))] = {
    id: require.resolve(gw("contractService.js")), loaded: true,
    exports: { getEscrow: async () => ({ documentCid, containerRef }) }
  };
  delete require.cache[require.resolve(gw("oracleService.js"))];
  return require(gw("oracleService.js")).getMockStatus;
}

console.log("\n1. dokumen benar untuk kontainer ini");
let s = await (stubChain(pinned.cid, "TGHU-2026-001"))("1");
check("eblCidValid", s.verification.eblCidValid, true);
check("eblCheckable", s.verification.eblCheckable, true);
check("allVerified", s.allVerified, true);

console.log("\n2. dokumen sah, tapi untuk kontainer lain -> harus memblokir");
s = await (stubChain(pinned.cid, "MSKU-9999-999"))("2");
check("eblCidValid", s.verification.eblCidValid, false);
check("eblCheckable (diperiksa sungguhan)", s.verification.eblCheckable, true);
for (const m of ["inspected", "shipped", "arrived_cleared"]) check(`milestone ${m} diblokir`, milestonePassed(m, s.verification), false);

console.log("\n3. CID tidak bisa diambil -> TIDAK boleh memblokir");
s = await (stubChain("QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", "TGHU-2026-001"))("3");
check("eblCidValid", s.verification.eblCidValid, false);
check("eblCheckable", s.verification.eblCheckable, false);
for (const m of ["inspected", "shipped", "arrived_cleared"]) check(`milestone ${m} jalan terus`, milestonePassed(m, s.verification), true);

console.log("\n4. tanpa layanan pinning -> persis seperti sebelumnya");
process.env.IPFS_API_URL = "";
delete require.cache[require.resolve(gw("config.js"))];
delete require.cache[require.resolve(gw("ipfsService.js"))];
s = await (stubChain(pinned.cid, "TGHU-2026-001"))("4");
check("mode", s.sources.ipfs.mode, "mock");
check("eblCheckable", s.verification.eblCheckable, true);
for (const m of ["inspected", "shipped", "arrived_cleared"]) check(`milestone ${m} jalan terus`, milestonePassed(m, s.verification), true);

stub.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
