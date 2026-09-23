// Real IPFS for the e-BL document, replacing the prefix check in
// backend/mock-apis/ipfs-mock.js.
//
// What the mock did: accept any string starting with "bafybeistern". That is a
// string comparison dressed as a document check — it proves nothing about a
// document, and nothing about IPFS. The CID the frontend produced was a
// SHA-256 of the file wearing a CID-shaped costume; it was never pinned, so it
// resolved nowhere.
//
// What this does instead:
//
//   1. Pins the actual PDF to IPFS through a real pinning service, and gets
//      back the CID that service computed.
//   2. Recomputes that CID locally from the same bytes. If the two agree, the
//      service cannot have swapped the content for something else — this is
//      the check that makes the pin trustworthy without trusting the pinner.
//   3. On verification, fetches the bytes back *by CID* from a public IPFS
//      gateway and recomputes the CID again. A match is proof that the bytes
//      anyone else can retrieve at that address are byte-identical to the
//      document the escrow was created against.
//   4. Extracts the text of the PDF and checks it is actually a bill of
//      lading, carrying the container reference this escrow is about.
//
// Step 3 is the property the whole e-BL claim rests on, and it is the one the
// mock could not express: the contract stores an address, and the address is
// only worth storing if it pins down the content.
const crypto = require("node:crypto");
const { config } = require("./config");

// ipfs-only-hash and pdf-parse are loaded on first use rather than at the top
// of the file, and a failure to load is recorded instead of thrown.
//
// index.js requires this module, so a top-level require here puts the whole
// gateway behind these two packages: a stale build cache or a bad install
// would take down escrow reads, the faucet and dispute preparation along with
// the e-BL check. Degrading one feature is the right failure; taking the
// service with it is not.
let dependencyError = null;

function load(name, pick) {
  try {
    // eslint-disable-next-line global-require
    const module_ = require(name);
    return pick ? pick(module_) : module_;
  } catch (error) {
    dependencyError = `${name} could not be loaded (${error.message}). Run npm install on the gateway.`;
    return null;
  }
}

let hashLib;
function hasher() {
  if (hashLib === undefined) hashLib = load("ipfs-only-hash");
  return hashLib;
}

let pdfLib;
function pdfParser() {
  if (pdfLib === undefined) pdfLib = load("pdf-parse", (m) => m.PDFParse);
  return pdfLib;
}

// These must match whatever the pinning service uses to build its DAG, or a
// CID recomputed here will never equal the CID handed back — and that
// comparison is the entire point. Kubo's defaults, which Pinata follows:
// CIDv0, dag-pb, 262144-byte fixed chunks, no raw leaves.
const PIN_OPTIONS = { cidVersion: 0, rawLeaves: false };

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
// Pinning uploads a document, so it gets room. Retrieval sits on the critical
// path of every evidence read and every verify, so it does not: a slow public
// gateway must not be able to hold up a settlement while somebody watches a
// spinner.
const PIN_TIMEOUT_MS = 30000;
const FETCH_TIMEOUT_MS = 8000;

// A CID names immutable content, so a verdict about one can never go stale —
// cache successes for the life of the process. Failures are cached briefly
// only, because "the gateway did not answer in 25s" is about the network, not
// about the document.
const OK_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 30 * 1000;
const verdicts = new Map();

/** CIDv0 of these exact bytes, computed here rather than taken on trust. */
async function computeCid(bytes) {
  const Hash = hasher();
  if (!Hash) throw providerError(dependencyError, "IPFS_DEPENDENCY_MISSING", 503);
  return Hash.of(bytes, PIN_OPTIONS);
}

function sha256(bytes) {
  return `0x${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

/**
 * Which pinning service is configured, if any.
 *
 * Unconfigured is a supported state: the gateway keeps serving, the e-BL check
 * reports itself as unavailable rather than inventing a pass, and the rest of
 * the demo is unaffected.
 */
function pinningProvider() {
  if (config.pinataJwt) return "pinata";
  if (config.ipfsApiUrl) return "kubo";
  return null;
}

function providerError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function withTimeout(run, ms = PIN_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The MIME type to upload under.
 *
 * IPFS does not store it — a CID addresses bytes and nothing else — so this
 * only affects what the pinning service shows in its own dashboard. Worth
 * getting right anyway: a manifest listed as a PDF is confusing to whoever goes
 * looking at the pins.
 */
function contentTypeOf(bytes, fileName) {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (/\.json$/i.test(String(fileName))) return "application/json";
  return "application/octet-stream";
}

async function pinToPinata(bytes, fileName) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentTypeOf(bytes, fileName) }), fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));
  // cidVersion here must stay in step with PIN_OPTIONS above.
  form.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

  const response = await withTimeout((signal) =>
    fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { authorization: `Bearer ${config.pinataJwt}` },
      body: form,
      signal
    })
  );

  const text = await response.text();
  if (!response.ok) {
    throw providerError(
      `Pinata refused the pin (HTTP ${response.status}): ${text.slice(0, 300)}`,
      "IPFS_PIN_REJECTED"
    );
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw providerError("Pinata returned a response that is not JSON.", "IPFS_PIN_BAD_RESPONSE");
  }

  const cid = body.IpfsHash || body.cid;
  if (!cid) {
    throw providerError("Pinata returned no CID.", "IPFS_PIN_BAD_RESPONSE");
  }
  return { cid, pinSize: body.PinSize ?? bytes.length };
}

async function pinToKubo(bytes, fileName) {
  const base = String(config.ipfsApiUrl).replace(/\/+$/, "");
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentTypeOf(bytes, fileName) }), fileName);

  const headers = {};
  if (config.ipfsApiAuth) headers.authorization = config.ipfsApiAuth;

  const response = await withTimeout((signal) =>
    fetch(`${base}/api/v0/add?cid-version=0&pin=true&raw-leaves=false`, {
      method: "POST",
      headers,
      body: form,
      signal
    })
  );

  const text = await response.text();
  if (!response.ok) {
    throw providerError(
      `IPFS node refused the add (HTTP ${response.status}): ${text.slice(0, 300)}`,
      "IPFS_PIN_REJECTED"
    );
  }

  // `add` streams one JSON object per line; the last one is the root.
  const lines = text.trim().split("\n").filter(Boolean);
  let root = null;
  for (const line of lines) {
    try {
      root = JSON.parse(line);
    } catch {
      // A partial line is not fatal as long as one of them parsed.
    }
  }
  const cid = root?.Hash;
  if (!cid) {
    throw providerError("IPFS node returned no CID.", "IPFS_PIN_BAD_RESPONSE");
  }
  return { cid, pinSize: Number(root.Size || bytes.length) };
}

/**
 * Pins the document and independently confirms the CID.
 *
 * `cidSelfChecked` is the part worth reading: it is true only when the CID
 * recomputed from the bytes we uploaded equals the CID the service handed
 * back. False does not necessarily mean foul play — a service using different
 * chunking produces a different, equally valid CID — but it does mean this
 * gateway could not reproduce the address, so it says so instead of implying a
 * verification it did not perform.
 */
async function pinDocument(bytes, fileName = "e-bill-of-lading.pdf") {
  const provider = pinningProvider();
  if (!provider) {
    throw providerError(
      "No IPFS pinning service configured. Set PINATA_JWT (or IPFS_API_URL for a self-hosted node).",
      "IPFS_NOT_CONFIGURED",
      503
    );
  }
  if (!bytes?.length) {
    throw providerError("The document is empty.", "IPFS_EMPTY_DOCUMENT", 400);
  }
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw providerError(
      `The document is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
      "IPFS_DOCUMENT_TOO_LARGE",
      413
    );
  }

  const localCid = await computeCid(bytes);
  const pinned = provider === "pinata" ? await pinToPinata(bytes, fileName) : await pinToKubo(bytes, fileName);

  return {
    cid: pinned.cid,
    localCid,
    cidSelfChecked: pinned.cid === localCid,
    provider,
    fileName,
    size: bytes.length,
    pinSize: pinned.pinSize,
    sha256: sha256(bytes),
    gatewayUrl: `${config.ipfsGateways[0]}/ipfs/${pinned.cid}`,
    pinnedAt: new Date().toISOString()
  };
}

