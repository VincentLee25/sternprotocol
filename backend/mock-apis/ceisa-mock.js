// Customs clearance, as CEISA would report it.
//
// The PEB number stays synthetic: it is a customs registration number issued
// by Bea Cukai, not something a bill of lading carries, so there is nothing in
// the document to derive it from. What does come from the document is the
// route, because a clearance record for Belawan reads as nonsense next to a
// bill of lading for Tanjung Priok.
function getCeisaClearance(contractId, overrides = {}, document = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "customs" || fault === "ceisa";

  return {
    PEB_number: overrides.PEB_number || `PEB-2026-${String(numericId).padStart(6, "0")}`,
    customs_status: overrides.customs_status || (forcedFault ? "rejected" : "approved"),
    containerRef: overrides.containerRef || document.containerRef || null,
    port_of_loading: overrides.port_of_loading || document.portOfLoading || null,
    port_of_discharge: overrides.port_of_discharge || document.portOfDischarge || null,
    bill_of_lading_no: overrides.bill_of_lading_no || document.billOfLadingNumber || null,
    clearance_date: overrides.clearance_date || new Date(Date.UTC(2026, 4, 28)).toISOString(),
    ...(forcedFault ? { rejection_reason: "Simulated customs rejection" } : {}),
    source: document.containerRef ? "bill_of_lading" : "synthetic",
    simulatedFault: forcedFault
  };
}
module.exports = { getCeisaClearance };
