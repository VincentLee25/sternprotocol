// What the escrow is actually about, pinned as one document.
//
// The problem: `documentCid` on chain held a single PDF — the bill of lading —
// and the escrow itself held only a commodity string. "Arabica Gayo Grade 1"
// with no quantity. A settlement of 45,000,000 IDRT against an unstated number
// of kilograms is not a contract anybody could enforce, and the two documents
// that state the quantity (Commercial Invoice, Packing List) were nowhere.
//
// The fix has to work around one hard constraint: `documentCid` is written in
// _createEscrow and there is no setter, so an escrow gets exactly one document
// address, for ever. A list of CIDs cannot be added later.
//
// So the one address is a MANIFEST: a small JSON document that states the
// quantity and names the CIDs of the bill of lading, the invoice and the
// packing list. One hash on chain then commits to all of it. Change any figure
// on any of those PDFs and the manifest's CID changes, which is the same
// property the single-PDF version had, extended over the whole set.
//
// The manifest is built HERE, not sent by the browser. A client that could post
// its own manifest JSON could declare 20 tonnes while attaching a packing list
// for 2, and the pin would faithfully record the lie. The gateway pins the PDFs
// itself, computes their CIDs, and writes the manifest from what it pinned.
//
// The customs manifest (PEB / PIB / proof of duty paid) is the same idea for a
// different moment. Those documents do not exist when the escrow is created —
// PEB is issued at export, PIB at import — so they cannot go in the creation
// manifest at all. Their home is milestone 3's `proofCid`, which
// submitMilestoneProof takes per milestone and which was previously filled with
// a synthetic string.
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");
// The kind strings come from ipfsService, which is the module that has to
// RECOGNISE a manifest at a CID. Defining them twice is how a writer and a
// reader drift apart.
const {
  pinDocument,
  ESCROW_MANIFEST_KIND: ESCROW_MANIFEST,
  CUSTOMS_MANIFEST_KIND: CUSTOMS_MANIFEST
} = require("./ipfsService");

// Units a trade document actually uses. Only the mass units convert, and the
// rest deliberately do not: 320 bags is not a weight, and inventing a
// kilogram figure for it would put a number in front of a verifier that no
// document supports.
const UNITS = {
  kg: { label: "kg", kgPerUnit: 1 },
  ton: { label: "ton", kgPerUnit: 1000 },
  mt: { label: "MT", kgPerUnit: 1000 },
  bag: { label: "bag", kgPerUnit: null },
  carton: { label: "carton", kgPerUnit: null },
  pcs: { label: "pcs", kgPerUnit: null },
  container: { label: "container", kgPerUnit: null }
};

// Which documents a manifest may carry, and which one it cannot do without.
// The bill of lading is required because it is the document the shipment is
// identified by — the container reference every other check is matched against
// comes off it.
const ESCROW_SLOTS = {
  billOfLading: { label: "Bill of lading", required: true },
  commercialInvoice: { label: "Commercial invoice", required: false },
  packingList: { label: "Packing list", required: false }
};

const CUSTOMS_SLOTS = {
  exportDeclaration: { label: "PEB — export declaration", required: true },
  importDeclaration: { label: "PIB — import declaration", required: false },
  dutyPayment: { label: "Proof of import duty / tax paid", required: false }
};

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * The declared quantity, normalised.
 *
 * `valueKg` is null for a count unit rather than a guess, and everything
 * downstream treats null as "the documents have to say" instead of zero.
 */
