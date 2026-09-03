const { getVgmData } = require("../mock-apis/vgm-mock");
const { getAisStatus } = require("../mock-apis/ais-mock");
const { getCeisaClearance } = require("../mock-apis/ceisa-mock");
const { validateCid } = require("../mock-apis/ipfs-mock");
const { getInspectionReport } = require("../mock-apis/inspection-mock");

const SIMULATION_FAULTS = {
  none: "none", quality: "quality", quality_auditor: "quality", vgm: "vgm", inspection: "inspection",
  logistics: "logistics", ais: "ais", customs: "customs", ceisa: "customs", ipfs: "ipfs"
};
function normalizeFault(fault) {
  const key = String(fault || "none").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return SIMULATION_FAULTS[key] || "none";
}
function evidenceItem({ oracle, source, field, expected, actual, passed, sourceData, fault }) {
  return { oracle, source, field, expected, actual, passed, discrepancy: !passed, simulated: fault !== "none", checkedAt: new Date().toISOString(), sourceData };
}
const simulationOverrides = new Map();

function getSimulation(contractId) {
  return simulationOverrides.get(String(contractId)) || { fault: "none", overrides: {} };
}

function setSimulation(contractId, options = {}) {
  const key = String(contractId);
  const fault = normalizeFault(options.fault || options.simulateFault);
  const overrides = options.overrides && typeof options.overrides === "object" ? options.overrides : {};
  const simulation = { fault, overrides };
  simulationOverrides.set(key, simulation);
  return simulation;
}

function clearSimulation(contractId) {
  simulationOverrides.delete(String(contractId));
}

function getMockStatus(contractId, options = {}) {
  const saved = getSimulation(contractId);
  const hasExplicitSimulation = options.fault !== undefined || options.simulateFault !== undefined || options.overrides !== undefined;
  const fault = hasExplicitSimulation
    ? normalizeFault(options.fault || options.simulateFault)
    : saved.fault;
  const savedOverrides = saved.overrides && typeof saved.overrides === "object" ? saved.overrides : {};
  const rawOverrides = hasExplicitSimulation
    ? (options.overrides && typeof options.overrides === "object" ? options.overrides : {})
    : savedOverrides;
  const sourceOptions = { fault };

  // Accept both structured overrides ({ overrides: { ais: {...} } })
  // and flat overrides ({ overrides: { departure_status: "in_port" } }).
  // Structured source overrides are merged into the adapter options; flat
  // fields are applied on top so the HTTP contract stays backwards-compatible.
  const flat = rawOverrides;
  const pick = (keys, nestedKey) => {
    const result = {
      ...(rawOverrides[nestedKey] && typeof rawOverrides[nestedKey] === "object"
        ? rawOverrides[nestedKey]
        : {})
    };
    for (const key of keys) {
      if (flat[key] !== undefined) result[key] = flat[key];
    }
    return result;
  };

  const sources = {
    vgm: getVgmData(contractId, {
      ...sourceOptions,
      ...pick(["vgm_kg", "containerRef", "vgm_match", "gate_in_status"], "vgm")
    }),
    ais: getAisStatus(contractId, {
      ...sourceOptions,
      ...pick(["vesselIMO", "departure_status", "timestamp"], "ais")
    }),
    ceisa: getCeisaClearance(contractId, {
      ...sourceOptions,
      ...pick(["PEB_number", "customs_status", "clearance_date"], "ceisa")
    }),
    ipfs: validateCid(flat.eblCid || "bafybeisternelectronicbillofla", {
      ...sourceOptions,
      ...((rawOverrides.ipfs && typeof rawOverrides.ipfs === "object") ? rawOverrides.ipfs : {})
    }),
    inspection: getInspectionReport(contractId, {
      ...sourceOptions,
      ...pick(["certificate_number", "surveyor", "inspection_status", "inspected_at", "location"], "inspection")
    })
  };
  const verification = {
    vgmMatch: sources.vgm.vgm_match === true && sources.vgm.gate_in_status === "confirmed",
    aisDeparted: sources.ais.departure_status === "departed",
    ceisaApproved: sources.ceisa.customs_status === "approved",
    eblCidValid: sources.ipfs.valid === true,
    inspectionPassed: sources.inspection.inspection_status === "passed"
  };
  const evidence = [
    evidenceItem({ oracle: "quality_auditor", source: "VGM", field: "vgm_match", expected: true, actual: verification.vgmMatch, passed: verification.vgmMatch, sourceData: sources.vgm, fault }),
    evidenceItem({ oracle: "quality_auditor", source: "inspection", field: "inspection_status", expected: "passed", actual: sources.inspection.inspection_status, passed: verification.inspectionPassed, sourceData: sources.inspection, fault }),
    evidenceItem({ oracle: "logistics", source: "AIS", field: "departure_status", expected: "departed", actual: sources.ais.departure_status, passed: verification.aisDeparted, sourceData: sources.ais, fault }),
    evidenceItem({ oracle: "customs", source: "CEISA", field: "customs_status", expected: "approved", actual: sources.ceisa.customs_status, passed: verification.ceisaApproved, sourceData: sources.ceisa, fault }),
    evidenceItem({ oracle: "quality_auditor", source: "IPFS", field: "cid_valid", expected: true, actual: verification.eblCidValid, passed: verification.eblCidValid, sourceData: sources.ipfs, fault })
  ];
  const discrepancies = evidence.filter((item) => !item.passed);
  const allVerified = Object.values(verification).every(Boolean);
  return {
    contractId: String(contractId),
    simulation: {
      enabled: fault !== "none",
      fault,
      availableFaults: Object.keys(SIMULATION_FAULTS),
      persistent: true,
      reset: fault === "none"
    },
    sources, verification, evidence, discrepancies, allVerified,
    oracleAction: allVerified ? "submit_milestone" : "do_not_submit",
    note: allVerified
      ? "All configured automated checks passed."
      : "Source discrepancy detected. The gateway will not submit this failed automated result on-chain."
  };
}
module.exports = { getMockStatus, normalizeFault, setSimulation, clearSimulation, getSimulation };
