// The rest of the paperwork one export actually carries, as real PDFs.
//
// The e-BL was the only document the demo had, and it identifies the shipment
// without stating what was sold or whether anything cleared. These five fill
// that in, and every figure on them is consistent with the bill of lading
// make-demo-ebl.js writes — 320 bags, 19 200,00 kg net, 20 450,00 kg VGM,
// Belawan to Rotterdam, container TGHU-2026-001 — so the quantity check and
// the customs check have something coherent to agree with.
//
//   node scripts/make-demo-docs.js                    → docs/demo/*.pdf
//   node scripts/make-demo-docs.js TGHU-2026-002
//
// Two of them are deliberately available in a wrong variant as well, because a
// demo that can only show agreement cannot show the product working:
//
//   node scripts/make-demo-docs.js TGHU-2026-001 --wrong-quantity
//   node scripts/make-demo-docs.js TGHU-2026-001 --wrong-container
const fs = require("node:fs");
const path = require("node:path");
const { assemblePdf } = require("./lib/demo-pdf.js");

const NET_KG = "19 200,00 kg";
const GROSS_KG = "20 450,00 kg";
const BAGS = "320";
const INVOICE_TOTAL = "45.000.000,00";

function commercialInvoice(containerRef, { quantity = `${BAGS} bags` } = {}) {
  return {
    name: `invoice-${containerRef}.pdf`,
    title: `Commercial Invoice ${containerRef}`,
    fields: [
      ["", "COMMERCIAL INVOICE"],
      ["", ""],
      ["Invoice No.", "INV-GHC-2026-0188"],
      ["Invoice Date", "2026-02-12"],
      ["", ""],
      ["Seller / Exporter", "PT Gayo Highland Coffee, Jl. Takengon 14, Aceh Tengah, Indonesia"],
      ["NPWP", "01.234.567.8-115.000"],
      ["Buyer / Importer", "Rotterdam Green Beans B.V., Wilhelminakade 909, Rotterdam, Netherlands"],
      ["", ""],
      ["Container No.", containerRef],
      ["Description of Goods", "Green coffee beans, Arabica Gayo Grade 1, washed process, crop 2026"],
      ["HS Code", "0901.11.10"],
      ["Quantity", quantity],
      ["Net Weight", NET_KG],
      ["Unit Price", "IDR 140.625,00 per kg"],
      ["Total Amount", `IDR ${INVOICE_TOTAL}`],
      ["Currency", "IDR"],
      ["Incoterm", "FOB Belawan"],
      ["", ""],
      ["Port of Loading", "Belawan, Indonesia (IDBLW)"],
      ["Port of Discharge", "Rotterdam, Netherlands (NLRTM)"],
      ["Bill of Lading No.", `IDSUB${containerRef.replace(/[^A-Za-z0-9]/g, "").slice(-8)}`],
      ["", ""],
      ["Payment Terms", "Escrow settlement on verified milestones (STERN Protocol)"],
      ["", ""],
      ["", "We certify that this invoice is true and correct and that the goods"],
      ["", "are of Indonesian origin."],
      ["", ""],
      ["", "Signed: PT Gayo Highland Coffee"]
    ]
  };
}

function packingList(containerRef, { packages = BAGS } = {}) {
  return {
    name: `packing-list-${containerRef}.pdf`,
    title: `Packing List ${containerRef}`,
    fields: [
      ["", "PACKING LIST"],
      ["", ""],
      ["Packing List No.", "PL-GHC-2026-0188"],
      ["Date", "2026-02-12"],
      ["Invoice No.", "INV-GHC-2026-0188"],
      ["", ""],
      ["Shipper", "PT Gayo Highland Coffee, Aceh Tengah, Indonesia"],
      ["Consignee", "Rotterdam Green Beans B.V., Rotterdam, Netherlands"],
      ["", ""],
      ["Container No.", containerRef],
      ["Seal No.", "SL4471902"],
      ["Shipping Marks", "GAYO / ARABICA / GR1 / 2026"],
      ["", ""],
      ["Packages", `${packages} bags`],
      ["Package Type", "Jute bag, 60 kg nominal"],
      ["Net Weight", NET_KG],
      ["Gross Weight", GROSS_KG],
      ["Measurement", "33,200 CBM"],
      ["", ""],
      ["", "Bag 1 - 320   Arabica Gayo Grade 1, washed, screen 16+"],
      ["", "Each bag weighs 60,00 kg net and is marked with lot GAYO-2026-04."],
      ["", ""],
      ["", "Packed under supervision of PT SUCOFINDO, Medan."],
      ["", ""],
      ["", "Signed: PT Gayo Highland Coffee"]
    ]
  };
}