/**
 * Retrieves the bytes at a CID, racing every configured gateway.
 *
 * This used to try them one at a time with a 25-second timeout each, which put
 * up to 75 seconds on the critical path of every evidence read and every
 * verify — and the cache that normally hides that is cleared by any gateway
 * restart. Pressing "Verify milestones" then sat there for a minute before it
 * had even looked at the chain.
 *
 * Racing is the right shape for this: the gateways are interchangeable,
 * content addressing means a wrong answer is caught anyway, and the slowest
 * one no longer decides how long anyone waits. The losers are aborted so a
 * hung request does not hold a socket for the full timeout.
 */
async function fetchByCid(cid) {
  const gateways = config.ipfsGateways;
  if (!gateways.length) {
    throw providerError("No IPFS read gateways configured. Set IPFS_GATEWAYS.", "IPFS_NO_GATEWAYS");
  }

  const attempts = [];
  const controllers = [];

  async function tryGateway(gateway) {
    const url = `${gateway.replace(/\/+$/, "")}/ipfs/${cid}`;
    const controller = new AbortController();
    controllers.push(controller);
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > MAX_DOCUMENT_BYTES) throw new Error(`${declared} bytes, over the limit`);

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error(`${bytes.length} bytes, over the limit`);

      return { bytes, gateway, url };
    } catch (error) {
      const why = error.name === "AbortError" ? `timed out after ${FETCH_TIMEOUT_MS / 1000}s` : error.message;
      attempts.push(`${gateway} → ${why}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const winner = await Promise.any(gateways.map(tryGateway));
    for (const controller of controllers) {
      try { controller.abort(); } catch { /* the winner is already read */ }
    }
    return winner;
  } catch {
    const error = providerError(
      `Could not retrieve ${cid} from any IPFS gateway. Tried: ${attempts.join("; ")}`,
      "IPFS_UNREACHABLE"
    );
    error.details = { attempts };
    throw error;
  }
}

const FIELD_PATTERNS = {
  billOfLadingNumber:
    /(?:bill\s+of\s+lading|b\s*\/\s*l|waybill)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{3,24})/i,
  // "ship" is deliberately not an alternative here: it is a prefix of
  // "Shipper", which appears earlier on every bill of lading, so allowing it
  // reported the shipper's address as the vessel name.
  vessel: /\b(?:ocean\s+vessel|vessel|carrying\s+vessel|motor\s+vessel)\b\s*(?:name)?\s*[:.\-]?\s*([A-Z][A-Za-z0-9 .\-\/]{2,40})/i,
  voyage: /\b(?:voyage|voy\.?)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{0,12})/i,
  shipper: /\bshipper\s*(?:\/\s*exporter)?\s*[:.\-]?\s*([^\n]{3,90})/i,
  consignee: /\bconsignee\s*(?:\/\s*importer)?\s*[:.\-]?\s*([^\n]{3,90})/i,
  portOfLoading: /\bport\s+of\s+(?:loading|load|departure)\s*[:.\-]?\s*([^\n]{2,60})/i,
  portOfDischarge: /\bport\s+of\s+(?:discharge|destination|delivery)\s*[:.\-]?\s*([^\n]{2,60})/i,
  // Weights on a bill of lading are written every which way — 19 200,00 kg,
  // 19.200,00 KGS, 19,200.00 kg. The space is a thousands separator on an
  // Indonesian document, so the number class has to admit it, or the value
  // reads back as "19".
  grossWeight: /\b(?:verified\s+gross\s+mass|gross\s+weight|vgm)\b\s*(?:\(kg\))?\s*[:.\-]?\s*(\d[\d\s .,]{0,18}\d|\d)\s*(kgs?|mt|tonnes?|tons?)?/i,
  // The VGM is a distinct, legally separate figure from the gross weight: it
  // includes the tare of the container, and it is the one a terminal actually
  // checks at the gate. A bill of lading commonly carries both, and reading
  // the wrong one would put the wrong expected weight in front of a verifier.
  verifiedGrossMass: /\bverified\s+gross\s+mass\b\s*(?:\(kg\))?\s*[:.\-]?\s*(\d[\d\s .,]{0,18}\d|\d)\s*(kgs?|mt|tonnes?|tons?)?/i,
  placeOfIssue: /\bplace\s+of\s+issue\s*[:.\-]?\s*([^\n]{2,60})/i,
  issueDate: /\b(?:date\s+of\s+issue|issued?\s+(?:on|date)|shipped\s+on\s+board)\s*[:.\-]?\s*([0-9]{1,2}[\s\-\/][A-Za-z0-9]{2,9}[\s\-\/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
};

// The Commercial Invoice states what was sold and for how much; the Packing
// List states how it was packed. Between them they are the reference for the
// quantity the escrow is settling against, which the commodity string on chain
// never carried.
// A money figure, with or without the currency in front of it. Trade documents
// write "IDR 4.725.000,00", "Rp 4.725.000", and "4,725,000.00" — the first of
// which an `Rp`-only prefix silently skipped, so every amount read back as
// null while the pattern looked like it was working.
const MONEY = String.raw`(?:(?:IDR|USD|EUR|SGD|JPY|CNY|Rp)\.?[^\S\n]*)?(\d[\d\s .,]{2,20})`;

const INVOICE_PATTERNS = {
  // "No." is required and must sit on the same line. Optional, it matched the
  // "COMMERCIAL INVOICE" heading and then captured the word "Invoice" off the
  // next line as the invoice number.
  invoiceNumber:
    /\b(?:commercial\s+invoice|tax\s+invoice|invoice)[^\S\n]*(?:no\.?|number|#|nomor)[^\S\n]*[:.\-]?[^\S\n]*([A-Z0-9][A-Z0-9\-\/]{2,28})/i,
  invoiceDate:
    /\b(?:invoice\s+date|date\s+of\s+invoice|tanggal\s+invoice)\s*[:.\-]?\s*([0-9]{1,2}[\s\-\/][A-Za-z0-9]{2,9}[\s\-\/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i,
  quantity:
    /\b(?:total\s+)?(?:quantity|qty|jumlah)\b\s*[:.\-]?\s*(\d[\d\s .,]{0,14}\d|\d)\s*(kgs?|mt|tonnes?|tons?|bags?|cartons?|pcs)?/i,
  totalAmount: new RegExp(
    String.raw`\b(?:total\s+(?:amount|value)|amount\s+due|grand\s+total|total\s+invoice)\b[^\S\n]*[:.\-]?[^\S\n]*` + MONEY,
    "i"
  ),
  currency: /\b(USD|IDR|EUR|SGD|JPY|CNY)\b/,
  // Incoterms decide who pays freight and insurance, which is the difference
  // between an invoice total and what the importer actually owes.
  incoterm: /\b(FOB|CIF|CFR|EXW|FCA|FAS|DAP|DDP|CIP|CPT)\b/i
};

const PACKING_PATTERNS = {
  // Both orders: "Packages: 320" and "320 bags".
  packages:
    /\b(?:total\s+)?(?:packages?|colli|koli|cases?|bags?|cartons?)\b\s*[:.\-]?\s*(\d[\d\s.,]{0,10}\d|\d)\b/i,
  packagesReversed: /\b(\d[\d\s.,]{0,10}\d|\d)\s*(?:bags?|cartons?|packages?|colli|koli|cases?)\b/i,
  netWeight:
    /\bnet\s+weight\b\s*(?:\(kg\))?\s*[:.\-]?\s*(\d[\d\s .,]{0,18}\d|\d)\s*(kgs?|mt|tonnes?|tons?)?/i,
  grossWeight:
    /\bgross\s+weight\b\s*(?:\(kg\))?\s*[:.\-]?\s*(\d[\d\s .,]{0,18}\d|\d)\s*(kgs?|mt|tonnes?|tons?)?/i,
  marks: /\b(?:shipping\s+marks|marks\s+(?:and|&)\s+numbers)\s*[:.\-]?\s*([^\n]{2,60})/i
};

// Indonesian customs, as the documents are actually headed. PEB is issued by
// Bea Cukai at export, PIB at import, and the payment is evidenced by an NTPN
// — the state receipt number, which is the figure an auditor would check
// against DJP's own records.
const CUSTOMS_PATTERNS = {
  // A PEB or PIB carries two numbers and they are not interchangeable: the
  // "nomor pengajuan" is what the exporter's system submitted under, and the
  // "nomor pendaftaran" is what Bea Cukai registered it as. The registration
  // number is the one an auditor cites, so it is read separately and preferred
  // — see readCustomsFields. These two only catch the number when the document
  // writes it against the form's own name.
  pebNumber:
    /\bPEB\b[^\S\n]*(?:no\.?|nomor|number)[^\S\n]*[:.\-]?[^\S\n]*([0-9][0-9A-Z\-\/]{4,32})/i,
  pibNumber:
    /\bPIB\b[^\S\n]*(?:no\.?|nomor|number)[^\S\n]*[:.\-]?[^\S\n]*([0-9][0-9A-Z\-\/]{4,32})/i,
  registrationNumber: /\bnomor\s+pendaftaran\b[^\S\n]*[:.\-]?[^\S\n]*([0-9][0-9A-Z\-\/]{4,32})/i,
  submissionNumber: /\bnomor\s+(?:pengajuan|aju)\b[^\S\n]*[:.\-]?[^\S\n]*([0-9][0-9A-Z\-\/]{4,32})/i,
  registrationDate:
    /\b(?:tanggal\s+pendaftaran|registration\s+date)\s*[:.\-]?\s*([0-9]{1,2}[\s\-\/][A-Za-z0-9]{2,9}[\s\-\/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i,
  npwp: /\bNPWP\s*[:.\-]?\s*([0-9][0-9.\-]{10,24})/i,
  customsOffice:
    /\b(?:kantor\s+(?:pabean|pelayanan|bea\s+(?:dan\s+)?cukai)|customs\s+office)\s*[:.\-]?\s*([^\n]{3,60})/i,
  ntpn: /\bNTPN\s*[:.\-]?\s*([0-9A-Z]{10,32})/i,
  importDuty: new RegExp(String.raw`\b(?:bea\s+masuk|import\s+duty)\b[^\S\n]*(?:\(idr\))?[^\S\n]*[:.\-]?[^\S\n]*` + MONEY, "i"),
  vat: new RegExp(String.raw`\b(?:ppn|value\s+added\s+tax|vat)\b[^\S\n]*[:.\-]?[^\S\n]*` + MONEY, "i"),
  incomeTax: new RegExp(String.raw`\b(?:pph[^\S\n]*(?:22)?|income\s+tax)\b[^\S\n]*[:.\-]?[^\S\n]*` + MONEY, "i"),
  totalLevy: new RegExp(String.raw`\b(?:total\s+pungutan|jumlah\s+setoran|total\s+(?:duties|levy))\b[^\S\n]*[:.\-]?[^\S\n]*` + MONEY, "i"),
  paymentDate:
    /\b(?:tanggal\s+(?:bayar|pembayaran|setor)|payment\s+date|paid\s+on)\s*[:.\-]?\s*([0-9]{1,2}[\s\-\/][A-Za-z0-9]{2,9}[\s\-\/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
};

// ISO 6346 container numbers (4 letters + 7 digits) and the looser
// prefix-then-digits form this demo uses, e.g. TGHU-2026-001.
//
// The tail must contain digits. Without that requirement this matched any two
// adjacent capitalised words — "BILL OF LADING" and "SAMUDRA BIRU" were both
// being reported as container numbers.
const CONTAINER_TOKEN = /\b[A-Z]{4}(?:\d{7}|[-\s]\d{2,6}(?:[-\s]\d{1,6})?)\b/g;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

/** Normalises a container reference so TGHU-2026-001 and tghu 2026001 match. */
function normaliseRef(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function extractPdf(bytes) {
  const PDFParse = pdfParser();
  if (!PDFParse) throw new Error(dependencyError);
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return {
      text: result.text || "",
      pages: result.pages?.length ?? result.total ?? null,
      info: result.info || null
    };
  } finally {
    await parser.destroy?.();
  }
}

/**
 * A weight off a bill of lading, as a number.
 *
 * These are written every which way and the separators mean opposite things in
 * different conventions: 19 200,00 and 19,200.00 and 19.200,00 are all the
 * same weight. Whichever separator comes last is the decimal one; a lone
 * separator followed by exactly three digits is a thousands separator, because
 * a container weight is never given to a thousandth of a kilogram.
 *
 * Returns null rather than a guess when the text does not parse — a verifier
 * comparing against null shows "unknown", which is honest, where a wrong
 * number would be a fabricated discrepancy.
 */
function parseWeight(value, unit) {
  if (!value) return null;
  const raw = String(value).replace(/[\s ]/g, "");
  if (!/^\d[\d.,]*$/.test(raw)) return null;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let normalised;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    normalised = raw.slice(0, decimalAt).replace(/[.,]/g, "") + "." + raw.slice(decimalAt + 1);
  } else if (lastComma >= 0 || lastDot >= 0) {
    const at = Math.max(lastComma, lastDot);
    const tail = raw.slice(at + 1);
    normalised = tail.length === 3
      ? raw.replace(/[.,]/g, "")
      : raw.slice(0, at).replace(/[.,]/g, "") + "." + tail;
  } else {
    normalised = raw;
  }

  const number = Number(normalised);
  if (!Number.isFinite(number)) return null;
  // Tonnes and tons are close enough for a demo feed; the unit is reported
  // alongside so nothing downstream has to infer it.
  const factor = /^(mt|tonnes?|tons?)$/i.test(String(unit || "").trim()) ? 1000 : 1;
  return Math.round(number * factor * 100) / 100;
}

function readFields(text) {
  const fields = {};
  for (const [name, pattern] of Object.entries(FIELD_PATTERNS)) {
    const match = text.match(pattern);
    fields[name] = match ? clean(match[1]) : null;
  }
  if (fields.grossWeight) {
    const unit = text.match(FIELD_PATTERNS.grossWeight)?.[2];
    fields.grossWeightUnit = unit ? clean(unit).toLowerCase() : null;
    fields.grossWeightKg = parseWeight(fields.grossWeight, fields.grossWeightUnit);
  }
  if (fields.verifiedGrossMass) {
    const unit = text.match(FIELD_PATTERNS.verifiedGrossMass)?.[2];
    fields.verifiedGrossMassUnit = unit ? clean(unit).toLowerCase() : null;
    fields.verifiedGrossMassKg = parseWeight(fields.verifiedGrossMass, fields.verifiedGrossMassUnit);
  }

  const containers = new Set();
  for (const match of text.matchAll(CONTAINER_TOKEN)) {
    containers.add(clean(match[0]).toUpperCase());
  }
  fields.containerNumbers = [...containers].slice(0, 12);
  return fields;
}

/** Runs a pattern set over extracted text. Absent fields are null, never guessed. */
function readWith(text, patterns) {
  const fields = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    fields[name] = match ? clean(match[1] ?? match[0]) : null;
  }
  return fields;
}

function readInvoiceFields(text) {
  const fields = readWith(text, INVOICE_PATTERNS);
  if (fields.quantity) {
    const unit = text.match(INVOICE_PATTERNS.quantity)?.[2];
    fields.quantityUnit = unit ? clean(unit).toLowerCase() : null;
    // Only mass units convert. A bag count is not a weight, and turning one
    // into kilograms would invent a figure no document states.
    fields.quantityKg = /^(kgs?|mt|tonnes?|tons?)$/i.test(String(fields.quantityUnit || ""))
      ? parseWeight(fields.quantity, fields.quantityUnit)
      : null;
    fields.quantityCount = parseWeight(fields.quantity, null);
  }
  return fields;
}

function readPackingFields(text) {
  const fields = readWith(text, PACKING_PATTERNS);
  // Whichever order the document wrote it in.
  fields.packageCount = parseWeight(fields.packages || fields.packagesReversed, null);
  for (const name of ["netWeight", "grossWeight"]) {
    if (!fields[name]) continue;
    const unit = text.match(PACKING_PATTERNS[name])?.[2];
    fields[`${name}Unit`] = unit ? clean(unit).toLowerCase() : null;
    fields[`${name}Kg`] = parseWeight(fields[name], fields[`${name}Unit`]);
  }
  return fields;
}

function readCustomsFields(text) {
  const fields = readWith(text, CUSTOMS_PATTERNS);

  // A PEB and a PIB are laid out identically and both head their number "Nomor
  // Pendaftaran", so which form this is decides which field that number goes
  // in. The document's TITLE decides it, not the abbreviation appearing
  // somewhere in the body: a payment receipt cites the PIB it settles without
  // being one.
  //
  // The registration number is preferred over a number caught next to the
  // form's abbreviation, because "nomor pendaftaran" is what Bea Cukai
  // registered the declaration as, while the other candidate is usually the
  // submission number — which identifies a filing, not a lodged declaration.
  const registered = fields.registrationNumber || null;
  if (/pemberitahuan\s+ekspor/i.test(text)) fields.pebNumber = registered || fields.pebNumber || null;
  if (/pemberitahuan\s+impor/i.test(text)) fields.pibNumber = registered || fields.pibNumber || null;

  for (const name of ["importDuty", "vat", "incomeTax", "totalLevy"]) {
    if (fields[name]) fields[`${name}Idr`] = parseWeight(fields[name], null);
  }
  return fields;
}

// The two manifest kinds. They live here rather than in manifestService
// because that module requires this one, and verification has to recognise a
// manifest without importing the thing that writes them.
const ESCROW_MANIFEST_KIND = "stern/escrow-manifest@1";
const CUSTOMS_MANIFEST_KIND = "stern/customs-manifest@1";

/**
 * A STERN manifest, or null if these bytes are not one.
 *
 * Deliberately strict about the `stern` key. Anything else at a document CID —
 * a PDF, somebody else's JSON, a truncated file — is not a manifest and must
 * fall through to being checked as a document in its own right, which is what
 * keeps every escrow created before manifests existed working unchanged.
 */
function parseManifest(bytes, kind = ESCROW_MANIFEST_KIND) {
  // Cheap gate before spending a parse on an 8mb PDF.
  const head = bytes.subarray(0, 64).toString("utf8").trimStart();
  if (!head.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!parsed || parsed.stern !== kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Retrieved, re-addressed, and read. The shared first half of every check. */
async function retrieveDocument(cid) {
  const { bytes, gateway, url } = await fetchByCid(cid);
  const recomputed = await computeCid(bytes);
  const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";

  let extracted = null;
  let parseError = null;
  if (isPdf) {
    try {
      extracted = await extractPdf(bytes);
    } catch (error) {
      parseError = error.message;
    }
  }

  return {
    bytes,
    gateway,
    url,
    recomputed,
    cidMatchesContent: recomputed === cid,
    isPdf,
    extracted,
    parseError,
    text: extracted?.text || ""
  };
}

const hasEnoughText = (text) => text.replace(/\s+/g, "").length >= 200;

/**
 * One document named by a manifest.
 *
 * `sha256Matches` is the check worth having here beyond the CID: the manifest
 * records the digest of the bytes the gateway pinned, so comparing it against
 * what a public gateway serves catches a manifest that was written against
 * different content — a thing a CID alone cannot say, because a manifest and
 * the documents it names are addressed separately.
 */
async function verifySlot(entry, { read } = {}) {
  if (!entry?.cid) return null;

  const got = await retrieveDocument(entry.cid).catch((error) => ({ error }));
  if (got.error) {
    return {
      cid: entry.cid,
      fileName: entry.fileName || null,
      resolves: false,
      valid: false,
      reason: got.error.message
    };
  }

  const digest = sha256(got.bytes);
  const hasText = hasEnoughText(got.text);
  const notes = [];
  if (!got.isPdf) notes.push("The content at this CID is not a PDF.");
  if (got.parseError) notes.push(`The PDF could not be parsed: ${got.parseError}`);
  if (got.isPdf && !hasText) {
    notes.push("Almost no text could be extracted — a scan of this document would need OCR before its fields can be read.");
  }

  return {
    cid: entry.cid,
    fileName: entry.fileName || null,
    resolves: true,
    cidMatchesContent: got.cidMatchesContent,
    isPdf: got.isPdf,
    hasText,
    sha256: digest,
    declaredSha256: entry.sha256 || null,
    sha256Matches: entry.sha256 ? digest === entry.sha256 : null,
    pages: got.extracted?.pages ?? null,
    size: got.bytes.length,
    fields: got.text && read ? read(got.text) : null,
    text: got.text,
    notes,
    // Resolving and hashing back is the bar for a slot. Whether its CONTENT is
    // the right document is judged by the caller, which knows what the slot is
    // supposed to be.
    valid: got.cidMatchesContent && got.isPdf,
    gatewayUrl: got.url,
    retrievedFrom: got.gateway
  };
}

/**
 * Does the declared quantity agree with what the documents say?
 *
 * Reported, never required. Gross weight includes the tare of the packaging and
 * net weight does not, so a strict comparison produces discrepancies that are
 * an artefact of which figure a document happened to print. A visible
 * disagreement is useful; a milestone blocked by one would be a false refusal,
 * and this gateway's whole claim is that its refusals mean something.
 */
function compareQuantity(quantity, invoice, packing, bl) {
  if (!quantity) return null;

  const candidates = [
    invoice?.quantityKg != null && { label: "commercial invoice", kg: invoice.quantityKg },
    packing?.netWeightKg != null && { label: "packing list (net)", kg: packing.netWeightKg },
    packing?.grossWeightKg != null && { label: "packing list (gross)", kg: packing.grossWeightKg },
    bl?.grossWeightKg != null && { label: "bill of lading (gross)", kg: bl.grossWeightKg }
  ].filter(Boolean);

  // A count unit is compared against a count, not a weight.
  if (quantity.valueKg == null) {
    const counted = invoice?.quantityCount ?? packing?.packageCount ?? null;
    if (counted == null) {
      return { comparable: false, reason: `No document states a count to compare ${quantity.text} against.` };
    }
    const agrees = Math.abs(counted - quantity.value) <= Math.max(1, quantity.value * 0.02);
    return {
      comparable: true,
      agrees,
      declared: quantity.text,
      found: `${counted.toLocaleString("id-ID")} ${quantity.unitLabel}`,
      against: invoice?.quantityCount != null ? "commercial invoice" : "packing list",
      reason: agrees
        ? `The documents state ${counted.toLocaleString("id-ID")} ${quantity.unitLabel}, matching the declared quantity.`
        : `Declared ${quantity.text}, but the documents state ${counted.toLocaleString("id-ID")} ${quantity.unitLabel}.`
    };
  }

  if (!candidates.length) {
    return { comparable: false, reason: `No document states a weight to compare ${quantity.text} against.` };
  }

  // 5%: enough to absorb packaging and rounding between net, gross and VGM,
  // tight enough that a tenfold error or a wrong container is still caught.
  const tolerance = Math.max(1, quantity.valueKg * 0.05);
  const best = candidates.reduce((a, b) =>
    Math.abs(b.kg - quantity.valueKg) < Math.abs(a.kg - quantity.valueKg) ? b : a
  );
  const agrees = Math.abs(best.kg - quantity.valueKg) <= tolerance;

  return {
    comparable: true,
    agrees,
    declared: quantity.text,
    declaredKg: quantity.valueKg,
    found: `${best.kg.toLocaleString("id-ID")} kg`,
    against: best.label,
    tolerancePct: 5,
    reason: agrees
      ? `The ${best.label} states ${best.kg.toLocaleString("id-ID")} kg, within 5% of the declared ${quantity.text}.`
      : `Declared ${quantity.text} (${quantity.valueKg.toLocaleString("id-ID")} kg), but the ${best.label} states ${best.kg.toLocaleString("id-ID")} kg.`
  };
}

/**
 * The full check on a CID: does it resolve, do the bytes hash back to it, is
 * it a bill of lading, and is it this escrow's bill of lading.
 *
 * Two shapes are accepted at `documentCid`, and the verdict returned is the
 * same shape for both so nothing downstream has to know which it got:
 *
 *   - a bill of lading PDF, which is how every escrow created before manifests
 *     existed was written, and
 *   - a STERN escrow manifest: JSON stating the quantity and naming the CIDs
 *     of the bill of lading, the commercial invoice and the packing list.
 *
 * `simulateFault` keeps the existing demo lever working. It marks the result
 * as failed *and* says it was simulated, so a rehearsal can never be mistaken
 * for a genuine document failure.
 */
async function verifyDocument(cid, { containerRef = null, simulateFault = false } = {}) {
  const checks = {};
  const notes = [];

  if (typeof cid !== "string" || !cid.trim()) {
    return {
      cid: cid ?? null,
      available: false,
      valid: false,
      reason: "This escrow has no document CID on chain.",
      checks,
      fields: null,
      simulatedFault: false
    };
  }

  const trimmed = cid.trim();
  // The old prefix check lives on only as a diagnosis: a value shaped like the
  // pre-IPFS placeholder is reported for what it is, rather than silently
  // failing to resolve.
  const looksPlaceholder = /^bafybeistern/.test(trimmed) || /^0x[0-9a-f]{64}$/i.test(trimmed);

  const retrieval = await fetchByCid(trimmed).catch((error) => ({ error }));
  if (retrieval.error) {
    return {
      cid: trimmed,
      available: false,
      valid: false,
      reason: looksPlaceholder
        ? "This CID is a local content hash from before the document was pinned, so nothing resolves at it. Re-create the escrow with a pinned e-BL."
        : retrieval.error.message,
      checks: { cidResolves: false },
      fields: null,
      placeholder: looksPlaceholder,
      simulatedFault: false
    };
  }

  const { bytes, gateway, url } = retrieval;
  checks.cidResolves = true;

  const recomputed = await computeCid(bytes);
  checks.cidMatchesContent = recomputed === trimmed;
  if (!checks.cidMatchesContent) {
    notes.push(
      `The bytes at this address hash to ${recomputed}, not ${trimmed}. Either the gateway served different content or the document was pinned with different chunking.`
    );
  }

  const manifest = parseManifest(bytes, ESCROW_MANIFEST_KIND);
  const verdict = manifest
    ? await verifyManifestDocument({ manifest, trimmed, bytes, gateway, url, recomputed, checks, notes, containerRef })
    : await verifyBareBillOfLading({ trimmed, bytes, gateway, url, recomputed, checks, notes, containerRef });

  const failed = verdict.required.filter((name) => !checks[name]);
  const valid = failed.length === 0 && !simulateFault;

  if (simulateFault) {
    notes.push("Fault simulation is on for this escrow, so this check is reported as failed regardless of the document.");
  }

  return {
    cid: trimmed,
    available: true,
    valid,
    kind: manifest ? "manifest" : "bill_of_lading",
    simulatedFault: Boolean(simulateFault),
    failedChecks: simulateFault ? [...failed, "simulatedFault"] : failed,
    checks,
    fields: verdict.fields,
    notes,
    reason: valid ? verdict.reason : notes[0] || `Failed: ${failed.join(", ")}.`,
    document: verdict.document,
    ...(verdict.extra || {}),
    checkedAt: new Date().toISOString()
  };
}

/** The pre-manifest shape: `documentCid` is the bill of lading PDF itself. */
async function verifyBareBillOfLading({ trimmed, bytes, gateway, url, recomputed, checks, notes, containerRef }) {
  checks.isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";

  let extracted = null;
  let fields = null;
  if (checks.isPdf) {
    try {
      extracted = await extractPdf(bytes);
    } catch (error) {
      notes.push(`The PDF could not be parsed: ${error.message}`);
    }
  } else {
    notes.push("The content at this CID is not a PDF.");
  }

  const text = extracted?.text || "";
  checks.hasText = hasEnoughText(text);
  if (checks.isPdf && !checks.hasText) {
    notes.push(
      "Almost no text could be extracted. A scanned image of a bill of lading needs OCR before its fields can be read."
    );
  }

  if (text) fields = readFields(text);

  checks.hasBillOfLadingNumber = Boolean(fields?.billOfLadingNumber);
  applyContainerCheck({ checks, notes, fields, text, containerRef });

  return {
    required: ["cidResolves", "cidMatchesContent", "isPdf", "hasText", "hasBillOfLadingNumber", "hasContainerReference"],
    fields,
    reason: "The bytes at this CID hash back to it, and they are a bill of lading naming this escrow's container.",
    document: {
      size: bytes.length,
      sha256: sha256(bytes),
      pages: extracted?.pages ?? null,
      title: clean(extracted?.info?.Title) || null,
      recomputedCid: recomputed,
      retrievedFrom: gateway,
      gatewayUrl: url
    }
  };
}

/**
 * `documentCid` is a manifest: the quantity plus the CIDs of the bill of
 * lading, the commercial invoice and the packing list.
 *
 * The bill of lading's own checks are merged into the same `checks` object
 * under the same names the bare-PDF path uses, so every consumer — the
 * milestone gate, the evidence panel, the tests — reads one shape. What is new
 * sits alongside under distinct names.
 */
async function verifyManifestDocument({ manifest, trimmed, bytes, gateway, url, recomputed, checks, notes, containerRef }) {
  const declared = manifest.documents || {};
  checks.manifestValid = Boolean(declared.billOfLading?.cid);
  if (!checks.manifestValid) {
    notes.push("This manifest names no bill of lading, so there is no document to identify the shipment by.");
  }

  // In parallel: they are independent retrievals, and a manifest with three
  // documents would otherwise cost three sequential gateway races.
  const [bl, invoice, packing] = await Promise.all([
    verifySlot(declared.billOfLading, { read: readFields }),
    verifySlot(declared.commercialInvoice, { read: readInvoiceFields }),
    verifySlot(declared.packingList, { read: readPackingFields })
  ]);

  const required = ["cidResolves", "cidMatchesContent", "manifestValid"];

  if (bl) {
    checks.billOfLadingResolves = bl.resolves;
    checks.isPdf = Boolean(bl.isPdf);
    checks.hasText = Boolean(bl.hasText);
    checks.hasBillOfLadingNumber = Boolean(bl.fields?.billOfLadingNumber);
    if (bl.sha256Matches === false) {
      notes.push("The bill of lading's bytes do not match the digest the manifest recorded for it.");
    }
    for (const note of bl.notes || []) notes.push(`Bill of lading: ${note}`);
    applyContainerCheck({ checks, notes, fields: bl.fields, text: bl.text || "", containerRef });
    required.push("billOfLadingResolves", "isPdf", "hasText", "hasBillOfLadingNumber", "hasContainerReference");
  } else {
    checks.billOfLadingResolves = false;
    checks.isPdf = false;
    checks.hasText = false;
    checks.hasBillOfLadingNumber = false;
    checks.hasContainerReference = false;
    required.push("billOfLadingResolves");
  }

  // A document is only required once the manifest declares it. Declared and
  // broken must fail; not attached at all is a different statement, and the
  // screen says which.
  if (invoice) {
    checks.invoiceResolves = invoice.valid;
    for (const note of invoice.notes || []) notes.push(`Commercial invoice: ${note}`);
    required.push("invoiceResolves");
  }
  if (packing) {
    checks.packingListResolves = packing.valid;
    for (const note of packing.notes || []) notes.push(`Packing list: ${note}`);
    required.push("packingListResolves");
  }

  const quantity = manifest.quantity || null;
  const quantityCheck = compareQuantity(quantity, invoice?.fields, packing?.fields, bl?.fields);
  if (quantityCheck?.comparable) {
    // Reported, not required — see compareQuantity.
    checks.quantityAgrees = quantityCheck.agrees;
    if (!quantityCheck.agrees) notes.push(quantityCheck.reason);
  }

  const fields = {
    ...(bl?.fields || {}),
    quantity,
    invoice: invoice?.fields || null,
    packing: packing?.fields || null
  };

  const attached = [
    "bill of lading",
    invoice ? "commercial invoice" : null,
    packing ? "packing list" : null
  ].filter(Boolean);

  return {
    required,
    fields,
    reason: `The manifest at this CID hashes back to it and names ${attached.join(", ")}${
      quantity ? `, for ${quantity.text}` : ""
    }. The bill of lading resolves and names this escrow's container.`,
    // `document` describes the bill of lading, because that is the document a
    // reader means when they ask to see the e-BL.
    document: bl?.resolves
      ? {
          size: bl.size,
          sha256: bl.sha256,
          pages: bl.pages,
          title: null,
          recomputedCid: bl.cid,
          retrievedFrom: bl.retrievedFrom,
          gatewayUrl: bl.gatewayUrl
        }
      : {
          size: bytes.length,
          sha256: sha256(bytes),
          pages: null,
          title: null,
          recomputedCid: recomputed,
          retrievedFrom: gateway,
          gatewayUrl: url
        },
    extra: {
      manifest: {
        cid: trimmed,
        containerRef: manifest.containerRef || null,
        commodity: manifest.commodity || null,
        quantity,
        quantityCheck,
        // Read back out of the pinned bytes, not from any store: the clauses a
        // person is judged against have to be the ones the CID commits to.
        clauses: Array.isArray(manifest.clauses) ? manifest.clauses : [],
        createdAt: manifest.createdAt || null,
        // `text` is dropped: it is the whole PDF, and this payload is served to
        // a browser on every evidence read.
        documents: {
          billOfLading: stripText(bl),
          commercialInvoice: stripText(invoice),
          packingList: stripText(packing)
        }
      }
    }
  };
}

