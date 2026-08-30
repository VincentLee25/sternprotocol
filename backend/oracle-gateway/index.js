const express = require("express");
const cors = require("cors");
const { getMockStatus } = require("./oracleService");
const {
  submitMilestoneProof,
  raiseDispute,
  resolveDispute
} = require("./contractService");
const { config } = require("./config");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "stern-oracle-gateway",
    mockMode: true,
    timestamp: new Date().toISOString()
  });
});

app.get("/mock-status/:contractId", (req, res) => {
  const status = getMockStatus(req.params.contractId, req.query);
  res.json(status);
});

app.post("/submit-oracle/:contractId", async (req, res, next) => {
  try {
    const body = req.body || {};
    const status = getMockStatus(req.params.contractId, body);
    const result = await submitMilestoneProof(
      req.params.contractId,
      body.milestone || "inspected",
      body.proofCid || body.eblCid || "bafybeiproofdemo",
      status.verification
    );
    res.json({ status, result });
  } catch (error) {
    next(error);
  }
});

app.post("/milestones/:contractId/submit", async (req, res, next) => {
  try {
    const body = req.body || {};
    const status = getMockStatus(req.params.contractId, body);
    const result = await submitMilestoneProof(
      req.params.contractId,
      body.milestone,
      body.proofCid,
      status.verification
    );
    res.json({ status: "verified", automatedCheck: status.verification, result });
  } catch (error) {
    next(error);
  }
});

app.post("/open-dispute/:contractId", async (req, res, next) => {
  try {
    const result = await raiseDispute(req.params.contractId, req.body?.contestedMilestone || "none");
    res.json({ contractId: req.params.contractId, result });
  } catch (error) {
    next(error);
  }
});

app.post("/resolve-dispute/:contractId", async (req, res, next) => {
  try {
    const result = await resolveDispute(req.params.contractId, req.body || {});
    res.json({ contractId: req.params.contractId, result });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    error: error.message || "Unexpected server error"
  });
});

const server = app.listen(config.port, () => {
  console.log(`STERN oracle gateway listening on http://localhost:${config.port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${config.port} is already in use. Stop the existing backend process or set PORT to another value.`
    );
    console.error(`PowerShell: Get-NetTCPConnection -LocalPort ${config.port}`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
