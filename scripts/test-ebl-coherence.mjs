// Do the four feeds now describe the shipment in the uploaded document?
process.env.PINATA_JWT = "";
process.env.IPFS_API_URL = "http://127.0.0.1:5651";
process.env.IPFS_GATEWAYS = "http://127.0.0.1:5651";

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Resolved from this file's own location, never from an absolute path.
// A hardcoded /home/... specifier works only on the machine it was written on:
// on Windows it resolved to \home\user\... and the whole suite died with
// MODULE_NOT_FOUND before running a single check.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const GATEWAY = path.join(REPO, "backend", "oracle-gateway");
const require = createRequire(path.join(GATEWAY, "index.js"));
const gw = (name) => path.join(GATEWAY, name);

const stub = spawn(process.execPath,
  // fileURLToPath, not URL.pathname: on Windows the latter yields
  // "/C:/Users/..." which spawn cannot open.
  [path.join(HERE, "test-support", "ipfs-node-stub.js")],
  { stdio: "ignore", env: { ...process.env, STUB_PORT: "5651" } });

let pass = 0, fail = 0;
const check = (l, a, e) => { String(a) === String(e) ? (pass++, console.log(`  ok   ${l} = ${a}`)) : (fail++, console.log(`  FAIL ${l} — mau ${e}, dapat ${a}`)); };

for (let i = 0; i < 40; i++) { try { await fetch("http://127.0.0.1:5651/ipfs/x"); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

const ipfs = require(gw("ipfsService.js"));
const FIXTURE = path.join(REPO, "docs", "demo", "e-bl-TGHU-2026-001.pdf");
if (!fs.existsSync(FIXTURE)) {
  // *.pdf is gitignored, so a fresh clone has no fixture. Build it.
  const { buildPdf } = require(path.join(REPO, "scripts", "make-demo-ebl.js"));
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, buildPdf("TGHU-2026-001"));
}
const pdf = fs.readFileSync(FIXTURE);
const pinned = await ipfs.pinDocument(pdf, "e-bl.pdf");

function withEscrow(documentCid, containerRef, commodity) {
  require.cache[require.resolve(gw("contractService.js"))] = {
    id: require.resolve(gw("contractService.js")), loaded: true,
    exports: { getEscrow: async () => ({ documentCid, containerRef, commodity }) }
  };
  delete require.cache[require.resolve(gw("oracleService.js"))];
  return require(gw("oracleService.js")).getMockStatus;
}

console.log("\n=== dokumen benar: feed harus bercerita hal yang sama ===");
let s = await (withEscrow(pinned.cid, "TGHU-2026-001", "Arabica Gayo Grade 1"))("20");
console.log("  -- dari dokumen --");
check("e-BL vessel", s.sources.ipfs.fields.vessel, "MV SAMUDRA BIRU");
check("e-BL VGM (kg, angka)", s.sources.ipfs.fields.verifiedGrossMassKg, 20450);
check("e-BL gross weight (kg, angka)", s.sources.ipfs.fields.grossWeightKg, 19200);
console.log("  -- feed VGM --");
check("vgm.containerRef", s.sources.vgm.containerRef, "TGHU-2026-001");
check("vgm.expected_vgm_kg", s.sources.vgm.expected_vgm_kg, 20450);
check("vgm.port", s.sources.vgm.port, "Belawan, Indonesia (IDBLW)");
check("vgm.source", s.sources.vgm.source, "bill_of_lading");
console.log("  -- feed AIS --");
check("ais.vessel", s.sources.ais.vessel, "MV SAMUDRA BIRU");
check("ais.voyage", s.sources.ais.voyage, "0264E");
check("ais.port_of_discharge", s.sources.ais.port_of_discharge, "Rotterdam, Netherlands (NLRTM)");
console.log("  -- feed CEISA --");
check("ceisa.bill_of_lading_no", s.sources.ceisa.bill_of_lading_no, "IDSUBU2026001");
check("ceisa.containerRef", s.sources.ceisa.containerRef, "TGHU-2026-001");
console.log("  -- feed inspeksi --");
check("inspection.location", s.sources.inspection.location, "Belawan, Indonesia (IDBLW)");
check("inspection.commodity", s.sources.inspection.commodity, "Arabica Gayo Grade 1");
check("semua lolos", s.allVerified, true);

console.log("\n=== fault vgm: hanya angkanya yang berubah, dasarnya tetap dokumen ===");
s = await (withEscrow(pinned.cid, "TGHU-2026-001", "Arabica Gayo Grade 1"))("20", { fault: "vgm" });
check("expected tetap dari dokumen", s.sources.vgm.expected_vgm_kg, 20450);
check("actual bergeser 500", s.sources.vgm.vgm_kg, 20950);
check("vgm_match", s.sources.vgm.vgm_match, false);
check("kontainer tetap benar", s.sources.vgm.containerRef, "TGHU-2026-001");
check("AIS tidak tersentuh", s.sources.ais.departure_status, "departed");

console.log("\n=== fault ais: kapal tetap kapal dokumen, statusnya yang berubah ===");
s = await (withEscrow(pinned.cid, "TGHU-2026-001", "Arabica Gayo Grade 1"))("20", { fault: "ais" });
check("ais.vessel tetap", s.sources.ais.vessel, "MV SAMUDRA BIRU");
check("ais.departure_status", s.sources.ais.departure_status, "in_port");
check("VGM tidak tersentuh", s.sources.vgm.vgm_match, true);

console.log("\n=== dokumen untuk kontainer lain: feed tidak boleh memakai datanya ===");
s = await (withEscrow(pinned.cid, "MSKU-9999-999", "Arabica Gayo Grade 1"))("21");
check("e-BL gagal", s.verification.eblCidValid, false);
check("kontainer dari kontrak, bukan dokumen", s.sources.vgm.containerRef, "MSKU-9999-999");
check("vessel tidak diambil dari dokumen yang gagal", s.sources.ais.vessel, "null");
check("VGM kembali ke sintetis", s.sources.vgm.source, "synthetic");
check("expected sintetis (24000+21)", s.sources.vgm.expected_vgm_kg, 24021);

console.log("\n=== tanpa layanan pinning: perilaku lama utuh ===");
process.env.IPFS_API_URL = "";
delete require.cache[require.resolve(gw("config.js"))];
delete require.cache[require.resolve(gw("ipfsService.js"))];
s = await (withEscrow(pinned.cid, "TGHU-2026-001", "Kopi"))("20");
check("mode", s.sources.ipfs.mode, "mock");
check("kontainer tetap dari kontrak", s.sources.vgm.containerRef, "TGHU-2026-001");
check("VGM sintetis", s.sources.vgm.expected_vgm_kg, 24020);
check("port kembali ke bawaan", s.sources.vgm.port, "Tanjung Priok");

stub.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
