// Generates a demo electronic bill of lading as a real PDF, for rehearsing the
// e-BL flow without hunting for a document to upload.
//
// It is written by hand rather than with a PDF library on purpose: it is a
// fixture, it must stay byte-deterministic so the same inputs always pin to
// the same CID, and one less dependency in the deploy is worth forty lines.
//
//   node scripts/make-demo-ebl.js                     → docs/demo/e-bl-TGHU-2026-001.pdf
//   node scripts/make-demo-ebl.js TGHU-2026-002 out.pdf
const fs = require("node:fs");
const path = require("node:path");
const { assemblePdf } = require("./lib/demo-pdf.js");

const FIELDS = (containerRef) => [
  ["", "BILL OF LADING FOR OCEAN TRANSPORT"],
  ["", "Non-negotiable copy - issued electronically"],
  ["", ""],
  ["Bill of Lading No.", `IDSUB${containerRef.replace(/[^A-Za-z0-9]/g, "").slice(-8)}`],
  ["Booking No.", "BKG-2026-004417"],
  ["", ""],
  ["Shipper / Exporter", "PT Gayo Highland Coffee, Jl. Takengon 14, Aceh Tengah, Indonesia"],
  ["Consignee / Importer", "Rotterdam Green Beans B.V., Wilhelminakade 909, Rotterdam, Netherlands"],
  ["Notify Party", "Same as consignee"],
  ["", ""],
  ["Ocean Vessel", "MV SAMUDRA BIRU"],
  ["Voyage No.", "0264E"],
  ["Port of Loading", "Belawan, Indonesia (IDBLW)"],
  ["Port of Discharge", "Rotterdam, Netherlands (NLRTM)"],
  ["Place of Delivery", "Rotterdam Container Terminal"],
  ["", ""],
  ["Container No.", containerRef],
  ["Seal No.", "SL4471902"],
  ["Marks and Numbers", "GAYO / ARABICA / GR1 / 2026"],
  ["Description of Goods", "320 bags green coffee beans, Arabica Gayo Grade 1, washed process"],
  ["Gross Weight", "19 200,00 kg"],
  ["Verified Gross Mass", "20 450,00 kg"],
  ["Measurement", "33,200 CBM"],
  ["", ""],
  ["Freight and Charges", "Freight prepaid"],
  ["Number of Originals", "Three (3)"],
  ["Place of Issue", "Medan, Indonesia"],
  ["Date of Issue", "2026-02-14"],
  ["Shipped on Board", "2026-02-14"],
  ["", ""],
  ["", "SHIPPED on board the vessel named above in apparent good order and"],
  ["", "condition unless otherwise stated, to be carried to the port of discharge"],
  ["", "and there delivered against surrender of this bill of lading."],
  ["", ""],
  ["", "Signed for the carrier: Samudra Biru Lines (Indonesia) Pte Ltd"]
];

function buildPdf(containerRef) {
  return assemblePdf({
    title: `Bill of Lading ${containerRef}`,
    fields: FIELDS(containerRef)
  });
}

const containerRef = process.argv[2] || "TGHU-2026-001";
const target =
  process.argv[3] || path.resolve(__dirname, `../docs/demo/e-bl-${containerRef}.pdf`);

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buildPdf(containerRef));
console.log(`Wrote ${target} for container ${containerRef}`);

module.exports = { buildPdf };
