// Typed client for the oracle-gateway. Shapes here were read off the gateway's
// own source (backend/oracle-gateway/{index,contractService,oracleService,
// faucetService}.js), not only from the handoff doc, because the two had already
// drifted once.
//
// Boundary, per docs/FRONTEND_HANDOFF_UPDATED.md §1: the backend owns reads,
// evidence, verifier submission and dispute PREPARATION. It never signs for the
// user. Anything that moves the importer's money is signed by their Particle
// Smart Account — see lib/disputeFlow.js.
//
// Privileged routes (/submit-oracle, /milestones/:id/submit, /resolve-dispute)
// sit behind INTERNAL_API_KEY and are deliberately absent from this client. The
// browser must never hold that key.

const RAW_BASE = import.meta.env.VITE_ORACLE_API || "";

// Trailing slashes would produce //escrows, which Express treats as a different
// route and answers with a 404 that reads like a missing endpoint.
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

export const apiConfigured = Boolean(API_BASE);

export class ApiError extends Error {
  constructor(message, { status, code, url } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.url = url;
  }
}

async function request(path, { method = "GET", body, signal, headers } = {}) {
  if (!apiConfigured) {
    throw new ApiError(
      "No backend configured. Set VITE_ORACLE_API in .env (the gateway runs on http://localhost:4000 by default).",
      { code: "API_NOT_CONFIGURED" }
    );
  }

  const url = `${API_BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: body ? { "Content-Type": "application/json", ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (cause) {
    // An aborted request is not a failure — it is this app cancelling its own
    // fetch on unmount or when the escrow changes. Re-throw it untouched.
    //
    // Wrapping it was a real bug: callers filter on `err.name === "AbortError"`,
    // and renaming it to ApiError defeated every one of those guards. Ordinary
    // navigation then painted "Could not reach the STERN gateway... check
    // CORS_ORIGINS" over a gateway that was answering perfectly well, and sent
    // us hunting for a CORS problem that did not exist.
    if (cause?.name === "AbortError") throw cause;

    // Past that, fetch only rejects on transport failure. A gateway that is not
    // running, or one that has not allow-listed this origin, both land here —
    // and the bare "Failed to fetch" gives no clue which.
    throw new ApiError(
      `Could not reach the STERN gateway at ${API_BASE}. Check that it is running and that CORS_ORIGINS allows this origin.`,
      { code: "API_UNREACHABLE", url, cause }
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      code: payload?.code,
      url
    });
  }
  return payload;
}

function identityRequest(path, { token, ...options } = {}) {
  return request(path, {
    ...options,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export const registerCompany = (body) => identityRequest("/auth/register-company", { method: "POST", body });
export const authorizeParticle = (body) => identityRequest("/auth/particle/session", { method: "POST", body });
export const acceptCompanyInvitation = (body) => identityRequest("/auth/accept-invitation", { method: "POST", body });
export const getCompanyMe = (token) => identityRequest("/auth/me", { token });
export const updateCompanyMe = (token, body) => identityRequest("/auth/me", { method: "PATCH", token, body });
export const getCompanyMemberships = (token) => identityRequest("/auth/memberships", { token });
export const switchCompany = (token, companyId) => identityRequest("/auth/switch-company", { method: "POST", token, body: { companyId } });
export const listCompanyUsers = (token, companyId, { signal } = {}) => identityRequest(`/companies/${encodeURIComponent(companyId)}/users`, { token, signal });
export const createCompanyInvitation = (token, companyId, body) => identityRequest(`/companies/${encodeURIComponent(companyId)}/invitations`, { method: "POST", token, body });
export const beginMfaSetup = (token) => identityRequest("/auth/mfa/setup", { method: "POST", token });
export const confirmMfaSetup = (body) => identityRequest("/auth/mfa/confirm", { method: "POST", body });
export const verifyMfa = (body) => identityRequest("/auth/mfa/verify", { method: "POST", body });

// --- Escrows ---------------------------------------------------------------
// `address` filters to escrows where the address is importer, exporter or
// arbiter. `role` narrows to one of those, and the gateway rejects role without
// address with a 400, so do not send one alone.
export function listEscrows({ address, role, state, signal } = {}) {
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (role) params.set("role", role);
  if (state) params.set("state", state);
  const query = params.toString();
  return request(`/escrows${query ? `?${query}` : ""}`, { signal });
}

export const getEscrow = (id, { signal } = {}) => request(`/escrows/${id}`, { signal });
export const getTimelock = (id, { signal } = {}) => request(`/escrows/${id}/timelock`, { signal });
export const getActivity = (id, { signal } = {}) => request(`/escrows/${id}/activity`, { signal });
export const getDispute = (id, { signal } = {}) => request(`/escrows/${id}/dispute`, { signal });

// Returns the bond, the challenge window, and BOTH calldatas the user must
// sign. The gateway explicitly does not submit these itself.
export const prepareDispute = (id, contestedMilestone) =>
  request(`/escrows/${id}/dispute/prepare`, { method: "POST", body: { contestedMilestone } });

// --- Oracle ----------------------------------------------------------------
export const getEvidence = (id, { signal } = {}) => request(`/oracle/evidence/${id}`, { signal });
export const getOracleIdentity = ({ signal } = {}) => request("/oracle/identity", { signal });
export const getOracleStatus = ({ signal } = {}) => request("/oracle/status", { signal });
export const getVerifiers = ({ signal } = {}) => request("/verifiers", { signal });
export const getMockStatus = (id, { signal } = {}) => request(`/mock-status/${id}`, { signal });

/**
 * Asks the gateway to run its own verification and commit whatever passes.
 *
 * This does NOT give the browser the ability to sign a proof — it cannot, and
 * must not. The verifier keys stay on the gateway; this only asks it to do the
 * job it was always going to do. If the sources fail, the gateway refuses, and
 * that refusal is the correct outcome rather than an error to work around.
 *
 * Writes to chain, so it is slow by nature. Callers must show progress.
 */
export const verifyMilestones = (id) => request(`/oracle/verify/${id}`, { method: "POST", body: {} });

// Demo-only, in-memory, and explicitly NOT a bad on-chain proof: it rewrites the
// current mock source so the gateway can detect that an already-committed proof
// now disagrees with it. Pass "none" to reset.
export const simulateFault = (id, fault) =>
  request(`/oracle/simulate/${id}`, { method: "POST", body: { fault } });

// --- Counterparty directory ------------------------------------------------
//
// So creating an escrow does not mean pasting 42 hex characters twice. A
// handle is self-chosen and proves nothing about who owns the wallet, so every
// response carries the address and the UI keeps it visible — see
// backend/oracle-gateway/directoryService.js.

/** Matches for a partial handle or company name. Needs at least 2 characters. */
export const lookupDirectory = (q, { signal } = {}) =>
  request(`/directory/lookup?q=${encodeURIComponent(q)}`, { signal });

/** Exact resolution of a handle typed as @name. */
export const resolveHandle = (handle, { signal } = {}) =>
  request(`/directory/resolve/${encodeURIComponent(String(handle).replace(/^@/, ""))}`, { signal });

/** Claims or renames the handle pointing at this Smart Account. */
export const claimHandle = ({ smartAccountAddress, handle, displayName }) =>
  request("/directory/claim", { method: "POST", body: { smartAccountAddress, handle, displayName } });

/** The handle this Smart Account already holds, or null. */
export const directoryForAddress = (address, { signal } = {}) =>
  request(`/directory/address/${encodeURIComponent(address)}`, { signal });

// --- e-BL on IPFS ----------------------------------------------------------
//
// The pinning credential is a secret and stays on the gateway, so the browser
// hands it the bytes rather than talking to a pinning service itself. What
// comes back is the CID the document actually resolves at — that is the value
// that goes on chain, and the reason it is worth putting there.

/** Pins the e-BL and returns its CID, plus the gateway's read-back check. */
export const pinEblDocument = ({ fileName, contentBase64, containerRef }) =>
  request("/ipfs/pin", { method: "POST", body: { fileName, contentBase64, containerRef } });

/**
 * Pins the bill of lading, the commercial invoice and the packing list, plus a
 * manifest stating the quantity and naming all three.
 *
 * The manifest's CID is what goes on chain. `documentCid` is written once in
 * _createEscrow and has no setter, so one address has to stand for the whole
 * set — and the manifest is what makes that possible without giving up the
 * property that matters: change any figure on any document and the CID changes.
 *
 * The gateway builds the manifest from the bytes it pinned. This sends files
 * and a declared quantity, never a manifest.
 */
export const pinManifest = ({ containerRef, commodity, quantity, documents }) =>
  request("/ipfs/manifest", { method: "POST", body: { containerRef, commodity, quantity, documents } });

/** The units and document slots the gateway accepts, so the form need not guess. */
export const getManifestSchema = ({ signal } = {}) => request("/ipfs/manifest/schema", { signal });

// --- customs documents for milestone 3 ---------------------------------------
//
// PEB is issued at export and PIB at import, so neither exists when the escrow
// is created. They are attached afterwards, and the CID of the manifest naming
// them becomes milestone 3's proof CID on chain.

export const uploadCustomsDocuments = (escrowId, { containerRef, documents }) =>
  request(`/customs/${escrowId}`, { method: "POST", body: { containerRef, documents } });

export const getCustomsDocuments = (escrowId, { containerRef, signal } = {}) =>
  request(
    `/customs/${escrowId}${containerRef ? `?containerRef=${encodeURIComponent(containerRef)}` : ""}`,
    { signal }
  );

/** The verdict on a CID: does it resolve, do the bytes hash back to it, is it this e-BL. */
export const verifyEblCid = (cid, { containerRef, signal } = {}) =>
  request(`/ipfs/verify/${encodeURIComponent(cid)}${containerRef ? `?containerRef=${encodeURIComponent(containerRef)}` : ""}`, { signal });

export const getIpfsStatus = ({ signal } = {}) => request("/ipfs/status", { signal });

/**
 * Where to open the document itself.
 *
 * Through the gateway rather than a public IPFS gateway: the bytes are the
 * same either way — that is what a CID guarantees — but this one is known to
 * be reachable and to send the right content type.
 */
export const eblDocumentUrl = (cid) =>
  cid && apiConfigured ? `${API_BASE}/ipfs/document/${encodeURIComponent(cid)}` : null;

// --- Demo IDRT -------------------------------------------------------------
export const claimDemoBalance = (smartAccountAddress, role = "importer") =>
  request("/demo-balance/claim", { method: "POST", body: { smartAccountAddress, role } });

export const getDemoBalance = (smartAccountAddress, { signal } = {}) =>
  request(`/demo-balance/${smartAccountAddress}`, { signal });

export const getHealth = ({ signal } = {}) => request("/health", { signal });
