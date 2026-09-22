const express = require("express");
const cors = require("cors");
const { getMockStatus, setSimulation, clearSimulation } = require("./oracleService");
const {
  submitMilestoneProof,
  resolveDispute,
  getOracleIdentity,
  getOracleStatus,
  getOnchainEvidence,
  getEscrow,
  listEscrows,
  getTimelock,
  getDispute,
  prepareDispute,
  getActivity,
  getVerifiers,
  verifyAndSubmitAll,
  chainNow,
  getProvider
} = require("./contractService");
const { config } = require("./config");
const { getDemoBalance, claimDemoBalance } = require("./faucetService");
const { createIdentityService } = require("./identityService");
const {
  pinDocument,
  fetchByCid,
  verifyDocumentCached,
  ipfsStatus,
  MAX_DOCUMENT_BYTES
} = require("./ipfsService");

const app = express();
app.use(cors({
  origin: config.corsOrigins.includes("*") ? true : config.corsOrigins
}));
// 12mb, not 1mb: POST /ipfs/pin carries the e-BL PDF as base64, and base64
// costs a third on top of the 8mb document ceiling ipfsService enforces.
// Every other route is small, and the ceiling is checked there rather than
// relying on this limit to do it.
app.use(express.json({ limit: "12mb" }));

let identities = null;
function identityService() {
  if (!identities) identities = createIdentityService({ storeFile: config.identityStoreFile, tokenSecret: config.authTokenSecret });
  return identities;
}

function requireSession(req, _res, next) {
  try {
    const authorization = req.get("authorization") || "";
    req.identity = identityService().authenticate(authorization.replace(/^Bearer\s+/i, ""));
    next();
  } catch (error) { next(error); }
}

function requireInternalApiKey(req, _res, next) {
  if (!config.internalApiKey) {
    const error = new Error("Internal API is not configured. Set INTERNAL_API_KEY before enabling privileged Oracle/Arbiter endpoints.");
    error.statusCode = 503;
    error.code = "INTERNAL_API_NOT_CONFIGURED";
    return next(error);
  }
  const supplied = req.get("x-api-key") || (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!supplied || supplied !== config.internalApiKey) {
    const error = new Error("Unauthorized internal API request.");
    error.statusCode = 401;
    error.code = "UNAUTHORIZED_INTERNAL_API";
    return next(error);
  }
  return next();
}

function mergedOracleOptions(body = {}) {
  return {
    ...body,
    ...(body.overrides && typeof body.overrides === "object" ? body.overrides : {})
  };
}

app.get("/health", async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      service: "stern-oracle-gateway",
      mockMode: true,
      evidenceMode: true,
      contractAddress: config.contractAddress || null,
      // Whether the e-BL is being verified for real or falling back to the
      // placeholder check. Worth having on /health: it is the difference
      // between two very different claims about the same screen, and it is
      // decided entirely by an environment variable.
      ipfs: ipfsStatus(),
      timestamp: new Date().toISOString()
    });
  } catch (error) { next(error); }
});

app.post("/auth/register-company", (req, res, next) => {
  try { res.status(201).json(identityService().registerCompany(req.body || {})); } catch (error) { next(error); }
});

app.post("/auth/login", (req, res, next) => {
  try { res.json(identityService().login(req.body || {})); } catch (error) { next(error); }
});

app.get("/auth/me", requireSession, (req, res, next) => {
  try { res.json({ user: identityService().publicUser(req.identity.user), company: identityService().publicCompany(req.identity.company) }); } catch (error) { next(error); }
});

app.post("/auth/mfa/setup", requireSession, (req, res, next) => {
  try { res.json(identityService().setupMfa((req.get("authorization") || "").replace(/^Bearer\s+/i, ""))); } catch (error) { next(error); }
});

app.post("/auth/mfa/confirm", (req, res, next) => {
  try { res.json(identityService().confirmMfa(req.body || {})); } catch (error) { next(error); }
});

app.post("/auth/mfa/verify", (req, res, next) => {
  try { res.json(identityService().verifyMfa(req.body || {})); } catch (error) { next(error); }
});

