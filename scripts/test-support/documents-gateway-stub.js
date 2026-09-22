// A gateway with the document routes and nothing else, for browser-testing the
// manifest and the customs upload without an RPC or a deployed contract.
//
// It mounts the REAL ipfsService and manifestService against a local stand-in
// for an IPFS node, so what the browser talks to is the shipped pin-and-verify
// path — including its refusals — rather than a second implementation that
// could agree with the UI while the gateway disagrees.
//
// The chain-backed routes are canned, because there is no chain here. What is
// canned is only the shape the panel reads; the customs verdict inside it comes
// from actually retrieving the PEB and PIB by CID.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4112);
const IPFS_PORT = PORT + 1;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stern-docs-"));
process.env.CUSTOMS_STORE_FILE = path.join(tmp, "customs.json");
process.env.DIRECTORY_STORE_FILE = path.join(tmp, "directory.json");
// See test-ebl-ipfs.js: "" rather than delete, so dotenv does not put a real
// key back and send these pins to the actual Pinata.
process.env.PINATA_JWT = "";
process.env.IPFS_API_AUTH = "";
process.env.IPFS_API_URL = `http://127.0.0.1:${IPFS_PORT}`;
process.env.IPFS_GATEWAYS = `http://127.0.0.1:${IPFS_PORT}`;

const ipfsStub = spawn(
  process.execPath,
  [path.resolve(__dirname, "ipfs-node-stub.js")],
  { stdio: "ignore", env: { ...process.env, STUB_PORT: String(IPFS_PORT) } }
);
process.on("exit", () => ipfsStub.kill());

const express = require("express");
const cors = require("cors");
const ipfs = require("../../backend/oracle-gateway/ipfsService");
const manifests = require("../../backend/oracle-gateway/manifestService");

const CONTAINER_REF = "TGHU-2026-001";
const ESCROW_ID = "77";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, stub: true, ipfs: ipfs.ipfsStatus() }));
app.get("/ipfs/status", (_req, res) => res.json(ipfs.ipfsStatus()));

app.get("/ipfs/manifest/schema", (_req, res) => {
  res.json({
    units: Object.entries(manifests.UNITS).map(([value, unit]) => ({ value, label: unit.label })),
    escrowDocuments: manifests.ESCROW_SLOTS,
    customsDocuments: manifests.CUSTOMS_SLOTS
  });
});

app.post("/ipfs/manifest", async (req, res, next) => {
  try {
    const body = req.body || {};
    const pinned = await manifests.pinEscrowManifest({
      containerRef: body.containerRef,
      commodity: body.commodity,
      quantity: body.quantity,
      documents: body.documents
    });
    let verification = null;
    try {
      verification = await ipfs.verifyDocumentCached(pinned.cid, { containerRef: body.containerRef || null });
    } catch (error) {
      verification = { available: false, valid: false, reason: error.message };
    }
    res.json({ ok: true, ...pinned, verification });
  } catch (error) { next(error); }
});

app.get("/ipfs/verify/:cid", async (req, res, next) => {
  try {
    res.json(await ipfs.verifyDocumentCached(req.params.cid, { containerRef: req.query.containerRef || null }));
  } catch (error) { next(error); }
});

app.get("/ipfs/document/:cid", async (req, res, next) => {
  try {
    const { bytes } = await ipfs.fetchByCid(req.params.cid);
    const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    const isJson = !isPdf && bytes.subarray(0, 64).toString("utf8").trimStart().startsWith("{");
    res.setHeader("content-type", isPdf ? "application/pdf" : isJson ? "application/json" : "application/octet-stream");
    res.send(bytes);
  } catch (error) { next(error); }
});

app.post("/customs/:escrowId", async (req, res, next) => {
  try {
    const body = req.body || {};
    const record = await manifests.pinCustomsManifest(req.params.escrowId, {
      containerRef: body.containerRef,
      documents: body.documents
    });
    const verification = await ipfs
      .verifyCustomsManifestCached(record.cid, { containerRef: body.containerRef || null })
      .catch((error) => ({ available: false, valid: false, reason: error.message }));
    res.json({ ok: true, ...record, verification });
  } catch (error) { next(error); }
});

app.get("/customs/:escrowId", async (req, res, next) => {
  try {
    const record = manifests.customsFor(req.params.escrowId);
    if (!record) return res.json({ attached: false, escrowId: String(req.params.escrowId) });
    const verification = await ipfs
      .verifyCustomsManifestCached(record.cid, { containerRef: CONTAINER_REF })
      .catch((error) => ({ available: false, valid: false, reason: error.message }));
    res.json({ attached: true, ...record, verification });
  } catch (error) { next(error); }
});

