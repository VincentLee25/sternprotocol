// Pre-shipment inspection, as a surveyor would report it.
//
// Inspection happens at the port the goods are loaded from, so the location
// comes off the bill of lading rather than being fixed at Tanjung Priok for
// every escrow. The certificate number stays synthetic: a surveyor issues it,
// and the bill of lading does not carry it.
function getInspectionReport(contractId, overrides = {}, document = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "quality" || fault === "inspection";

  return {
    certificate_number: overrides.certificate_number || `PSI-2026-${String(numericId).padStart(6, "0")}`,
    surveyor: overrides.surveyor || "Sucofindo",
    inspection_status: overrides.inspection_status || (forcedFault ? "failed" : "passed"),
    containerRef: overrides.containerRef || document.containerRef || null,
    commodity: overrides.commodity || document.commodity || null,
    inspected_at: overrides.inspected_at || new Date(Date.UTC(2026, 4, 27, 14, numericId)).toISOString(),
    location: overrides.location || document.portOfLoading || "Tanjung Priok",
    ...(forcedFault ? { failure_reason: "Simulated inspection discrepancy" } : {}),
    source: document.containerRef ? "bill_of_lading" : "synthetic",
    simulatedFault: forcedFault
  };
}
module.exports = { getInspectionReport };
