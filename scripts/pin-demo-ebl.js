// Pins a bill of lading through a running gateway and prints what came back.
//
//   node scripts/pin-demo-ebl.js
//   node scripts/pin-demo-ebl.js path/to/your-ebl.pdf TGHU-2026-002
//   GATEWAY=https://your-app.up.railway.app node scripts/pin-demo-ebl.js
//
// This is the end-to-end check that the e-BL path actually works against a
// real pinning service: it pins, the gateway reads the document back from a
// public IPFS gateway by CID, recomputes the CID from those bytes, and reads
// the bill-of-lading fields out of the PDF. Everything printed below came back
// over HTTP from the gateway — nothing here is computed locally.
//
// Unlike scripts/test-ebl-ipfs.js, which runs offline against a stand-in node,
// this one talks to whatever the gateway is configured for. Use it to confirm a
// PINATA_JWT works before a demo.
const fs = require("node:fs");
const path = require("node:path");

const GATEWAY = (process.env.GATEWAY || "http://localhost:4000").replace(/\/+$/, "");
const FILE = process.argv[2] || path.resolve(__dirname, "../docs/demo/e-bl-TGHU-2026-001.pdf");
const CONTAINER = process.argv[3] || "TGHU-2026-001";

function ensureFixture() {
  if (fs.existsSync(FILE)) return;
  if (FILE.endsWith("e-bl-TGHU-2026-001.pdf")) {
    const { buildPdf } = require("./make-demo-ebl.js");
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, buildPdf("TGHU-2026-001"));
    console.log(`(demo e-BL dibuat: ${FILE})`);
    return;
  }
  throw new Error(`file not found: ${FILE}`);
}

function line(label, value) {
  console.log(`  ${String(label).padEnd(26)} ${value}`);
}

async function main() {
  ensureFixture();
  const bytes = fs.readFileSync(FILE);

  console.log(`gateway   : ${GATEWAY}`);
  console.log(`document  : ${FILE} (${bytes.length} bytes)`);
  console.log(`container : ${CONTAINER}\n`);

  // Which mode the gateway is in decides what the rest of this output means,
  // so read it first and say so plainly.
  const status = await fetch(`${GATEWAY}/ipfs/status`).then((r) => r.json());
  console.log("1. mode gateway");
  line("configured", status.configured);
  line("provider", status.provider ?? "(none)");
  line("librariesReady", status.librariesReady);
  if (status.dependencyError) line("dependencyError", status.dependencyError);
  if (!status.configured) {
    console.log(
      "\n   Tidak ada layanan pinning yang aktif, jadi pemeriksaan e-BL belum asli." +
        "\n   Pasang PINATA_JWT di gateway, lalu jalankan ini lagi."
    );
    process.exit(1);
  }

  console.log("\n2. pin dokumennya");
  const response = await fetch(`${GATEWAY}/ipfs/pin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: path.basename(FILE),
      containerRef: CONTAINER,
      contentBase64: bytes.toString("base64")
    })
  });

  const body = await response.json();
  if (!response.ok) {
    console.log(`   GAGAL (HTTP ${response.status}) ${body.error || ""}`);
    process.exit(1);
  }

  line("CID", body.cid);
  // The one that matters: the gateway recomputed this address from the bytes
  // it uploaded, rather than taking the pinning service's word for it.
  line("CID direproduksi sendiri", body.cidSelfChecked);
  line("provider", body.provider);
  line("sha256", body.sha256);
  line("buka di browser", body.gatewayUrl);
  line("lewat gateway ini", `${GATEWAY}/ipfs/document/${body.cid}`);

  const v = body.verification;
  console.log("\n3. dibaca kembali dari CID-nya");
  if (!v) {
    console.log("   (gateway tidak mengirim hasil verifikasi)");
  } else if (v.available === false) {
    line("bisa diambil", false);
    line("alasan", v.reason);
    console.log(
      "\n   Pin berhasil tapi gateway IPFS publik belum menyebarkannya." +
        "\n   Itu normal beberapa saat setelah pin pertama. Coba lagi sebentar:" +
        `\n   curl ${GATEWAY}/ipfs/verify/${body.cid}?containerRef=${CONTAINER}`
    );
  } else {
    line("valid", v.valid);
    for (const [name, passed] of Object.entries(v.checks || {})) line(name, passed);
    line("diambil dari", v.document?.retrievedFrom ?? "?");
    line("halaman", v.document?.pages ?? "?");

    console.log("\n4. isi bill of lading yang terbaca");
    const fields = v.fields || {};
    for (const [name, value] of Object.entries(fields)) {
      if (value == null || (Array.isArray(value) && !value.length)) continue;
      line(name, Array.isArray(value) ? value.join(", ") : value);
    }
    for (const note of v.notes || []) console.log(`\n   catatan: ${note}`);
  }

  console.log(
    v?.valid
      ? "\nHASIL: verifikasi e-BL asli berjalan. CID di atas bisa dibuka siapa pun."
      : "\nHASIL: dokumen ter-pin, tapi belum lolos semua pemeriksaan. Lihat catatan di atas."
  );
  process.exit(v?.valid ? 0 : 1);
}

main().catch((error) => {
  console.error(
    `\nGagal menghubungi gateway di ${GATEWAY}: ${error.message}` +
      "\nPastikan gateway-nya hidup (npm start), atau set GATEWAY ke alamat Railway Anda."
  );
  process.exit(2);
});
