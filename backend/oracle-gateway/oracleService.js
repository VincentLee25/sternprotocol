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
function evidenceItem({ oracle, source, field, expected, actual, passed, sourceData, fault, subject, basis }) {
  return {
    oracle, source, field, expected, actual, passed,
    // What this reading is ABOUT, in the document's own terms. "expected
    // departed, actual in_port" is a fact about a variable; it says nothing
    // about which vessel, which container or which voyage, so a reader cannot
    // tell whether the reading even concerns this shipment. That sentence is
    // the difference between a debug line and evidence.
    subject: subject || null,
    // Where the expected value came from: the bill of lading, or a fallback
    // for a deployment with no document to read. Worth stating rather than
    // leaving a reader to assume the stronger of the two.
    basis: basis || null,
    discrepancy: !passed,
    simulated: fault !== "none",
    checkedAt: new Date().toISOString(),
    sourceData
  };
}

/** "19.200 kg" — grouped, so a five-digit weight is readable at a glance. */
function kg(value) {
  return value == null ? null : `${Number(value).toLocaleString("id-ID")} kg`;
}

/** Joins the parts of a subject line, dropping whatever the document lacked. */
function subjectLine(parts) {
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
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
      containerRef: escrow?.containerRef || null,
      commodity: escrow?.commodity || null
    };
    if (value.documentCid) escrowDocuments.set(key, value);
    return value;
  } catch {
    // No chain, or no such escrow. The e-BL check reports itself unavailable
    // rather than failing the whole evidence read — the other four sources are
    // still worth serving.
    return { documentCid: null, containerRef: null, commodity: null };
  }
}

/**
 * What the four data feeds should be talking about.
 *
 * Before this, each feed invented its own facts from the escrow id: container
 * STERN-0020, vessel IMO9300020, port Tanjung Priok, expected VGM 24020 kg.
 * The evidence panel then showed those beside the bill of lading's own fields,
 * and the two described different shipments on the same screen. A reader
 * notices that long before they get to any of the cryptography.
 *
 * The container reference and commodity always come from the contract: those
 * are what the escrow is, and they are on chain whether a document verified or
 * not. The rest is taken from the document only when the document actually
 * passed — a bill of lading for somebody else's shipment must not get to
 * decide what this shipment's vessel and ports are.
 */
function documentContext(ebl, escrow, customs = null) {
  const trusted = ebl?.valid === true ? ebl.fields || {} : {};
  return {
    containerRef: escrow.containerRef || (trusted.containerNumbers || [])[0] || null,
    commodity: escrow.commodity || null,
    vessel: trusted.vessel || null,
    voyage: trusted.voyage || null,
    portOfLoading: trusted.portOfLoading || null,
    portOfDischarge: trusted.portOfDischarge || null,
    billOfLadingNumber: trusted.billOfLadingNumber || null,
    grossWeightKg: trusted.grossWeightKg ?? null,
    verifiedGrossMassKg: trusted.verifiedGrossMassKg ?? null,
    // The quantity the escrow was created against, when it was created with a
    // manifest. Null for every escrow written before manifests existed, and
    // the screen says "not stated" rather than inventing one.
    quantity: trusted.quantity || null,
    invoice: trusted.invoice || null,
    packing: trusted.packing || null,
    // The customs documents, for the CEISA feed to read the real PEB and PIB
    // out of. Passed whole rather than flattened, because the feed has to know
    // whether they verified before it quotes anything off them.
    customs
  };
}

/**
 * The customs check for milestone 3.
 *
 * PEB, PIB and proof that import duty was paid are issued at two borders at two
 * different times, so they cannot be part of the document the escrow was
 * created against — `documentCid` is written once in _createEscrow and has no
 * setter. They are attached to the escrow afterwards and recorded by
 * manifestService; this reads that record and verifies it the same way the e-BL
 * is verified.
 *
 * `attached: false` is a first-class answer, not a failure. Every escrow
 * created before this existed has no customs documents, and refusing their
 * third milestone retroactively would be a false refusal about a shipment that
 * cleared perfectly well.
 */
