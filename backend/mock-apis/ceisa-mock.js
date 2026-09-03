function getCeisaClearance(contractId, overrides = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "customs" || fault === "ceisa";

  return {
    PEB_number: overrides.PEB_number || `PEB-2026-${String(numericId).padStart(6, "0")}`,
    customs_status: overrides.customs_status || (forcedFault ? "rejected" : "approved"),
    clearance_date: overrides.clearance_date || new Date(Date.UTC(2026, 4, 28)).toISOString(),
    simulatedFault: forcedFault
  };
}
module.exports = { getCeisaClearance };