app.get("/companies/:companyId/users", requireSession, (req, res, next) => {
  try { res.json(identityService().companyUsers((req.get("authorization") || "").replace(/^Bearer\s+/i, ""), req.params.companyId)); } catch (error) { next(error); }
});

app.post("/companies/:companyId/users", requireSession, (req, res, next) => {
  try { res.status(201).json(identityService().addCompanyUser((req.get("authorization") || "").replace(/^Bearer\s+/i, ""), req.params.companyId, req.body || {})); } catch (error) { next(error); }
});

app.post("/demo-balance/claim", async (req, res, next) => {
  try {
    res.json(await claimDemoBalance(req.body?.smartAccountAddress, req.body?.role || "importer"));
  } catch (error) { next(error); }
});

app.get("/demo-balance/:smartAccountAddress", async (req, res, next) => {
  try { res.json(await getDemoBalance(req.params.smartAccountAddress)); } catch (error) { next(error); }
});

app.get("/escrows", async (req, res, next) => {
  try { res.json(await listEscrows(req.query)); } catch (error) { next(error); }
});

app.get("/escrows/:escrowId", async (req, res, next) => {
  try { res.json(await getEscrow(req.params.escrowId)); } catch (error) { next(error); }
});

app.get("/escrows/:escrowId/timelock", async (req, res, next) => {
  try { res.json(await getTimelock(req.params.escrowId)); } catch (error) { next(error); }
});

app.get("/escrows/:escrowId/activity", async (req, res, next) => {
  try { res.json(await getActivity(req.params.escrowId)); } catch (error) { next(error); }
});

app.get("/escrows/:escrowId/dispute", async (req, res, next) => {
  try { res.json(await getDispute(req.params.escrowId)); } catch (error) { next(error); }
});

app.post("/escrows/:escrowId/dispute/prepare", async (req, res, next) => {
  try {
    res.json(await prepareDispute(req.params.escrowId, req.body?.contestedMilestone || "none"));
  } catch (error) { next(error); }
});

app.get("/oracle/identity", async (_req, res, next) => {
  try { res.json(await getOracleIdentity()); } catch (error) { next(error); }
});

app.get("/oracle/status", async (_req, res, next) => {
  try { res.json(await getOracleStatus()); } catch (error) { next(error); }
});

app.get("/verifiers", async (_req, res, next) => {
  try { res.json(await getVerifiers()); } catch (error) { next(error); }
});

// --- e-BL on IPFS ------------------------------------------------------------
//
// The document the escrow is created against is pinned for real, and the CID
// written on chain is the address it actually resolves at. See ipfsService.js
// for what is checked and why.

app.get("/ipfs/status", (_req, res) => {
  res.json(ipfsStatus());
});

// Pins the e-BL and hands back the CID to put on chain.
//
// Not behind requireInternalApiKey: the browser calls this while creating an
// escrow, and that key must never reach a bundle. What that means is that this
// route spends the gateway's pinning quota for anyone who can reach it, so it
// is capped at one document of 8mb and wants a rate limit on a public
// deployment. It cannot forge anything — a pin is not a proof, and the CID it
// returns is only worth something once the user's own signature puts it into
// createEscrow.
app.post("/ipfs/pin", async (req, res, next) => {
  try {
    const body = req.body || {};
    const base64 = String(body.contentBase64 || body.content || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) {
      const error = new Error("Send the document as contentBase64.");
      error.statusCode = 400;
      error.code = "IPFS_NO_CONTENT";
      throw error;
    }

    const bytes = Buffer.from(base64, "base64");
    if (bytes.length > MAX_DOCUMENT_BYTES) {
      const error = new Error(
        `The document is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`
      );
      error.statusCode = 413;
      error.code = "IPFS_DOCUMENT_TOO_LARGE";
      throw error;
    }

    const fileName = String(body.fileName || "e-bill-of-lading.pdf").slice(0, 160);
    const pinned = await pinDocument(bytes, fileName);

    // Read it straight back and check it as if we were a sceptic, so the
    // creation screen can show the extracted bill-of-lading fields before the
    // user commits — and so the verdict is already cached by the time the
    // escrow's evidence panel asks for it. Best-effort: a pin that succeeded
    // is still a pin, even if a public gateway has not caught up yet.
    let verification = null;
    try {
      verification = await verifyDocumentCached(pinned.cid, {
        containerRef: body.containerRef || null
      });
    } catch (error) {
      verification = { available: false, valid: false, reason: error.message };
    }

    res.json({ ok: true, ...pinned, verification });
  } catch (error) { next(error); }
});

