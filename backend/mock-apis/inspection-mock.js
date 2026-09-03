function getInspectionReport(contractId, overrides = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "quality" || fault === "inspection";

  return {
    certificate_number: overrides.certificate_number || `PSI-2026-${String(numericId).padStart(6, "0")}`,
    surveyor: overrides.surveyor || "Sucofindo",
    inspection_status: overrides.inspection_status || (forcedFault ? "failed" : "passed"),
    inspected_at: overrides.inspected_at || new Date(Date.UTC(2026, 4, 27, 14, numericId)).toISOString(),
    location: overrides.location || "Tanjung Priok",
    ...(forcedFault ? { failure_reason: "Simulated inspection discrepancy" } : {}),
    simulatedFault: forcedFault
  };
}
module.exports = { getInspectionReport };
