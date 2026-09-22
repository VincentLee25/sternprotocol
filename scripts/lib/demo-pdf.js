// Assembles a one-page text PDF, by hand.
//
// Extracted from make-demo-ebl.js, which needed the same forty lines once the
// demo grew from one document to six — a bill of lading, a commercial invoice,
// a packing list, a PEB, a PIB and a receipt for the duty.
//
// Written by hand rather than with a PDF library on purpose: these are
// fixtures, they must stay byte-deterministic so the same inputs always pin to
// the same CID, and one less dependency in the deploy is worth the forty lines.
function escapePdfText(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * @param {object} options
 * @param {string} options.title      what goes in the PDF's /Title
 * @param {Array<[string, string]>} options.fields  [label, value] pairs; an
 *        empty label prints the value alone, which is how headings and blank
 *        lines are written
 * @returns {Buffer}
 */
function assemblePdf({ title, fields }) {
  const lines = fields.map(([label, value]) => (label ? `${label}: ${value}` : value));

  const content = [
    "BT",
    "/F1 9 Tf",
    "40 800 Td",
    "13 TL",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    `<< /Title (${escapePdfText(title)}) /Producer (STERN Protocol demo fixture) >>`
  ];

  // The xref table indexes objects by byte offset, so the file has to be
  // assembled and measured as it is written.
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n` +
    `startxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

module.exports = { assemblePdf, escapePdfText };