// The verdict on a CID: does it resolve, do the bytes hash back to it, and is
// it a bill of lading for this container.
app.get("/ipfs/verify/:cid", async (req, res, next) => {
  try {
    res.json(await verifyDocumentCached(req.params.cid, {
      containerRef: req.query.containerRef || null
    }));
  } catch (error) { next(error); }
});

// Serves the document itself, so the app can show the PDF without depending on
// a public gateway's CORS headers. Inline rather than an attachment: the point
// is to be able to read the bill of lading next to the escrow it belongs to.
app.get("/ipfs/document/:cid", async (req, res, next) => {
  try {
    const { bytes } = await fetchByCid(req.params.cid);
    const isPdf = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
    res.setHeader("content-type", isPdf ? "application/pdf" : "application/octet-stream");
    res.setHeader("content-disposition", `inline; filename="${req.params.cid}${isPdf ? ".pdf" : ""}"`);
    // Immutable by construction: the bytes at a CID cannot change.
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.send(bytes);
  } catch (error) { next(error); }
});

app.get("/oracle/evidence/:contractId", async (req, res, next) => {
  try {
    const status = await getMockStatus(req.params.contractId, req.query);
    const onchain = {};
    const comparison = {};
    for (const milestone of ["inspected", "shipped", "arrived_cleared"]) {
      try { onchain[milestone] = await getOnchainEvidence(req.params.contractId, milestone); }
      catch { onchain[milestone] = { submitted: false }; }

      const proof = onchain[milestone];
      const milestoneVerified = {
        inspected: status.verification.vgmMatch && status.verification.inspectionPassed,
        shipped: status.verification.aisDeparted,
        arrived_cleared: status.verification.ceisaApproved
      }[milestone];

      comparison[milestone] = {
        onchainProofSubmitted: Boolean(proof.submitted),
        currentSourcePasses: Boolean(milestoneVerified),
        discrepancyAfterCommit: Boolean(proof.submitted && milestoneVerified === false),
        proofCid: proof.proofCid || null,
        verifier: proof.verifier || null,
        challengeDeadline: proof.challengeDeadline || null,
        challengeDeadlineUnix: proof.challengeDeadlineUnix || null
      };
    }

    const committedDiscrepancies = Object.entries(comparison)
      .filter(([, item]) => item.discrepancyAfterCommit)
      .map(([milestone, item]) => ({ milestone, ...item }));

    // Against block.timestamp, not this machine's clock: the contract decides
    // whether a window is open, and a few seconds of drift here either hides a
    // dispute the user could still raise, or offers one that reverts.
    //
    // Tolerated rather than required. The proof reads above already degrade to
    // {submitted:false} when the chain is unreachable, so this route serves the
    // source verdict with no chain at all — letting the clock read throw would
    // have turned that into a 400 for the whole endpoint. With no chain there
    // are no committed proofs either, so nothing is actionable regardless.
    let actionable = false;
    try {
      const now = await chainNow(getProvider());
      actionable = committedDiscrepancies.some(
        (item) => item.challengeDeadlineUnix && now <= Number(item.challengeDeadlineUnix)
      );
    } catch {
      actionable = false;
    }

    res.json({
      ...status,
      onchain,
      comparison,
      committedDiscrepancies,
      disputeDemo: {
        actionable,
        reason: actionable
          ? "A committed on-chain proof conflicts with the current source result and the challenge window is still open. The user may open a dispute."
          : committedDiscrepancies.length > 0
            ? "A committed on-chain proof conflicts with the current source result, but the applicable challenge window has closed."
            : "No committed proof currently conflicts with the current source result."
      }
    });
  } catch (error) { next(error); }
});

