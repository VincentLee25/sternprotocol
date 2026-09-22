const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const oraclePrivateKeys = (process.env.ORACLE_PRIVATE_KEYS || process.env.ORACLE_PRIVATE_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);

const config = {
  port: Number(process.env.PORT || 4000),
  rpcUrl: process.env.RPC_URL,
  oraclePrivateKeys,
  arbiterPrivateKey: process.env.ARBITER_PRIVATE_KEY,
  idrtMinterPrivateKey: process.env.IDRT_MINTER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
  internalApiKey: process.env.INTERNAL_API_KEY,
  corsOrigins: (process.env.CORS_ORIGINS || "*").split(",").map(v => v.trim()).filter(Boolean),
  demoBalanceIdrt: process.env.DEMO_BALANCE_IDRT || "150000000.00",
  demoClaimsFile: process.env.DEMO_CLAIMS_FILE,
  contractAddress: process.env.CONTRACT_ADDRESS,
  // The block the contract was deployed at. Optional, but worth setting: the
  // activity scan otherwise has to estimate a start block from each escrow's
  // creation timestamp. Printed by scripts/deploy.js.
  contractDeployBlock: process.env.CONTRACT_DEPLOY_BLOCK
    ? Number(process.env.CONTRACT_DEPLOY_BLOCK)
    : null,
  // Blocks per eth_getLogs request. 10,000 is the cap most public Amoy RPCs
  // enforce, so the default sits just under it; the scan shrinks further on its
  // own if a provider is stricter. Raise it only against an RPC you know allows
  // more — a paid endpoint usually does, and fewer, wider requests are faster.
  logScanChunk: Number(process.env.LOG_SCAN_CHUNK || 9000),
  nativeGasWarningWei: BigInt(process.env.NATIVE_GAS_WARNING_WEI || "1000000000000000"),
  identityStoreFile: process.env.IDENTITY_STORE_FILE || path.resolve(__dirname, "../data/identities.json"),
  authTokenSecret: process.env.AUTH_TOKEN_SECRET,

  // --- IPFS ------------------------------------------------------------------
  // The e-BL document is pinned for real, and the CID that goes on chain is
  // the address the document actually resolves at. One of these two is needed
  // for that; with neither, the gateway reports the e-BL check as unavailable
  // rather than passing it (see ipfsService.js).
  //
  // PINATA_JWT is the hosted route: an API key from pinata.cloud. It is a
  // secret — it can pin, unpin and bill — so it belongs here and never in
  // frontend/.env, where a VITE_ prefix would publish it in the bundle.
  pinataJwt: process.env.PINATA_JWT || "",
  // IPFS_API_URL is the self-hosted route: the RPC of a Kubo node, e.g.
  // http://127.0.0.1:5001. IPFS_API_AUTH is an optional Authorization header
  // value if that node sits behind a proxy that wants one.
  ipfsApiUrl: process.env.IPFS_API_URL || "",
  ipfsApiAuth: process.env.IPFS_API_AUTH || "",
  // Read paths, tried in order. These are public gateways: retrieval by CID
  // needs no key, and using more than one means a single slow gateway does not
  // fail the check.
  ipfsGateways: (process.env.IPFS_GATEWAYS ||
    "https://gateway.pinata.cloud,https://ipfs.io,https://dweb.link")
    .split(",").map(v => v.trim().replace(/\/+$/, "")).filter(Boolean)
};

function isMissing(v) { return Array.isArray(v) ? v.length === 0 : v == null || v === ""; }

function requireConfig(keys) {
  const missing = keys.filter(k => isMissing(config[k]));
  if (missing.length) {
    const names = {
      rpcUrl: "RPC_URL",
      oraclePrivateKeys: "ORACLE_PRIVATE_KEYS (or ORACLE_PRIVATE_KEY)",
      arbiterPrivateKey: "ARBITER_PRIVATE_KEY",
      idrtMinterPrivateKey: "IDRT_MINTER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY)",
      contractAddress: "CONTRACT_ADDRESS"
    };
    const error = new Error("Missing required environment variable(s): " +
      missing.map(k => names[k] || k).join(", "));
    error.statusCode = 400;
    throw error;
  }
}

module.exports = { config, requireConfig };
