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

async function request(path, { method = "GET", body, signal } = {}) {
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
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (cause) {
    // fetch only rejects on transport failure. A gateway that is not running,
    // or one that has not allow-listed this origin, both land here — and the
    // bare "Failed to fetch" gives no clue which.
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

// Demo-only, in-memory, and explicitly NOT a bad on-chain proof: it rewrites the
// current mock source so the gateway can detect that an already-committed proof
// now disagrees with it. Pass "none" to reset.
export const simulateFault = (id, fault) =>
  request(`/oracle/simulate/${id}`, { method: "POST", body: { fault } });

// --- Demo IDRT -------------------------------------------------------------
export const claimDemoBalance = (smartAccountAddress, role = "importer") =>
  request("/demo-balance/claim", { method: "POST", body: { smartAccountAddress, role } });

export const getDemoBalance = (smartAccountAddress, { signal } = {}) =>
  request(`/demo-balance/${smartAccountAddress}`, { signal });

export const getHealth = ({ signal } = {}) => request("/health", { signal });
