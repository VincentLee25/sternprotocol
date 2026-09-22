// Vessel tracking, as an AIS provider would report it.
//
// The vessel and voyage come from the bill of lading the escrow was created
// against. The panel prints this feed beside the document's own "Ocean Vessel"
// line, and tracking IMO9300020 next to a document naming MV SAMUDRA BIRU is a
// contradiction a reader will notice before any of the cryptography.
//
// The IMO number stays synthetic on purpose: a bill of lading does not carry
// one, so there is nothing in the document to derive it from. Inventing a name
// would be misleading; inventing an identifier the document never states is
// just filling a field a real AIS feed would have.
function getAisStatus(contractId, overrides = {}, document = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "logistics" || fault === "ais";

  return {
    vessel: overrides.vessel || document.vessel || null,
    voyage: overrides.voyage || document.voyage || null,
    vesselIMO: overrides.vesselIMO || `IMO${9300000 + numericId}`,
    departure_status: overrides.departure_status || (forcedFault ? "in_port" : "departed"),
    port_of_loading: overrides.port_of_loading || document.portOfLoading || null,
    port_of_discharge: overrides.port_of_discharge || document.portOfDischarge || null,
    timestamp: overrides.timestamp || new Date(Date.UTC(2026, 4, 28, 8, numericId)).toISOString(),
    source: document.vessel ? "bill_of_lading" : "synthetic",
    simulatedFault: forcedFault
  };
}
module.exports = { getAisStatus };
