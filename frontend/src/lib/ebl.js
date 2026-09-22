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

/**
 * Pins the e-BL and returns everything the creation screen needs to show what
 * was actually checked.
 *
 * `containerRef` is passed through so the gateway can confirm the document
 * names the container this escrow is about — a valid bill of lading for
 * somebody else's shipment is not evidence for this one.
 */
export async function pinEbl(file, { containerRef } = {}) {
  const { pinEblDocument, apiConfigured } = await import("./sternApi.js");

  if (!apiConfigured) {
    // Carries the same code the gateway uses for its own unconfigured state,
    // so callers have one condition to fall back on rather than two.
    const error = new Error(
      "No gateway configured, so the e-BL cannot be pinned. Set VITE_ORACLE_API in frontend/.env."
    );
    error.code = "API_NOT_CONFIGURED";
    throw error;
  }
  if (file.size > MAX_EBL_BYTES) {
    throw new Error(
      `${formatBytes(file.size)} is too large — the limit is ${formatBytes(MAX_EBL_BYTES)}.`
    );
  }
  if (file.size === 0) {
    throw new Error("That file is empty.");
  }

  const [contentBase64, sha256] = await Promise.all([toBase64(file), sha256Hex(file)]);
  const pinned = await pinEblDocument({ fileName: file.name, contentBase64, containerRef });

  return {
    cid: pinned.cid,
    // True when the gateway recomputed the same CID from the bytes it
    // uploaded. It is the difference between "the pinning service told us this
    // address" and "we checked the address ourselves".
    cidSelfChecked: Boolean(pinned.cidSelfChecked),
    provider: pinned.provider,
    fileName: file.name,
    size: file.size,
    sha256,
    gatewaySha256: pinned.sha256,
    verification: pinned.verification || null,
    gatewayUrl: pinned.gatewayUrl || null
  };
}

/** The checks the gateway ran, as rows for the UI. */
export function eblCheckRows(verification) {
  if (!verification?.checks) return [];
  const LABELS = {
    cidResolves: "Resolves on IPFS",
    cidMatchesContent: "Bytes hash back to the CID",
    isPdf: "Is a PDF",
    hasText: "Text is readable",
    hasBillOfLadingNumber: "Carries a B/L number",
    hasContainerReference: "Names this container"
  };
  return Object.entries(LABELS)
    .filter(([key]) => verification.checks[key] !== undefined)
    .map(([key, label]) => ({ key, label, passed: verification.checks[key] === true }));
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