function stripText(slot) {
  if (!slot) return null;
  const { text, ...rest } = slot;
  return rest;
}

function applyContainerCheck({ checks, notes, fields, text, containerRef }) {
  if (containerRef) {
    const wanted = normaliseRef(containerRef);
    const found = (fields?.containerNumbers || []).some((c) => normaliseRef(c) === wanted);
    // Fall back to a raw scan: the container may appear in a table cell the
    // token pattern split differently.
    checks.hasContainerReference = found || normaliseRef(text).includes(wanted);
    if (!checks.hasContainerReference) {
      notes.push(`The document does not mention container ${containerRef}, which is the one this escrow covers.`);
    }
  } else {
    checks.hasContainerReference = (fields?.containerNumbers || []).length > 0;
  }
}

/**
 * The customs manifest for a milestone-3 proof: PEB, PIB and the payment.
 *
 * Separate from verifyDocument because it answers a different question and
 * carries a different verdict. Claiming Cleared is a claim about legality at
 * two borders, and the documents that evidence it are issued by two different
 * authorities at two different times — none of which exists when the escrow is
 * created, which is why they cannot live in `documentCid` at all.
 */
async function verifyCustomsManifest(cid, { containerRef = null } = {}) {
  if (typeof cid !== "string" || !cid.trim()) {
    return { cid: cid ?? null, available: false, valid: false, reason: "No customs manifest CID.", checks: {} };
  }

  const trimmed = cid.trim();
  const checks = {};
  const notes = [];

  const retrieval = await fetchByCid(trimmed).catch((error) => ({ error }));
  if (retrieval.error) {
    return {
      cid: trimmed,
      available: false,
      valid: false,
      reason: retrieval.error.message,
      checks: { cidResolves: false },
      notes: [retrieval.error.message]
    };
  }

  const { bytes } = retrieval;
  checks.cidResolves = true;
  checks.cidMatchesContent = (await computeCid(bytes)) === trimmed;

  const manifest = parseManifest(bytes, CUSTOMS_MANIFEST_KIND);
  checks.manifestValid = Boolean(manifest?.documents?.exportDeclaration?.cid);
  if (!manifest) {
    notes.push("The content at this CID is not a STERN customs manifest.");
  } else if (!checks.manifestValid) {
    notes.push("The customs manifest names no PEB, which is the document that evidences the export itself.");
  }

  const declared = manifest?.documents || {};
  const [peb, pib, duty] = await Promise.all([
    verifySlot(declared.exportDeclaration, { read: readCustomsFields }),
    verifySlot(declared.importDeclaration, { read: readCustomsFields }),
    verifySlot(declared.dutyPayment, { read: readCustomsFields })
  ]);

  const required = ["cidResolves", "cidMatchesContent", "manifestValid"];

  if (peb) {
    checks.pebResolves = peb.valid;
    checks.hasPebNumber = Boolean(peb.fields?.pebNumber || peb.fields?.registrationNumber);
    if (!checks.hasPebNumber) {
      notes.push("No PEB registration number could be read from the export declaration.");
    }
    for (const note of peb.notes || []) notes.push(`PEB: ${note}`);
    required.push("pebResolves", "hasPebNumber");
  } else {
    checks.pebResolves = false;
    checks.hasPebNumber = false;
    required.push("pebResolves");
  }

  if (pib) {
    checks.pibResolves = pib.valid;
    checks.hasPibNumber = Boolean(pib.fields?.pibNumber || pib.fields?.registrationNumber);
    for (const note of pib.notes || []) notes.push(`PIB: ${note}`);
    required.push("pibResolves");
  }

  if (duty) {
    checks.dutyPaymentResolves = duty.valid;
    // NTPN is the state receipt number. Its presence is what distinguishes a
    // payment that was made from a bill that was issued.
    checks.hasPaymentReference = Boolean(duty.fields?.ntpn || duty.fields?.paymentDate);
    if (!checks.hasPaymentReference) {
      notes.push("No NTPN or payment date could be read from the duty payment document, so it evidences an amount owed rather than one paid.");
    }
    for (const note of duty.notes || []) notes.push(`Duty payment: ${note}`);
    required.push("dutyPaymentResolves");
  }

  // The container reference, checked against whichever declarations carry it.
  if (containerRef) {
    const wanted = normaliseRef(containerRef);
    const texts = [peb?.text, pib?.text, duty?.text].filter(Boolean);
    checks.mentionsContainer = texts.some((text) => normaliseRef(text).includes(wanted));
    if (!checks.mentionsContainer && texts.length) {
      notes.push(`None of the customs documents mentions container ${containerRef}.`);
    }
  }

  const failed = required.filter((name) => !checks[name]);
  const valid = failed.length === 0;

  const attached = [peb && "PEB", pib && "PIB", duty && "proof of payment"].filter(Boolean);

  return {
    cid: trimmed,
    available: true,
    valid,
    failedChecks: failed,
    checks,
    notes,
    reason: valid
      ? `The customs manifest hashes back to its CID and names ${attached.join(", ")}, each of which resolves.`
      : notes[0] || `Failed: ${failed.join(", ")}.`,
    escrowId: manifest?.escrowId || null,
    containerRef: manifest?.containerRef || null,
    createdAt: manifest?.createdAt || null,
    documents: {
      exportDeclaration: stripText(peb),
      importDeclaration: stripText(pib),
      dutyPayment: stripText(duty)
    },
    fields: {
      pebNumber: peb?.fields?.pebNumber || peb?.fields?.registrationNumber || null,
      pebDate: peb?.fields?.registrationDate || null,
      pibNumber: pib?.fields?.pibNumber || pib?.fields?.registrationNumber || null,
      pibDate: pib?.fields?.registrationDate || null,
      customsOffice: peb?.fields?.customsOffice || pib?.fields?.customsOffice || null,
      npwp: peb?.fields?.npwp || pib?.fields?.npwp || null,
      ntpn: duty?.fields?.ntpn || null,
      importDutyIdr: duty?.fields?.importDutyIdr ?? pib?.fields?.importDutyIdr ?? null,
      vatIdr: duty?.fields?.vatIdr ?? pib?.fields?.vatIdr ?? null,
      incomeTaxIdr: duty?.fields?.incomeTaxIdr ?? pib?.fields?.incomeTaxIdr ?? null,
      paymentDate: duty?.fields?.paymentDate || null
    },
    checkedAt: new Date().toISOString()
  };
}