function normaliseQuantity(input) {
  if (input == null || input === "") return null;
  const raw = typeof input === "object" ? input : { value: input };
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw appError("The quantity must be a positive number.", 422, "QUANTITY_INVALID");
  }

  const key = String(raw.unit || "kg").trim().toLowerCase();
  const unit = UNITS[key];
  if (!unit) {
    throw appError(
      `Unknown unit "${raw.unit}". Use one of: ${Object.keys(UNITS).join(", ")}.`,
      422,
      "QUANTITY_UNIT_UNKNOWN"
    );
  }

  return {
    value: Math.round(value * 1000) / 1000,
    unit: key,
    unitLabel: unit.label,
    valueKg: unit.kgPerUnit == null ? null : Math.round(value * unit.kgPerUnit * 100) / 100,
    text: `${value.toLocaleString("id-ID")} ${unit.label}`
  };
}

function decodeBase64(value, slotLabel) {
  const base64 = String(value || "").replace(/^data:[^;]+;base64,/, "");
  if (!base64) throw appError(`${slotLabel}: no file content was sent.`, 400, "DOCUMENT_EMPTY");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length) throw appError(`${slotLabel}: the file is empty.`, 400, "DOCUMENT_EMPTY");
  return bytes;
}

/**
 * Pins one slot's PDF and records what it pinned.
 *
 * `cidSelfChecked` is carried through from ipfsService: it is true only when the
 * CID recomputed from the bytes we uploaded equals the one the pinning service
 * returned, which is what makes the address trustworthy without trusting the
 * pinner.
 */
async function pinSlot(name, slot, bytes, input) {
  const fileName = String(input.fileName || `${name}.pdf`).slice(0, 160);
  const pinned = await pinDocument(bytes, fileName);
  return {
    slot: name,
    label: slot.label,
    cid: pinned.cid,
    fileName: pinned.fileName,
    size: pinned.size,
    sha256: pinned.sha256,
    cidSelfChecked: pinned.cidSelfChecked,
    contentType: bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? "application/pdf" : "application/octet-stream"
  };
}

// Three trade documents in one request. Each is separately capped at 8mb by
// ipfsService; this is the ceiling on the set, because the whole body arrives
// as base64 in memory and a free host has little of it.
const MAX_TOTAL_BYTES = 12 * 1024 * 1024;

async function pinSlots(slots, documents) {
  const provided = Object.entries(slots).filter(([name]) => documents?.[name]);
  for (const [, slot] of Object.entries(slots).filter(([name]) => !documents?.[name])) {
    if (slot.required) throw appError(`${slot.label} is required.`, 422, "DOCUMENT_MISSING");
  }
  if (!provided.length) {
    throw appError("No documents were sent.", 400, "DOCUMENT_MISSING");
  }

  // Decode and size-check everything BEFORE pinning any of it. Pinning three
  // documents and then rejecting the fourth would leave the first three pinned,
  // paid for, and belonging to no manifest.
  const decoded = provided.map(([name, slot]) => ({
    name,
    slot,
    input: documents[name],
    bytes: decodeBase64(documents[name].contentBase64 ?? documents[name].content, slot.label)
  }));

  const total = decoded.reduce((sum, item) => sum + item.bytes.length, 0);
  if (total > MAX_TOTAL_BYTES) {
    throw appError(
      `The documents total ${(total / 1024 / 1024).toFixed(1)} MB; the limit for one manifest is ${MAX_TOTAL_BYTES / 1024 / 1024} MB.`,
      413,
      "DOCUMENTS_TOO_LARGE"
    );
  }

  // Sequentially, not in parallel. A pinning service answers one upload at a
  // time on a free plan, and three concurrent posts is how a demo earns a 429
  // in front of an audience.
  const pinned = {};
  for (const item of decoded) {
    pinned[item.name] = await pinSlot(item.name, item.slot, item.bytes, item.input);
  }
  return pinned;
}

/**
 * Pins the creation documents and the manifest that names them.
 *
 * The returned `cid` is what goes on chain as `documentCid`. Everything else is
 * for the screen: the per-document CIDs so each can be opened, and the
 * quantity as the manifest recorded it.
 */
