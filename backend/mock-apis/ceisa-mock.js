// Customs clearance, as CEISA would report it.
//
// The PEB number used to be synthetic on the grounds that a bill of lading does
// not carry one — which was true, and the wrong document to look in. A PEB is
// its own document, issued by Bea Cukai, and `customs` now receives it: when
// the escrow's PEB, PIB and proof of payment have been attached (see
// manifestService.js), the registration numbers, the customs office and the
// duty actually paid are read off those PDFs and reported here.
//
// Without them the feed stays synthetic and says so. It does not invent a
// clearance it has no document for; it reports the same approved status it
// always did, labelled `source: "synthetic"`, and the milestone-3 card on the
// evidence panel says which of the three documents is missing.
//
// What still comes from the bill of lading is the route, because a clearance
// record for Belawan reads as nonsense next to a bill of lading for Tanjung
// Priok.
function getCeisaClearance(contractId, overrides = {}, document = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedFault = fault === "customs" || fault === "ceisa";

  const customs = document.customs || null;
  // Only documents that actually verified get to speak. A PEB that does not
  // resolve, or whose bytes do not hash back to its address, is not evidence
  // about a clearance — reading numbers off it would be worse than leaving the
  // feed synthetic, because those numbers would look sourced.
  const trusted = customs?.valid === true ? customs.fields || {} : {};

  // A clearance cannot be reported as approved on documents that failed. This
  // is the one case where the feed disagrees with its old self on purpose: the
  // documents are attached, they were checked, and the check did not pass.
  const documentsFailed = Boolean(customs && customs.attached && customs.valid === false);

  const status = overrides.customs_status
    || (forcedFault || documentsFailed ? "rejected" : "approved");

  return {
    PEB_number:
      overrides.PEB_number || trusted.pebNumber || `PEB-2026-${String(numericId).padStart(6, "0")}`,
    PIB_number: overrides.PIB_number || trusted.pibNumber || null,
    customs_status: status,
    customs_office: overrides.customs_office || trusted.customsOffice || null,
    // NTPN is the state receipt number: its presence is the difference between
    // duty owed and duty paid.
    NTPN: trusted.ntpn || null,
    import_duty_idr: trusted.importDutyIdr ?? null,
    vat_idr: trusted.vatIdr ?? null,
    income_tax_idr: trusted.incomeTaxIdr ?? null,
    containerRef: overrides.containerRef || document.containerRef || null,
    port_of_loading: overrides.port_of_loading || document.portOfLoading || null,
    port_of_discharge: overrides.port_of_discharge || document.portOfDischarge || null,
    bill_of_lading_no: overrides.bill_of_lading_no || document.billOfLadingNumber || null,
    clearance_date:
      overrides.clearance_date
      || trusted.paymentDate
      || trusted.pibDate
      || trusted.pebDate
      || new Date(Date.UTC(2026, 4, 28)).toISOString(),
    documents_attached: Boolean(customs?.attached),
    ...(forcedFault ? { rejection_reason: "Simulated customs rejection" } : {}),
    ...(documentsFailed && !forcedFault
      ? { rejection_reason: customs.reason || "The attached customs documents failed verification." }
      : {}),
    // Three states, not two: read off the real declarations, derived from the
    // bill of lading's route only, or invented from the escrow id.
    source: customs?.valid === true
      ? "customs_documents"
      : document.containerRef ? "bill_of_lading" : "synthetic",
    simulatedFault: forcedFault
  };
}
module.exports = { getCeisaClearance };