function exportDeclaration(containerRef) {
  return {
    name: `peb-${containerRef}.pdf`,
    title: `PEB ${containerRef}`,
    fields: [
      ["", "PEMBERITAHUAN EKSPOR BARANG (PEB)"],
      ["", "DIREKTORAT JENDERAL BEA DAN CUKAI - CEISA 4.0"],
      ["", ""],
      ["Nomor Pengajuan", "000123-000456-20260213-000789"],
      ["Nomor Pendaftaran", "401234"],
      ["Tanggal Pendaftaran", "2026-02-13"],
      ["Kantor Pabean", "KPPBC TMP B Belawan (010300)"],
      ["", ""],
      ["Eksportir", "PT Gayo Highland Coffee"],
      ["NPWP", "01.234.567.8-115.000"],
      ["Alamat", "Jl. Takengon 14, Aceh Tengah, Indonesia"],
      ["", ""],
      ["Pembeli", "Rotterdam Green Beans B.V., Netherlands"],
      ["Negara Tujuan", "Netherlands (NL)"],
      ["Pelabuhan Muat", "Belawan (IDBLW)"],
      ["Pelabuhan Bongkar", "Rotterdam (NLRTM)"],
      ["", ""],
      ["Nomor Container", containerRef],
      ["Uraian Barang", "Biji kopi Arabica Gayo Grade 1, proses basah"],
      ["Pos Tarif / HS", "0901.11.10"],
      ["Jumlah", `${BAGS} bags`],
      ["Berat Netto", NET_KG],
      ["Berat Bruto", GROSS_KG],
      ["Nilai FOB", `IDR ${INVOICE_TOTAL}`],
      ["Invoice No.", "INV-GHC-2026-0188"],
      ["Bill of Lading No.", `IDSUB${containerRef.replace(/[^A-Za-z0-9]/g, "").slice(-8)}`],
      ["", ""],
      ["Status", "Disetujui - NPE diterbitkan"],
      ["", ""],
      ["", "Dokumen ini diterbitkan secara elektronik melalui CEISA dan tidak"],
      ["", "memerlukan tanda tangan basah."]
    ]
  };
}

function importDeclaration(containerRef) {
  return {
    name: `pib-${containerRef}.pdf`,
    title: `PIB ${containerRef}`,
    fields: [
      ["", "PEMBERITAHUAN IMPOR BARANG (PIB)"],
      ["", "CUSTOMS IMPORT DECLARATION - DESTINATION"],
      ["", ""],
      ["Nomor Pengajuan", "000987-000654-20260310-000321"],
      ["Nomor Pendaftaran", "228877"],
      ["Tanggal Pendaftaran", "2026-03-10"],
      ["Kantor Pabean", "Douane Rotterdam (NL000396)"],
      ["", ""],
      ["Importir", "Rotterdam Green Beans B.V."],
      ["NPWP", "88.765.432.1-402.000"],
      ["Negara Asal", "Indonesia (ID)"],
      ["", ""],
      ["Nomor Container", containerRef],
      ["Uraian Barang", "Green coffee beans, Arabica Gayo Grade 1"],
      ["Pos Tarif / HS", "0901.11.10"],
      ["Jumlah", `${BAGS} bags`],
      ["Berat Netto", NET_KG],
      ["Nilai CIF", "IDR 47.250.000,00"],
      ["", ""],
      ["Bea Masuk", "IDR 0,00"],
      ["PPN", "IDR 4.725.000,00"],
      ["PPh 22", "IDR 1.181.250,00"],
      ["Total Pungutan", "IDR 5.906.250,00"],
      ["", ""],
      ["Status", "SPPB diterbitkan - barang dapat dikeluarkan"],
      ["Tanggal SPPB", "2026-03-11"],
      ["", ""],
      ["", "Bea Masuk nihil: kopi Arabica dari Indonesia masuk dengan tarif"],
      ["", "preferensi 0% di bawah perjanjian GSP."]
    ]
  };
}