// Canned, except the customs block, which is the real verdict on whatever was
// uploaded. One milestone is committed so the panel renders its full shape.
app.get("/oracle/evidence/:contractId", async (req, res, next) => {
  try {
    const record = manifests.customsFor(req.params.contractId);
    let customs = { attached: false, available: true, valid: null, cid: null, reason: "No customs documents are attached to this escrow.", missing: ["exportDeclaration", "importDeclaration", "dutyPayment"] };
    if (record) {
      const verdict = await ipfs
        .verifyCustomsManifestCached(record.cid, { containerRef: CONTAINER_REF })
        .catch((error) => ({ available: false, valid: false, cid: record.cid, reason: error.message }));
      customs = { attached: true, ...verdict };
    }

    const now = Math.floor(Date.now() / 1000);
    res.json({
      contractId: String(req.params.contractId),
      simulation: { enabled: false, fault: "none", availableFaults: ["none", "vgm", "ais", "customs", "inspection", "ipfs"] },
      clock: { chainNowUnix: now, serverNowUnix: now },
      sources: {
        vgm: { vgm_match: true, gate_in_status: "confirmed", containerRef: CONTAINER_REF, source: "bill_of_lading" },
        ais: { departure_status: "departed", vessel: "MV SAMUDRA BIRU", source: "bill_of_lading" },
        ceisa: {
          customs_status: customs.valid === false ? "rejected" : "approved",
          PEB_number: customs.fields?.pebNumber || "PEB-2026-000077",
          PIB_number: customs.fields?.pibNumber || null,
          NTPN: customs.fields?.ntpn || null,
          documents_attached: Boolean(record),
          source: record && customs.valid ? "customs_documents" : "bill_of_lading"
        },
        inspection: { inspection_status: "passed", source: "bill_of_lading" },
        // No pinning-service mode here: the e-BL card is covered by its own
        // suite, and this stub exists for the customs half.
        ipfs: { mode: "mock", valid: true, note: "Stub gateway: the e-BL check is not exercised here.", containerRefExpected: CONTAINER_REF }
      },
      verification: {
        vgmMatch: true,
        inspectionPassed: true,
        aisDeparted: true,
        ceisaApproved: customs.valid !== false,
        eblCidValid: true,
        eblCheckable: true,
        customsDocsValid: customs.attached ? customs.valid === true : null,
        customsDocsCheckable: customs.attached === true && customs.available !== false,
        customsDocsAttached: customs.attached === true
      },
      customs,
      evidence: [],
      discrepancies: [],
      committedDiscrepancies: [],
      allVerified: true,
      onchain: {
        inspected: { submitted: true, proofCid: "bafy-verified-77-inspected", verifier: "0x1111111111111111111111111111111111111111", blockNumber: 1 },
        shipped: { submitted: false },
        arrived_cleared: { submitted: false }
      },
      comparison: {
        inspected: { onchainProofSubmitted: true, currentSourcePasses: true, discrepancyAfterCommit: false, proofCid: "bafy-verified-77-inspected", challengeDeadlineUnix: String(now + 3600), challengeDeadline: new Date((now + 3600) * 1000).toISOString() },
        shipped: { onchainProofSubmitted: false, currentSourcePasses: true },
        arrived_cleared: { onchainProofSubmitted: false, currentSourcePasses: customs.valid !== false }
      },
      disputeDemo: { actionable: false, reason: "Nothing disagrees." },
      oracleAction: "submit_milestone",
      note: "Stub gateway."
    });
  } catch (error) { next(error); }
});

app.post("/oracle/simulate/:contractId", (_req, res) => res.json({ ok: true }));

// One escrow, so the dashboard lists something to click into — the evidence
// panel is reached through it, and a reload drops the mock session.
const ESCROW = {
  escrowId: ESCROW_ID,
  containerRef: CONTAINER_REF,
  commodity: "Arabica Gayo Grade 1",
  value: "45000000.00",
  currency: "IDRT-demo",
  // The mock session's own address, so the signed-in wallet is a party to it.
  importer: "0x736d5C2D0e0D0f3Ab2e1a3a0C0b0A0908070652e",
  exporter: "0x1111111111111111111111111111111111111111",
  arbiter: "0x2222222222222222222222222222222222222222",
  documentCid: "QmSHwTMgqUJ46AEoTfsDZ9VuzvqVs8p352rGDDrtYH9XCx",
  state: "Shipped",
  stateId: 2,
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  globalDeadline: new Date(Date.now() + 30 * 86400000).toISOString(),
  milestones: {
    inspected: { submitted: true, proofCid: "bafy-verified-77-inspected", verifier: "0x1111111111111111111111111111111111111111" },
    shipped: { submitted: false },
    arrived_cleared: { submitted: false }
  }
};

app.get("/escrows", (_req, res) => res.json({ escrows: [{ escrowId: ESCROW_ID }] }));
app.get("/escrows/:id", (_req, res) => res.json(ESCROW));
app.get("/escrows/:id/activity", (_req, res) => res.json({ activity: [] }));
app.get("/escrows/:id/timelock", (_req, res) => res.json({ active: false }));
app.get("/escrows/:id/dispute", (_req, res) => res.json({ open: false }));
app.get("/verifiers", (_req, res) => res.json({ verifiers: [] }));
app.get("/oracle/identity", (_req, res) => res.json({ oracles: [] }));
app.get("/oracle/status", (_req, res) => res.json({ ok: true }));
app.get("/mock-status/:id", (_req, res) => res.json({ simulation: { fault: "none" } }));
app.get("/demo-balance/:address", (_req, res) => res.json({ balance: "150000000.00", hasClaimed: true }));
app.get("/directory/lookup", (_req, res) => res.json({ results: [] }));
app.get("/directory/address/:address", (_req, res) => res.json({ entry: null }));

app.use((error, _req, res, _next) => {
  res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
});

app.listen(PORT, () => console.log(`documents stub on :${PORT} (ipfs stub on :${IPFS_PORT}, store ${tmp})`));
