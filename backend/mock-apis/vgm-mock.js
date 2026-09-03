function getVgmData(contractId, overrides = {}) {
  const parsedId = Number(contractId || 0);
  const numericId = Number.isFinite(parsedId) ? parsedId : 0;
  const expected = 24000 + numericId;
  const fault = String(overrides.fault || "none").toLowerCase();
  const forcedMismatch = fault === "quality" || fault === "vgm";
  const actual = overrides.vgm_kg ?? (forcedMismatch ? expected + 500 : expected);

  return {
    containerRef: overrides.containerRef || `STERN-${String(numericId).padStart(4, "0")}`,
    vgm_kg: actual,
    expected_vgm_kg: expected,
    vgm_match: overrides.vgm_match ?? actual === expected,
    gate_in_status: overrides.gate_in_status || (forcedMismatch ? "exception" : "confirmed"),
    port: "Tanjung Priok",
    simulatedFault: forcedMismatch
  };
}
module.exports = { getVgmData };
