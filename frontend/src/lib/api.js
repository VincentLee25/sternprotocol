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

export function submitOracle(contractId, body) {
  return request(`/submit-oracle/${contractId}`, {
    method: "POST",
    body: JSON.stringify(body || {})
  });
}

export function openDispute(contractId) {
  return request(`/open-dispute/${contractId}`, { method: "POST" });
}

export function resolveDispute(contractId, releaseToExporter) {
  return request(`/resolve-dispute/${contractId}`, {
    method: "POST",
    body: JSON.stringify({ releaseToExporter })
  });
}
