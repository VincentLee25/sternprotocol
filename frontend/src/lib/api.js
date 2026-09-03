const API_BASE = import.meta.env.VITE_ORACLE_API || "http://localhost:4000";

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Oracle gateway request failed");
  }

  return payload;
}

function toOverrideQuery(overrides = {}) {
  const params = new URLSearchParams();

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (typeof value === "object") {
      Object.entries(value).forEach(([subKey, subValue]) => {
        if (subValue === undefined || subValue === null) return;
        params.append(`${key}[${subKey}]`, subValue);
      });
    } else {
      params.append(key, value);
    }
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getHealth() {
  return request("/health");
}

export function getMockStatus(contractId, overrides) {
  return request(`/mock-status/${contractId}${toOverrideQuery(overrides)}`);
}

// submitOracle() is deliberately absent. POST /submit-oracle/:id makes the
// gateway sign a milestone proof with a verifier key, and it is gated by
// INTERNAL_API_KEY so that a browser cannot reach it — a key shipped to the
// frontend would let anyone forge a proof from DevTools. Milestones are signed
// by the verifier institutions: scripts/drive-demo.js, or the gateway itself.

// openDispute() used to POST /open-dispute/:id. The gateway has no such route
// and answers 404 — nothing called it, but it was there to be picked up.
// A user's dispute goes through disputeFlow.js: the gateway prepares the
// calldata and the user's own Smart Account signs it.
//
// resolveDispute() is gone for a different reason: POST /resolve-dispute/:id is
// behind INTERNAL_API_KEY, and this client sends no key header, so it could only
// return 401. Resolution is the arbiter's, from the ops console.