function dutyPayment(containerRef) {
  return {
    name: `bukti-bayar-${containerRef}.pdf`,
    title: `Bukti Bayar Bea Masuk ${containerRef}`,
    fields: [
      ["", "SURAT SETORAN PABEAN, CUKAI DAN PAJAK (SSPCP)"],
      ["", "BUKTI PENERIMAAN NEGARA"],
      ["", ""],
      ["NTPN", "A1B2C3D4E5F60718"],
      ["NTB / NTP", "0000441792"],
      ["Bank Persepsi", "Bank Mandiri - Cabang Rotterdam"],
      ["Tanggal Bayar", "2026-03-11"],
      ["", ""],
      ["Nama Wajib Bayar", "Rotterdam Green Beans B.V."],
      ["NPWP", "88.765.432.1-402.000"],
      ["Kantor Pabean", "Douane Rotterdam (NL000396)"],
      ["", ""],
      ["Nomor Pendaftaran PIB", "228877"],
      ["Tanggal Pendaftaran PIB", "2026-03-10"],
      ["Nomor Container", containerRef],
      ["", ""],
      ["Bea Masuk", "IDR 0,00"],
      ["PPN", "IDR 4.725.000,00"],
      ["PPh 22", "IDR 1.181.250,00"],
      ["Denda", "IDR 0,00"],
      ["Jumlah Setoran", "IDR 5.906.250,00"],
      ["", ""],
      ["Status", "Lunas - diterima di Kas Negara"],
      ["", ""],
      ["", "NTPN adalah nomor transaksi penerimaan negara. Pembayaran dapat"],
      ["", "dicocokkan terhadap catatan DJP dan DJBC dengan nomor tersebut."]
    ]
  };
}

const containerRef = process.argv[2] || "TGHU-2026-001";
const flags = new Set(process.argv.slice(3));
const outDir = path.resolve(__dirname, "../docs/demo");

// The wrong variants exist so a rehearsal can show a refusal. The quantity one
// declares 32 bags where every other document says 320 — a tenfold error, the
// shape a real keying mistake takes. The container one names a different box
// entirely, which is the one that must stop a milestone.
const wrongQuantity = flags.has("--wrong-quantity");
const wrongContainer = flags.has("--wrong-container");
const onRef = wrongContainer ? "MSCU-9999-999" : containerRef;

const documents = [
  commercialInvoice(onRef, wrongQuantity ? { quantity: "32 bags" } : {}),
  packingList(onRef, wrongQuantity ? { packages: "32" } : {}),
  exportDeclaration(onRef),
  importDeclaration(onRef),
  dutyPayment(onRef)
];

fs.mkdirSync(outDir, { recursive: true });
for (const document of documents) {
  const suffix = wrongQuantity ? "-wrong-quantity" : "";
  const name = document.name.replace(/\.pdf$/, `${suffix}.pdf`);
  const target = path.join(outDir, name);
  fs.writeFileSync(target, assemblePdf({ title: document.title, fields: document.fields }));
  console.log(`Wrote ${target}`);
}

module.exports = {
  commercialInvoice,
  packingList,
  exportDeclaration,
  importDeclaration,
  dutyPayment,
  build: (document) => assemblePdf({ title: document.title, fields: document.fields })
};