// Triggers the gateway's own verification and commits whatever passes.
//
// Deliberately NOT behind requireInternalApiKey, unlike /submit-oracle and
// /milestones/:id/submit. Those two let the caller choose the milestone, the
// proof CID and the source overrides — hand that to a browser and anyone can
// forge a proof. This one takes no such input: it reads the sources itself,
// applies the same automated gate, and refuses anything that fails. There is
// nothing here for a caller to steer.
//
// What it does still hand out is the gateway's gas, so on a public deployment
// this wants a rate limit, or a scheduled submitter instead of an endpoint —
// in production nothing triggers this at all; the gateway watches the sources
// and submits on its own.
app.post("/oracle/verify/:contractId", async (req, res, next) => {
  try {
    const status = await getMockStatus(req.params.contractId, mergedOracleOptions(req.body || {}));
    const outcome = await verifyAndSubmitAll(req.params.contractId, status.verification, {
      proofCidPrefix: req.body?.proofCidPrefix || "bafy-verified"
    });
    res.json({
      ...outcome,
      verification: status.verification,
      evidence: status.evidence,
      allVerified: status.allVerified
    });
  } catch (error) { next(error); }
});

app.post("/oracle/simulate/:contractId", async (req, res, next) => {
  try {
    const body = req.body || {};
    const fault = body.fault || body.simulateFault || "none";
    if (String(fault).toLowerCase() === "none" && body.overrides === undefined) {
      clearSimulation(req.params.contractId);
    } else {
      setSimulation(req.params.contractId, {
        fault,
        overrides: body.overrides
      });
    }

    const status = await getMockStatus(req.params.contractId);
    res.json({
      ok: true,
      mode: "simulation",
      ...status,
      nextStep: status.allVerified
        ? "Current sources pass. A backend Oracle submission may proceed."
        : "Current source is intentionally failing. No bad proof is written on-chain. If a previous on-chain proof now conflicts with this source, GET /oracle/evidence/:contractId exposes the discrepancy for a user dispute demo.",
      resetHint: 'POST the same endpoint with {"fault":"none"} to restore normal mock data.'
    });
  } catch (error) { next(error); }
});

app.get("/mock-status/:contractId", async (req, res, next) => {
  try { res.json(await getMockStatus(req.params.contractId, req.query)); } catch (error) { next(error); }
});

app.post("/submit-oracle/:contractId", requireInternalApiKey, async (req, res, next) => {
  try {
    const body = req.body || {};
    const status = await getMockStatus(req.params.contractId, mergedOracleOptions(body));
    const result = await submitMilestoneProof(
      req.params.contractId,
      body.milestone || "inspected",
      body.proofCid || body.eblCid || "bafybeiproofdemo",
      status.verification
    );
    res.json({ status, result });
  } catch (error) { next(error); }
});

app.post("/milestones/:contractId/submit", requireInternalApiKey, async (req, res, next) => {
  try {
    const body = req.body || {};
    const status = await getMockStatus(req.params.contractId, mergedOracleOptions(body));
    const result = await submitMilestoneProof(
      req.params.contractId,
      body.milestone,
      body.proofCid,
      status.verification
    );
    res.json({ status: "verified", milestone: body.milestone, automatedCheck: status.verification, evidence: status.evidence, result });
  } catch (error) { next(error); }
});

app.post("/resolve-dispute/:contractId", requireInternalApiKey, async (req, res, next) => {
  try {
    const result = await resolveDispute(req.params.contractId, req.body || {});
    res.json({ contractId: req.params.contractId, result });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    error: error.message || "Unexpected server error",
    ...(error.code ? { code: error.code } : {}),
    ...(error.details ? { details: error.details } : {})
  });
});

const server = app.listen(config.port, () => {
  console.log(`STERN oracle gateway listening on http://localhost:${config.port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Stop the existing backend process or set PORT to another value.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
