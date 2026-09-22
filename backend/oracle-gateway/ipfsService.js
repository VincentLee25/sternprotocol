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
const FETCH_TIMEOUT_MS = 25000;

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

async function withTimeout(run, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function pinToPinata(bytes, fileName) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
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
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);

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

/** Retrieves the bytes at a CID, trying each configured gateway in turn. */
async function fetchByCid(cid) {
  const attempts = [];
  for (const gateway of config.ipfsGateways) {
    const url = `${gateway.replace(/\/+$/, "")}/ipfs/${cid}`;
    try {
      const response = await withTimeout((signal) => fetch(url, { signal }));
      if (!response.ok) {
        attempts.push(`${gateway} → HTTP ${response.status}`);
        continue;
      }
      const length = Number(response.headers.get("content-length") || 0);
      if (length > MAX_DOCUMENT_BYTES) {
        attempts.push(`${gateway} → ${length} bytes, over the limit`);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_DOCUMENT_BYTES) {
        attempts.push(`${gateway} → ${bytes.length} bytes, over the limit`);
        continue;
      }
      return { bytes, gateway, url };
    } catch (error) {
      attempts.push(`${gateway} → ${error.name === "AbortError" ? "timed out" : error.message}`);
    }
  }
  const error = providerError(
    `Could not retrieve ${cid} from any IPFS gateway. Tried: ${attempts.join("; ")}`,
    "IPFS_UNREACHABLE"
  );
  error.details = { attempts };
  throw error;
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
  issueDate: /\b(?:date\s+of\s+issue|issued?\s+(?:on|date)|shipped\s+on\s+board)\s*[:.\-]?\s*([0-9]{1,2}[\s\-\/][A-Za-z0-9]{2,9}[\s\-\/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i
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

function readFields(text) {
  const fields = {};
  for (const [name, pattern] of Object.entries(FIELD_PATTERNS)) {
    const match = text.match(pattern);
    fields[name] = match ? clean(match[1]) : null;
  }
  if (fields.grossWeight) {
    const unit = text.match(FIELD_PATTERNS.grossWeight)?.[2];
    fields.grossWeightUnit = unit ? clean(unit).toLowerCase() : null;
  }

  const containers = new Set();
  for (const match of text.matchAll(CONTAINER_TOKEN)) {
    containers.add(clean(match[0]).toUpperCase());
  }
  fields.containerNumbers = [...containers].slice(0, 12);
  return fields;
}

/**
 * The full check on a CID: does it resolve, do the bytes hash back to it, is
 * it a bill of lading, and is it this escrow's bill of lading.
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
  checks.hasText = text.replace(/\s+/g, "").length >= 200;
  if (checks.isPdf && !checks.hasText) {
    notes.push(
      "Almost no text could be extracted. A scanned image of a bill of lading needs OCR before its fields can be read."
    );
  }

  if (text) fields = readFields(text);

  checks.hasBillOfLadingNumber = Boolean(fields?.billOfLadingNumber);

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

  const required = ["cidResolves", "cidMatchesContent", "isPdf", "hasText", "hasBillOfLadingNumber", "hasContainerReference"];
  const failed = required.filter((name) => !checks[name]);
  const valid = failed.length === 0 && !simulateFault;

  if (simulateFault) {
    notes.push("Fault simulation is on for this escrow, so this check is reported as failed regardless of the document.");
  }

  return {
    cid: trimmed,
    available: true,
    valid,
    simulatedFault: Boolean(simulateFault),
    failedChecks: simulateFault ? [...failed, "simulatedFault"] : failed,
    checks,
    fields,
    notes,
    reason: valid
      ? "The bytes at this CID hash back to it, and they are a bill of lading naming this escrow's container."
      : notes[0] || `Failed: ${failed.join(", ")}.`,
    document: {
      size: bytes.length,
      sha256: sha256(bytes),
      pages: extracted?.pages ?? null,
      title: clean(extracted?.info?.Title) || null,
      recomputedCid: recomputed,
      retrievedFrom: gateway,
      gatewayUrl: url
    },
    checkedAt: new Date().toISOString()
  };
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
  pinningProvider,
  ipfsStatus,
  MAX_DOCUMENT_BYTES
};
