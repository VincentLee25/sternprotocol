// Attaching the e-BL: pin it to IPFS, and use the address it resolves at.
//
// What this used to do was compute a SHA-256 of the file and dress it up as a
// CID by gluing "bafybeistern" on the front. It was honest about being a local
// hash in its own comment, but the string it produced was not a CID: it did
// not decode, it resolved nowhere, and the gateway "verified" it by checking
// that it started with those twelve characters. Anyone could have typed one.
//
// Now the bytes are pinned through the gateway and the CID comes back from the
// pinning service, independently recomputed from the same bytes before it is
// returned. It goes on chain as `documentCid`, where it means what a CID is
// supposed to mean: fetch this address from any IPFS gateway and you get
// byte-identical content, or you get nothing.
//
// The local SHA-256 is still computed, because it is still useful — it is what
// lets someone with the original file on their desk confirm it is the same
// document without knowing anything about IPFS.
// The API client is imported inside pinEbl rather than at the top of the
// module. Everything else here is a pure function over a verification result,
// and a static import would drag `import.meta.env` into any environment that
// wanted to test those functions outside a Vite build.

/** Base64 of the file, chunked so a large PDF does not blow the call stack. */
async function toBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return `0x${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const MAX_EBL_BYTES = 8 * 1024 * 1024;
// The whole set in one request, matching manifestService's own ceiling.
export const MAX_SET_BYTES = 12 * 1024 * 1024;

/**
 * The documents an escrow is created against, and what each one is for.
 *
 * The bill of lading identifies the shipment — every other check is matched
 * against the container reference read off it — so it is the one that cannot be
 * left out. The invoice and the packing list state the quantity, which is the
 * figure the contract value is being paid for and which nothing on chain
 * carried before this.
 */
export const DOCUMENT_SLOTS = [
  {
    key: "billOfLading",
    label: "Bill of lading",
    required: true,
    hint: "Identifies the shipment. The container reference every other check is matched against is read off this."
  },
  {
    key: "commercialInvoice",
    label: "Commercial invoice",
    required: false,
    hint: "What was sold, how much of it, and for how much. The reference for the quantity."
  },
  {
    key: "packingList",
    label: "Packing list",
    required: false,
    hint: "How it is packed: packages, net and gross weight."
  }
];

/** The units a quantity may be given in. Mirrors manifestService.UNITS. */
export const QUANTITY_UNITS = [
  { value: "kg", label: "kg" },
  { value: "ton", label: "ton" },
  { value: "bag", label: "bag" },
  { value: "carton", label: "carton" },
  { value: "pcs", label: "pcs" },
  { value: "container", label: "container" }
];

function apiNotConfigured() {
  // Carries the same code the gateway uses for its own unconfigured state, so
  // callers have one condition to fall back on rather than two.
  const error = new Error(
    "No gateway configured, so the documents cannot be pinned. Set VITE_ORACLE_API in frontend/.env."
  );
  error.code = "API_NOT_CONFIGURED";
  throw error;
}

function checkFile(file, label) {
  if (file.size === 0) throw new Error(`${label}: that file is empty.`);
  if (file.size > MAX_EBL_BYTES) {
    throw new Error(
      `${label}: ${formatBytes(file.size)} is too large — the limit is ${formatBytes(MAX_EBL_BYTES)}.`
    );
  }
}

/**
 * Pins the document set and the manifest that names it.
 *
 * What goes on chain is the MANIFEST's CID, not the bill of lading's. That is
 * the only way to get the quantity and three documents behind one address:
 * `documentCid` is written once in _createEscrow and has no setter, so an
 * escrow gets exactly one document address for ever.
 *
 * The manifest itself is written by the gateway from the bytes it pinned —
 * this function sends files and a declared quantity, never a manifest. A
 * client that could post its own could declare 20 tonnes while attaching a
 * packing list for 2.
 *
 * `containerRef` is passed through so the gateway can confirm the bill of
 * lading names the container this escrow is about — a valid bill of lading for
 * somebody else's shipment is not evidence for this one.
 */
export async function pinDocumentSet(files, { containerRef, commodity, quantity, clauses } = {}) {
  const { pinManifest, apiConfigured } = await import("./sternApi.js");
  if (!apiConfigured) apiNotConfigured();

  const chosen = DOCUMENT_SLOTS.map((slot) => ({ slot, file: files?.[slot.key] })).filter((item) => item.file);
  const missing = DOCUMENT_SLOTS.find((slot) => slot.required && !files?.[slot.key]);
  if (missing) throw new Error(`${missing.label} is required.`);

  for (const { slot, file } of chosen) checkFile(file, slot.label);

  const total = chosen.reduce((sum, item) => sum + item.file.size, 0);
  if (total > MAX_SET_BYTES) {
    throw new Error(
      `The documents total ${formatBytes(total)} — the limit for one set is ${formatBytes(MAX_SET_BYTES)}.`
    );
  }

  const encoded = await Promise.all(
    chosen.map(async ({ slot, file }) => [
      slot.key,
      { fileName: file.name, contentBase64: await toBase64(file), size: file.size, sha256: await sha256Hex(file) }
    ])
  );

  const documents = Object.fromEntries(
    encoded.map(([key, value]) => [key, { fileName: value.fileName, contentBase64: value.contentBase64 }])
  );
  const localDigests = Object.fromEntries(encoded.map(([key, value]) => [key, value.sha256]));

  // Clauses go in here rather than being attached to the escrow afterwards.
  // `documentCid` is written once in _createEscrow and has no setter, so the
  // manifest is the only thing whose address reaches the chain — and a clause
  // outside it would be a term someone could add after the goods shipped.
  const pinned = await pinManifest({ containerRef, commodity, quantity, documents, clauses });

  return {
    cid: pinned.cid,
    clauses: pinned.clauses || [],
    // True when the gateway recomputed the same CID from the bytes it
    // uploaded. It is the difference between "the pinning service told us this
    // address" and "we checked the address ourselves".
    cidSelfChecked: Boolean(pinned.cidSelfChecked),
    provider: pinned.provider,
    manifest: pinned.manifest || null,
    documents: pinned.documents || {},
    // Computed in this browser from the files on this desk, so someone holding
    // the originals can confirm the gateway pinned what they chose.
    localDigests,
    fileName: files?.billOfLading?.name || null,
    size: total,
    verification: pinned.verification || null
  };
}

/** The checks the gateway ran, as rows for the UI. */
export function eblCheckRows(verification) {
  if (!verification?.checks) return [];
  const LABELS = {
    cidResolves: "Resolves on IPFS",
    cidMatchesContent: "Bytes hash back to the CID",
    manifestValid: "Manifest names its documents",
    billOfLadingResolves: "B/L resolves",
    invoiceResolves: "Invoice resolves",
    packingListResolves: "Packing list resolves",
    isPdf: "Is a PDF",
    hasText: "Text is readable",
    hasBillOfLadingNumber: "Carries a B/L number",
    hasContainerReference: "Names this container",
    quantityAgrees: "Quantity agrees with the documents"
  };
  return Object.entries(LABELS)
    .filter(([key]) => verification.checks[key] !== undefined)
    .map(([key, label]) => ({
      key,
      label,
      passed: verification.checks[key] === true,
      // The quantity comparison is reported, not required: gross weight
      // includes packaging and net weight does not, so a hard gate on it
      // produces refusals that are an artefact of which figure a document
      // happened to print. A disagreement is a warning, not a failure.
      advisory: key === "quantityAgrees"
    }));
}

/**
 * What the manifest committed to, as rows: the quantity and each document's
 * own address.
 */
export function manifestRows(verification) {
  const manifest = verification?.manifest;
  if (!manifest) return [];

  const rows = [];
  if (manifest.quantity?.text) {
    rows.push({ key: "quantity", label: "Quantity", value: manifest.quantity.text });
  }
  for (const slot of DOCUMENT_SLOTS) {
    const document_ = manifest.documents?.[slot.key];
    if (!document_) continue;
    rows.push({
      key: slot.key,
      label: slot.label,
      value: document_.fileName || shortCid(document_.cid),
      cid: document_.cid,
      resolves: document_.resolves !== false,
      // Null when the manifest recorded no digest for it; false is a real
      // disagreement between the manifest and what the gateway served.
      digestMatches: document_.sha256Matches
    });
  }
  return rows;
}

/** The bill-of-lading fields the gateway read out of the PDF, as rows. */
export function eblFieldRows(verification) {
  const fields = verification?.fields;
  if (!fields) return [];
  const LABELS = {
    billOfLadingNumber: "B/L number",
    shipper: "Shipper",
    consignee: "Consignee",
    vessel: "Vessel",
    voyage: "Voyage",
    portOfLoading: "Port of loading",
    portOfDischarge: "Port of discharge",
    grossWeight: "Gross weight",
    issueDate: "Issued"
  };
  const rows = Object.entries(LABELS)
    .filter(([key]) => fields[key])
    .map(([key, label]) => ({
      key,
      label,
      value: key === "grossWeight" && fields.grossWeightUnit
        ? `${fields[key]} ${fields.grossWeightUnit}`
        : fields[key]
    }));

  if (fields.containerNumbers?.length) {
    rows.push({ key: "containers", label: "Containers", value: fields.containerNumbers.join(", ") });
  }
  return rows;
}

/** What was read off the commercial invoice and the packing list, as rows. */
export function goodsFieldRows(verification) {
  const invoice = verification?.fields?.invoice;
  const packing = verification?.fields?.packing;
  const rows = [];

  const push = (key, label, value) => {
    if (value) rows.push({ key, label, value });
  };

  push("invoiceNumber", "Invoice no.", invoice?.invoiceNumber);
  push("invoiceDate", "Invoice date", invoice?.invoiceDate);
  push(
    "invoiceQuantity",
    "Invoice quantity",
    invoice?.quantity ? `${invoice.quantity}${invoice.quantityUnit ? ` ${invoice.quantityUnit}` : ""}` : null
  );
  push(
    "invoiceTotal",
    "Invoice total",
    invoice?.totalAmount ? `${invoice.currency ? `${invoice.currency} ` : ""}${invoice.totalAmount}` : null
  );
  push("incoterm", "Incoterm", invoice?.incoterm);
  push("packages", "Packages", packing?.packageCount ? String(packing.packageCount) : null);
  push("netWeight", "Net weight", packing?.netWeightKg ? `${packing.netWeightKg.toLocaleString("id-ID")} kg` : null);
  push("grossWeight", "Gross weight", packing?.grossWeightKg ? `${packing.grossWeightKg.toLocaleString("id-ID")} kg` : null);
  push("marks", "Shipping marks", packing?.marks);

  return rows;
}

// --- customs documents -------------------------------------------------------

/**
 * The three documents that evidence clearance, and why each is asked for.
 *
 * None of them exists when the escrow is created — a PEB is issued at export
 * and a PIB at import — so they cannot be part of `documentCid`, which is
 * written once. They are attached to the escrow later and their manifest's CID
 * becomes milestone 3's proof.
 */
export const CUSTOMS_SLOTS = [
  {
    key: "exportDeclaration",
    label: "PEB",
    title: "Pemberitahuan Ekspor Barang",
    required: true,
    hint: "Issued by Bea Cukai at the origin. Evidences that the goods left legally."
  },
  {
    key: "importDeclaration",
    label: "PIB",
    title: "Pemberitahuan Impor Barang",
    required: false,
    hint: "Lodged at the destination. Carries the duty and tax assessed on arrival."
  },
  {
    key: "dutyPayment",
    label: "Proof of payment",
    title: "Bea Masuk / pajak impor",
    required: false,
    hint: "The receipt. An NTPN is what distinguishes duty paid from duty owed."
  }
];

/** Pins the customs documents for an escrow and records them against it. */
export async function pinCustomsDocuments(escrowId, files, { containerRef } = {}) {
  const { uploadCustomsDocuments, apiConfigured } = await import("./sternApi.js");
  if (!apiConfigured) apiNotConfigured();

  const chosen = CUSTOMS_SLOTS.map((slot) => ({ slot, file: files?.[slot.key] })).filter((item) => item.file);
  const missing = CUSTOMS_SLOTS.find((slot) => slot.required && !files?.[slot.key]);
  if (missing) throw new Error(`${missing.label} — ${missing.title} — is required.`);

  for (const { slot, file } of chosen) checkFile(file, slot.label);

  const total = chosen.reduce((sum, item) => sum + item.file.size, 0);
  if (total > MAX_SET_BYTES) {
    throw new Error(
      `The documents total ${formatBytes(total)} — the limit for one set is ${formatBytes(MAX_SET_BYTES)}.`
    );
  }

  const documents = Object.fromEntries(
    await Promise.all(
      chosen.map(async ({ slot, file }) => [
        slot.key,
        { fileName: file.name, contentBase64: await toBase64(file) }
      ])
    )
  );

  return uploadCustomsDocuments(escrowId, { containerRef, documents });
}

/** The customs checks, as rows. */
export function customsCheckRows(verification) {
  if (!verification?.checks) return [];
  const LABELS = {
    cidResolves: "Manifest resolves on IPFS",
    cidMatchesContent: "Bytes hash back to the CID",
    manifestValid: "Manifest names a PEB",
    pebResolves: "PEB resolves",
    hasPebNumber: "PEB is registered",
    pibResolves: "PIB resolves",
    dutyPaymentResolves: "Payment resolves",
    hasPaymentReference: "Duty paid, not just owed",
    mentionsContainer: "Names this container"
  };
  return Object.entries(LABELS)
    .filter(([key]) => verification.checks[key] !== undefined)
    .map(([key, label]) => ({ key, label, passed: verification.checks[key] === true }));
}

/** What was read off the PEB, the PIB and the receipt, as rows. */
export function customsFieldRows(verification) {
  const fields = verification?.fields;
  if (!fields) return [];

  const idr = (value) => (value == null ? null : `IDR ${Number(value).toLocaleString("id-ID")}`);
  const LABELS = [
    ["pebNumber", "PEB no.", fields.pebNumber],
    ["pebDate", "PEB registered", fields.pebDate],
    ["pibNumber", "PIB no.", fields.pibNumber],
    ["pibDate", "PIB registered", fields.pibDate],
    ["customsOffice", "Customs office", fields.customsOffice],
    ["npwp", "NPWP", fields.npwp],
    ["importDuty", "Bea Masuk", idr(fields.importDutyIdr)],
    ["vat", "PPN", idr(fields.vatIdr)],
    ["incomeTax", "PPh 22", idr(fields.incomeTaxIdr)],
    ["ntpn", "NTPN", fields.ntpn],
    ["paymentDate", "Paid", fields.paymentDate]
  ];
  return LABELS.filter(([, , value]) => value != null && value !== "").map(([key, label, value]) => ({
    key,
    label,
    value: String(value)
  }));
}

export function formatBytes(size) {
  if (!Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/** Short form for display: Qm1234…WXYZ. */
export function shortCid(cid) {
  if (typeof cid !== "string" || cid.length <= 18) return cid || "";
  return `${cid.slice(0, 10)}…${cid.slice(-6)}`;
}
