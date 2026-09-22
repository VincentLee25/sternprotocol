// Do the four feeds now describe the shipment in the uploaded document?
process.env.PINATA_JWT = "";
process.env.IPFS_API_URL = "http://127.0.0.1:5651";
process.env.IPFS_GATEWAYS = "http://127.0.0.1:5651";

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/home/user/sternprotocol/backend/oracle-gateway/");

const stub = spawn(process.execPath,
  [new URL("./test-support/ipfs-node-stub.js", import.meta.url).pathname],
  { stdio: "ignore", env: { ...process.env, STUB_PORT: "5651" } });

let pass = 0, fail = 0;
const check = (l, a, e) => { String(a) === String(e) ? (pass++, console.log(`  ok   ${l} = ${a}`)) : (fail++, console.log(`  FAIL ${l} — mau ${e}, dapat ${a}`)); };

for (let i = 0; i < 40; i++) { try { await fetch("http://127.0.0.1:5651/ipfs/x"); break; } catch { await new Promise(r => setTimeout(r, 100)); } }

const ipfs = require("./ipfsService.js");
const pdf = fs.readFileSync("/home/user/sternprotocol/docs/demo/e-bl-TGHU-2026-001.pdf");
const pinned = await ipfs.pinDocument(pdf, "e-bl.pdf");

function withEscrow(documentCid, containerRef, commodity) {
  require.cache[require.resolve("./contractService.js")] = {
    id: require.resolve("./contractService.js"), loaded: true,
    exports: { getEscrow: async () => ({ documentCid, containerRef, commodity }) }
  };
  delete require.cache[require.resolve("./oracleService.js")];
  return require("./oracleService.js").getMockStatus;
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
delete require.cache[require.resolve("./config.js")];
delete require.cache[require.resolve("./ipfsService.js")];
s = await (withEscrow(pinned.cid, "TGHU-2026-001", "Kopi"))("20");
check("mode", s.sources.ipfs.mode, "mock");
check("kontainer tetap dari kontrak", s.sources.vgm.containerRef, "TGHU-2026-001");
check("VGM sintetis", s.sources.vgm.expected_vgm_kg, 24020);
check("port kembali ke bawaan", s.sources.vgm.port, "Tanjung Priok");

stub.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
