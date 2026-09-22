// Verified Gross Mass, as a terminal would report it at the gate.
//
// The expected figure is read off the bill of lading the escrow was created
// against, not invented from the escrow id. That matters for more than tidiness:
// the evidence panel shows this feed next to the document's own fields, and a
// VGM of 24020 kg beside a bill of lading saying 20 450,00 kg is a
// contradiction on one screen. Every feed here is supposed to be about the
// shipment in that document.
//
// `document` is what ipfsService read out of the PDF. When it is absent — no
// pinning service configured, or a document whose weight could not be parsed —
// this falls back to the old id-derived numbers so nothing breaks.
function getVgmData(contractId, overrides = {}, document = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;

  // The VGM, not the gross weight: it includes the container's tare and is the
  // figure a terminal actually verifies. The bill of lading carries both.
  const fromDocument = document.verifiedGrossMassKg ?? document.grossWeightKg ?? null;
  const expected = fromDocument ?? 24000 + numericId;

  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedMismatch = fault === "quality" || fault === "vgm";
  // A simulated mismatch is 500 kg over, which is large enough to be a real
  // discrepancy at a gate and small enough to look like a plausible one.
  const actual = overrides.vgm_kg ?? (forcedMismatch ? expected + 500 : expected);

  return {
    containerRef:
      overrides.containerRef || document.containerRef || `STERN-${String(numericId).padStart(4, "0")}`,
    vgm_kg: actual,
    expected_vgm_kg: expected,
    vgm_match: overrides.vgm_match ?? actual === expected,
    gate_in_status: overrides.gate_in_status || (forcedMismatch ? "exception" : "confirmed"),
    port: overrides.port || document.portOfLoading || "Tanjung Priok",
    // Says whether the expected figure came from the document or from the
    // fallback, so nothing downstream has to guess how much this feed knows.
    source: fromDocument != null ? "bill_of_lading" : "synthetic",
    simulatedFault: forcedMismatch
  };
}
module.exports = { getVgmData };
