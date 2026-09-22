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

// The escrow's document CID and container reference, as written on chain.
// Both are immutable once the escrow exists, so one successful read is final.
// contractService is required lazily: it pulls in a provider and signers, and
// this module is loaded by tooling that has no chain configured.
const escrowDocuments = new Map();

async function escrowDocument(contractId) {
  const key = String(contractId);
  if (escrowDocuments.has(key)) return escrowDocuments.get(key);
  try {
    const { getEscrow } = require("./contractService");
    const escrow = await getEscrow(key);
    const value = {
      documentCid: escrow?.documentCid || null,
      containerRef: escrow?.containerRef || null
    };
    if (value.documentCid) escrowDocuments.set(key, value);
    return value;
  } catch {
    // No chain, or no such escrow. The e-BL check reports itself unavailable
    // rather than failing the whole evidence read — the other four sources are
    // still worth serving.
    return { documentCid: null, containerRef: null };
  }
}

/**
 * The e-BL check.
 *
 * With a pinning service configured this is a real IPFS verification of the
 * document this escrow was created against: the CID is resolved, the bytes are
 * hashed back to it, and the PDF is read to confirm it is a bill of lading
 * naming this escrow's container (see ipfsService.js).
 *
 * With none configured it falls back to the old prefix mock, and labels itself
 * `mode: "mock"` so nothing downstream can mistake one for the other.
 */
async function checkEbl(contractId, { fault, overrideCid, overrides }) {
  const { ipfsStatus, verifyDocumentCached } = require("./ipfsService");
  const simulateFault = fault === "quality" || fault === "ipfs";
  const status = ipfsStatus();

  if (!status.configured) {
    const mock = validateCid(overrideCid || "bafybeisternelectronicbillofla", { fault, ...overrides });
    return {
      ...mock,
      mode: "mock",
      configured: false,
      note: "No IPFS pinning service is configured, so this is a placeholder check on the CID's shape, not a document verification. Set PINATA_JWT on the gateway to verify the real e-BL."
    };
  }

  const escrow = await escrowDocument(contractId);
  const cid = overrideCid || escrow.documentCid;
  const result = await verifyDocumentCached(cid, {
    containerRef: escrow.containerRef,
    simulateFault
  });

  return {
    ...result,
    mode: "ipfs",
    configured: true,
    provider: status.provider,
    containerRefExpected: escrow.containerRef,
    fileName: result.document?.title || null
  };
}

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

async function getMockStatus(contractId, options = {}) {
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
    // Real IPFS retrieval and document verification when a pinning service is
    // configured; the old prefix mock otherwise. Awaited below with the rest,
    // since it is the one source here that leaves the process.
    ipfs: await checkEbl(contractId, {
      fault,
      overrideCid: flat.eblCid,
      overrides: (rawOverrides.ipfs && typeof rawOverrides.ipfs === "object") ? rawOverrides.ipfs : {}
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
    // "cid_valid: false" told an operator nothing about what went wrong, and
    // with a real retrieval there are several distinguishable ways for it to
    // go wrong — unreachable, wrong content, not a PDF, wrong container. Name
    // the ones that failed.
    evidenceItem({
      oracle: "quality_auditor",
      source: "IPFS",
      field: "ebl_document_verified",
      expected: true,
      actual: verification.eblCidValid
        ? true
        : (sources.ipfs.failedChecks?.length ? sources.ipfs.failedChecks.join(", ") : false),
      passed: verification.eblCidValid,
      sourceData: sources.ipfs,
      fault
    })
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
module.exports = { getMockStatus, normalizeFault, setSimulation, clearSimulation, getSimulation, checkEbl };