/** Same check, memoised on the CID, which names immutable content. */
async function verifyCustomsManifestCached(cid, options = {}) {
  const key = `customs|${cid}|${options.containerRef || ""}`;
  const hit = verdicts.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return { ...hit.value, cached: true };

  const value = await verifyCustomsManifest(cid, options);
  verdicts.set(key, { value, expiresAt: now + (value.valid ? OK_TTL_MS : FAIL_TTL_MS) });
  return value;
}

/**
 * The simulated failure, applied on top of a real verdict.
 *
 * It has to add itself to `failedChecks` as well as flipping `valid`: that
 * list is what the evidence item reports as the actual value, and a simulated
 * failure with an empty list showed up downstream as a bare "false" with no
 * stated cause — indistinguishable from a document that failed for real.
 */
function applyFault(value) {
  return {
    ...value,
    valid: false,
    simulatedFault: true,
    failedChecks: [...(value.failedChecks || []), "simulatedFault"],
    notes: [
      ...(value.notes || []),
      "Fault simulation is on for this escrow, so this check is reported as failed regardless of the document."
    ],
    reason: "Fault simulation is on for this escrow, so the e-BL check is reported as failed."
  };
}

/** Same check, memoised — a CID's content cannot change, so neither can its verdict. */
async function verifyDocumentCached(cid, options = {}) {
  const key = `${cid}|${options.containerRef || ""}`;
  const hit = verdicts.get(key);
  const now = Date.now();

  if (hit && hit.expiresAt > now) {
    // The fault lever is a live switch, so it is applied to the cached verdict
    // rather than being baked into it.
    const cached = { ...hit.value, cached: true };
    return options.simulateFault ? applyFault(cached) : cached;
  }

  const value = await verifyDocument(cid, { ...options, simulateFault: false });
  verdicts.set(key, { value, expiresAt: now + (value.valid ? OK_TTL_MS : FAIL_TTL_MS) });
  return options.simulateFault ? applyFault(value) : value;
}

function ipfsStatus() {
  const provider = pinningProvider();
  // Touch both libraries so the status reports a broken install rather than
  // waiting for the first document to reveal it.
  const librariesReady = Boolean(hasher() && pdfParser());

  return {
    configured: Boolean(provider) && librariesReady,
    provider,
    // Named apart from `configured`: "no pinning key" and "the install is
    // broken" want different fixes, and collapsing them sends someone hunting
    // for a missing environment variable they already set.
    librariesReady,
    ...(dependencyError ? { dependencyError } : {}),
    gateways: config.ipfsGateways,
    cidVersion: PIN_OPTIONS.cidVersion,
    maxDocumentBytes: MAX_DOCUMENT_BYTES
  };
}

module.exports = {
  computeCid,
  pinDocument,
  fetchByCid,
  verifyDocument,
  verifyDocumentCached,
  verifyCustomsManifest,
  verifyCustomsManifestCached,
  parseManifest,
  pinningProvider,
  ipfsStatus,
  ESCROW_MANIFEST_KIND,
  CUSTOMS_MANIFEST_KIND,
  MAX_DOCUMENT_BYTES
};
