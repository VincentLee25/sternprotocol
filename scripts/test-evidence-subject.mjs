// Does a failing reading now say which shipment it is about?
process.env.PINATA_JWT = "";
process.env.IPFS_API_URL = "http://127.0.0.1:5661";
process.env.IPFS_GATEWAYS = "http://127.0.0.1:5661";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolved from this file, not from an absolute path: a hardcoded /home/...
// specifier runs only on the machine it was written on.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const GATEWAY = path.join(REPO, "backend", "oracle-gateway");
const require = createRequire(path.join(GATEWAY, "index.js"));
const gw = (n) => path.join(GATEWAY, n);
const FIXTURE = path.join(REPO, "docs", "demo", "e-bl-TGHU-2026-001.pdf");
if (!fs.existsSync(FIXTURE)) {
  const { buildPdf } = require(path.join(REPO, "scripts", "make-demo-ebl.js"));
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, buildPdf("TGHU-2026-001"));
}
const stub = spawn(process.execPath, [path.join(HERE, "test-support", "ipfs-node-stub.js")],
  { stdio: "ignore", env: { ...process.env, STUB_PORT: "5661" } });
let pass = 0, fail = 0;
const ok = (l, c, d="") => { c ? (pass++, console.log("  ok   "+l)) : (fail++, console.log(`  FAIL ${l}${d?" — "+d:""}`)); };
for (let i=0;i<40;i++){try{await fetch("http://127.0.0.1:5661/ipfs/x");break}catch{await new Promise(r=>setTimeout(r,100))}}
const ipfs = require(gw("ipfsService.js"));
const pinned = await ipfs.pinDocument(fs.readFileSync(FIXTURE), "e.pdf");
require.cache[require.resolve(gw("contractService.js"))] = {
  id: require.resolve(gw("contractService.js")), loaded: true,
  exports: { getEscrow: async () => ({ documentCid: pinned.cid, containerRef: "TGHU-2026-001", commodity: "Arabica Gayo Grade 1" }) } };
delete require.cache[require.resolve(gw("oracleService.js"))];
const { getMockStatus } = require(gw("oracleService.js"));

for (const [fault, source] of [["ais","AIS"],["vgm","VGM"],["inspection","inspection"],["customs","CEISA"]]) {
  const s = await getMockStatus("20", { fault });
  const item = s.evidence.find(e => e.source === source && !e.passed);
  console.log(`\nfault ${fault} -> ${source}`);
  ok("ada baris gagal", Boolean(item));
  if (!item) continue;
  console.log(`  subject : ${item.subject}`);
  console.log(`  expected: ${item.expected}   actual: ${item.actual}`);
  console.log(`  basis   : ${item.basis}`);
  ok("subject menyebut sesuatu dari dokumen", Boolean(item.subject));
  ok("basis = bill of lading", item.basis === "bill of lading", item.basis);
}

const s = await getMockStatus("20", { fault: "ais" });
const ais = s.evidence.find(e => e.source === "AIS");
ok("\nsubject AIS menyebut nama kapal", /MV SAMUDRA BIRU/.test(ais.subject), ais.subject);
ok("subject AIS menyebut voyage", /0264E/.test(ais.subject));
ok("subject AIS menyebut rute", /Belawan.*Rotterdam/.test(ais.subject));
const vgmS = (await getMockStatus("20", { fault: "vgm" })).evidence.find(e => e.source === "VGM");
ok("VGM menampilkan berat, bukan boolean", /kg/.test(String(vgmS.expected)) && /kg/.test(String(vgmS.actual)), `${vgmS.expected} / ${vgmS.actual}`);
ok("berat harapan dari dokumen (20.450 kg)", /20\.450/.test(String(vgmS.expected)), String(vgmS.expected));

stub.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