async function pinEscrowManifest({ containerRef, commodity, quantity, documents } = {}) {
  const normalisedQuantity = normaliseQuantity(quantity);
  const pinned = await pinSlots(ESCROW_SLOTS, documents);

  const manifest = {
    stern: ESCROW_MANIFEST,
    createdAt: new Date().toISOString(),
    containerRef: String(containerRef || "").trim() || null,
    commodity: String(commodity || "").trim() || null,
    quantity: normalisedQuantity,
    documents: Object.fromEntries(
      Object.entries(pinned).map(([name, doc]) => [
        name,
        { cid: doc.cid, fileName: doc.fileName, sha256: doc.sha256, size: doc.size, contentType: doc.contentType }
      ])
    )
  };

  // Stable key order and a trailing newline, so the same inputs always pin to
  // the same CID. Two escrows created from identical documents then share one
  // address, which is correct — the manifest is content, not an event.
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestPin = await pinDocument(bytes, "stern-escrow-manifest.json");

  return {
    cid: manifestPin.cid,
    cidSelfChecked: manifestPin.cidSelfChecked,
    provider: manifestPin.provider,
    size: manifestPin.size,
    sha256: manifestPin.sha256,
    manifest,
    documents: pinned,
    pinnedAt: manifestPin.pinnedAt
  };
}

// --- customs documents -------------------------------------------------------
//
// Stored per escrow, because they arrive long after the escrow does and the
// gateway needs to find them again when milestone 3 is verified. The store
// holds only CIDs and file names; the documents themselves live on IPFS.

function storePath() {
  return config.customsStoreFile || path.resolve(__dirname, "../data/customs.json");
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(entries) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Pins the customs documents for an escrow and records the manifest against it.
 *
 * Deliberately keeps every version rather than only the newest: a PIB that was
 * replaced is part of the history of the clearance, and milestone 3 may already
 * have been submitted against the earlier one. `current` is what verification
 * reads; `history` is what makes the replacement visible.
 */
async function pinCustomsManifest(escrowId, { containerRef, documents } = {}) {
  const id = String(escrowId || "").trim();
  if (!/^\d+$/.test(id)) {
    throw appError("An escrow id is required.", 422, "ESCROW_ID_INVALID");
  }

  const pinned = await pinSlots(CUSTOMS_SLOTS, documents);

  const manifest = {
    stern: CUSTOMS_MANIFEST,
    createdAt: new Date().toISOString(),
    escrowId: id,
    containerRef: String(containerRef || "").trim() || null,
    documents: Object.fromEntries(
      Object.entries(pinned).map(([name, doc]) => [
        name,
        { cid: doc.cid, fileName: doc.fileName, sha256: doc.sha256, size: doc.size, contentType: doc.contentType }
      ])
    )
  };

  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestPin = await pinDocument(bytes, `stern-customs-${id}.json`);

  const store = loadStore();
  const record = {
    escrowId: id,
    cid: manifestPin.cid,
    manifest,
    documents: pinned,
    pinnedAt: manifestPin.pinnedAt
  };
  const previous = store[id];
  store[id] = {
    current: record,
    history: [...(previous?.history || []), ...(previous?.current ? [previous.current] : [])].slice(-10)
  };
  saveStore(store);

  return record;
}

/** The customs manifest recorded for an escrow, or null. */
function customsFor(escrowId) {
  const entry = loadStore()[String(escrowId)];
  return entry?.current || null;
}

/** Every customs manifest ever recorded for an escrow, newest first. */
function customsHistory(escrowId) {
  const entry = loadStore()[String(escrowId)];
  if (!entry) return [];
  return [entry.current, ...[...(entry.history || [])].reverse()].filter(Boolean);
}

module.exports = {
  ESCROW_MANIFEST,
  CUSTOMS_MANIFEST,
  ESCROW_SLOTS,
  CUSTOMS_SLOTS,
  UNITS,
  normaliseQuantity,
  pinEscrowManifest,
  pinCustomsManifest,
  customsFor,
  customsHistory
};
