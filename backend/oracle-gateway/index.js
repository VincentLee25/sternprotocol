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
  getVerifiers
} = require("./contractService");
const { config } = require("./config");
const { getDemoBalance, claimDemoBalance } = require("./faucetService");

const app = express();
app.use(cors({
  origin: config.corsOrigins.includes("*") ? true : config.corsOrigins
}));
app.use(express.json({ limit: "1mb" }));

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
      timestamp: new Date().toISOString()
    });
  } catch (error) { next(error); }
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

app.get("/oracle/evidence/:contractId", async (req, res, next) => {
  try {
    const status = getMockStatus(req.params.contractId, req.query);
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

    res.json({
      ...status,
      onchain,
      comparison,
      committedDiscrepancies,
      disputeDemo: {
        actionable: committedDiscrepancies.some(
          (item) =>
            item.challengeDeadlineUnix &&
            Math.floor(Date.now() / 1000) <= Number(item.challengeDeadlineUnix)
         ),
        reason: committedDiscrepancies.some(
          (item) =>
            item.challengeDeadlineUnix &&
            Math.floor(Date.now() / 1000) <= Number(item.challengeDeadlineUnix)
  )
    ? "A committed on-chain proof conflicts with the current source result and the challenge window is still open. The user may open a dispute."
    : committedDiscrepancies.length > 0
      ? "A committed on-chain proof conflicts with the current source result, but the applicable challenge window has closed."
      : "No committed proof currently conflicts with the current source result."
}
    });
  } catch (error) { next(error); }
});

app.post("/oracle/simulate/:contractId", (req, res, next) => {
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

    const status = getMockStatus(req.params.contractId);
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

app.get("/mock-status/:contractId", (req, res, next) => {
  try { res.json(getMockStatus(req.params.contractId, req.query)); } catch (error) { next(error); }
});

app.post("/submit-oracle/:contractId", requireInternalApiKey, async (req, res, next) => {
  try {
    const body = req.body || {};
    const status = getMockStatus(req.params.contractId, mergedOracleOptions(body));
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
    const status = getMockStatus(req.params.contractId, mergedOracleOptions(body));
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