async function checkCustoms(contractId, { containerRef } = {}) {
  let record = null;
  try {
    record = require("./manifestService").customsFor(contractId);
  } catch {
    // No store, or an unreadable one. Same answer as nothing attached.
    record = null;
  }

  if (!record) {
    return {
      attached: false,
      available: true,
      valid: null,
      cid: null,
      reason: "No customs documents are attached to this escrow.",
      missing: ["exportDeclaration", "importDeclaration", "dutyPayment"]
    };
  }

  try {
    const { verifyCustomsManifestCached } = require("./ipfsService");
    const verdict = await verifyCustomsManifestCached(record.cid, { containerRef: containerRef || null });
    return { attached: true, ...verdict };
  } catch (error) {
    // A check that could not run says nothing about the clearance, so it is
    // reported as unavailable — never as passing, and never as failing.
    return {
      attached: true,
      available: false,
      valid: false,
      cid: record.cid,
      reason: `The customs documents could not be checked: ${error.message}`,
      notes: [error.message]
    };
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

  // A pinning service is configured but the libraries backing the check could
  // not be loaded. That is a fault, not a mode: somebody intended real
  // verification and is not getting it. Falling back to the mock here would
  // return `valid: true` for a check that never ran, which is the exact
  // overstatement this path exists to remove — so it fails instead, loudly.
  if (status.provider && !status.librariesReady) {
    return {
      mode: "broken",
      configured: true,
      cid: overrideCid || null,
      valid: false,
      available: false,
      failedChecks: ["checkUnavailable"],
      checks: {},
      fields: null,
      notes: [status.dependencyError || "The e-BL verification libraries are unavailable."],
      reason: `The e-BL check cannot run on this gateway: ${status.dependencyError || "its libraries are unavailable."}`
    };
  }

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

  let result;
  try {
    result = await verifyDocumentCached(cid, {
      containerRef: escrow.containerRef,
      simulateFault
    });
  } catch (error) {
    // The e-BL check failing must not take the evidence read with it. The four
    // other sources are still worth serving, and a check that could not run is
    // reported as not passing — never as passing.
    return {
      mode: "ipfs",
      configured: true,
      cid: cid || null,
      valid: false,
      available: false,
      simulatedFault: Boolean(simulateFault),
      failedChecks: ["checkUnavailable"],
      checks: {},
      fields: null,
      notes: [error.message],
      reason: `The e-BL check could not run: ${error.message}`
    };
  }

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

  // The two document checks are read before the four feeds, because the feeds
  // are built from what they found. They are also the only sources here that
  // leave the process — real IPFS retrieval when a pinning service is
  // configured, the old prefix mock otherwise.
  //
  // In parallel with each other: nothing in the customs documents depends on
  // the e-BL's verdict, and running them one after the other would put a second
  // gateway race on the critical path of every evidence read and every verify.
  const escrow = await escrowDocument(contractId);
  const [ipfs, customs] = await Promise.all([
    checkEbl(contractId, {
      fault,
      overrideCid: flat.eblCid,
      overrides: (rawOverrides.ipfs && typeof rawOverrides.ipfs === "object") ? rawOverrides.ipfs : {}
    }),
    checkCustoms(contractId, { containerRef: escrow.containerRef })
  ]);
  const document = documentContext(ipfs, escrow, customs);

  const sources = {
    vgm: getVgmData(
      contractId,
      { ...sourceOptions, ...pick(["vgm_kg", "containerRef", "vgm_match", "gate_in_status", "port"], "vgm") },
      document
    ),
    ais: getAisStatus(
      contractId,
      { ...sourceOptions, ...pick(["vesselIMO", "vessel", "voyage", "departure_status", "timestamp"], "ais") },
      document
    ),
    ceisa: getCeisaClearance(
      contractId,
      { ...sourceOptions, ...pick(["PEB_number", "customs_status", "clearance_date"], "ceisa") },
      document
    ),
    ipfs,
    inspection: getInspectionReport(
      contractId,
      { ...sourceOptions, ...pick(["certificate_number", "surveyor", "inspection_status", "inspected_at", "location"], "inspection") },
      document
    )
  };
  const verification = {
    vgmMatch: sources.vgm.vgm_match === true && sources.vgm.gate_in_status === "confirmed",
    aisDeparted: sources.ais.departure_status === "departed",
    ceisaApproved: sources.ceisa.customs_status === "approved",
    eblCidValid: sources.ipfs.valid === true,
    // Whether that verdict is one we are entitled to act on.
    //
    // "The document is wrong" and "we could not look at the document" both
    // arrive as eblCidValid === false, and they call for opposite responses:
    // the first must stop a milestone, the second must not, because a public
    // IPFS gateway being slow for thirty seconds is not evidence about a
    // shipment and should never hold up a settlement that is otherwise due.
    //
    // The placeholder mock counts as checkable: it is a deliberate mode, and a
    // deployment running in it should behave exactly as it did before any of
    // this existed.
    eblCheckable: sources.ipfs.mode === "mock" || sources.ipfs.available !== false,
    inspectionPassed: sources.inspection.inspection_status === "passed",
    // The customs documents, on the same two-flag pattern as the e-BL and for
    // the same reason. `customsDocsValid` is null when nothing is attached —
    // not false — because "no PEB was uploaded" is not a finding about a
    // clearance, and `customsDocsCheckable` is what stops it blocking.
    customsDocsValid: customs.attached ? customs.valid === true : null,
    customsDocsCheckable: customs.attached === true && customs.available !== false,
    customsDocsAttached: customs.attached === true
  };
  // Each reading now states the shipment it is about, taken from the bill of
  // lading, so a discrepancy reads as a fact about this trade rather than a
  // variable that changed value.
  const fromDoc = (flag) => (flag === "bill_of_lading" ? "bill of lading" : "fallback data");

  const evidence = [
    evidenceItem({
      oracle: "quality_auditor", source: "VGM", field: "vgm_match",
      // The weights, not a bare boolean. "expected true, actual false" hides
      // the only numbers anyone would want to see.
      expected: kg(sources.vgm.expected_vgm_kg),
      actual: kg(sources.vgm.vgm_kg),
      passed: verification.vgmMatch, sourceData: sources.vgm, fault,
      subject: subjectLine([
        sources.vgm.containerRef && `Container ${sources.vgm.containerRef}`,
        sources.vgm.port && `gate-in at ${sources.vgm.port}`
      ]),
      basis: fromDoc(sources.vgm.source)
    }),
    evidenceItem({
      oracle: "quality_auditor", source: "inspection", field: "inspection_status",
      expected: "passed", actual: sources.inspection.inspection_status,
      passed: verification.inspectionPassed, sourceData: sources.inspection, fault,
      subject: subjectLine([
        sources.inspection.containerRef && `Container ${sources.inspection.containerRef}`,
        sources.inspection.commodity,
        sources.inspection.location && `inspected at ${sources.inspection.location}`
      ]),
      basis: fromDoc(sources.inspection.source)
    }),
    evidenceItem({
      oracle: "logistics", source: "AIS", field: "departure_status",
      expected: "departed", actual: sources.ais.departure_status,
      passed: verification.aisDeparted, sourceData: sources.ais, fault,
      subject: subjectLine([
        sources.ais.vessel || sources.ais.vesselIMO,
        sources.ais.voyage && `voyage ${sources.ais.voyage}`,
        sources.ais.port_of_loading && sources.ais.port_of_discharge
          ? `${sources.ais.port_of_loading} → ${sources.ais.port_of_discharge}`
          : null
      ]),
      basis: fromDoc(sources.ais.source)
    }),
    evidenceItem({
      oracle: "customs", source: "CEISA", field: "customs_status",
      expected: "approved", actual: sources.ceisa.customs_status,
      passed: verification.ceisaApproved, sourceData: sources.ceisa, fault,
      subject: subjectLine([
        sources.ceisa.bill_of_lading_no && `B/L ${sources.ceisa.bill_of_lading_no}`,
        sources.ceisa.containerRef && `container ${sources.ceisa.containerRef}`,
        `PEB ${sources.ceisa.PEB_number}`
      ]),
      basis: fromDoc(sources.ceisa.source)
    }),
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
      fault,
      subject: subjectLine([
        sources.ipfs.cid && `CID ${sources.ipfs.cid}`,
        sources.ipfs.containerRefExpected && `expected container ${sources.ipfs.containerRefExpected}`
      ]),
      basis: sources.ipfs.mode === "ipfs" ? "retrieved from IPFS" : "placeholder check"
    }),
    // Only when documents were actually attached. A row for documents nobody
    // uploaded would be a permanent failing line on every escrow created before
    // this existed, and it would land in `discrepancies` — which is the list
    // the gateway refuses to submit on. "Not attached" is reported as its own
    // state in `customs` below instead.
    ...(customs.attached
      ? [
          evidenceItem({
            oracle: "customs",
            source: "customs_documents",
            field: "customs_documents_verified",
            expected: true,
            actual: verification.customsDocsValid === true
              ? true
              : (customs.failedChecks?.length ? customs.failedChecks.join(", ") : false),
            passed: verification.customsDocsValid === true,
            sourceData: customs,
            fault,
            subject: subjectLine([
              customs.fields?.pebNumber && `PEB ${customs.fields.pebNumber}`,
              customs.fields?.pibNumber && `PIB ${customs.fields.pibNumber}`,
              customs.fields?.ntpn && `NTPN ${customs.fields.ntpn}`
            ]),
            basis: "retrieved from IPFS"
          })
        ]
      : [])
  ];
  const discrepancies = evidence.filter((item) => !item.passed);
  // Named explicitly rather than `Object.values(verification).every(Boolean)`.
  // That form treated every key as a gate, so the moment a key was added whose
  // false or null means "not applicable" — customs documents that were never
  // attached, a check that could not run — every escrow in the system would
  // have reported as unverified. The gates are these five and nothing else.
  const allVerified = [
    verification.vgmMatch,
    verification.inspectionPassed,
    verification.aisDeparted,
    verification.ceisaApproved,
    verification.eblCidValid
  ].every(Boolean);
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
    // The customs documents as their own block, because milestone 3 is a claim
    // about legality at two borders and "not attached" is the state most
    // escrows are in. The screen needs to say which of the three is missing,
    // which a boolean in `verification` cannot.
    customs,
    oracleAction: allVerified ? "submit_milestone" : "do_not_submit",
    note: allVerified
      ? "All configured automated checks passed."
      : "Source discrepancy detected. The gateway will not submit this failed automated result on-chain."
  };
}
module.exports = {
  getMockStatus, normalizeFault, setSimulation, clearSimulation, getSimulation, checkEbl, checkCustoms
};
