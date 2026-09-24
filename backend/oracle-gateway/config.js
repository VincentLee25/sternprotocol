const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const oraclePrivateKeys = (process.env.ORACLE_PRIVATE_KEYS || process.env.ORACLE_PRIVATE_KEY || "")
  .split(",").map(k => k.trim()).filter(Boolean);
const primaryRpcUrl = process.env.RPC_URL || "";
const rpcFallbackUrls = [
  ...(process.env.RPC_FALLBACK_URLS || "").split(",").map(value => value.trim()).filter(Boolean),
  // These public endpoints are deliberately independent of PublicNode. A
  // temporary upstream 524 must not make all historical escrow and balance
  // reads fail. Operators can still place a paid endpoint first via RPC_URL.
  "https://polygon-amoy.drpc.org",
  "https://polygon-amoy.gateway.tenderly.co"
].filter((url, index, urls) => url !== primaryRpcUrl && urls.indexOf(url) === index);
const defaultCorsOrigins = [
  "https://thesternman.up.railway.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
const configuredCorsOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
const corsOrigins = configuredCorsOrigins.length && !configuredCorsOrigins.includes("*")
  ? configuredCorsOrigins
  : defaultCorsOrigins;

const config = {
  port: Number(process.env.PORT || 4000),
  rpcUrl: primaryRpcUrl,
  rpcFallbackUrls,
  rpcChainId: Number(process.env.RPC_CHAIN_ID || 80002),
  oraclePrivateKeys,
  arbiterPrivateKey: process.env.ARBITER_PRIVATE_KEY,
  idrtMinterPrivateKey: process.env.IDRT_MINTER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY,
  internalApiKey: process.env.INTERNAL_API_KEY,
  corsOrigins,
  demoBalanceIdrt: process.env.DEMO_BALANCE_IDRT || "150000000.00",
  demoClaimsFile: process.env.DEMO_CLAIMS_FILE,
  // CONTRACT_ADDRESS remains the legacy deployment for backwards-compatible
  // runtime configuration. The V2 address is explicit so the gateway can read
  // both contracts before production environment variables are changed.
  contractAddress: process.env.CONTRACT_ADDRESS,
  legacyContractAddress: process.env.LEGACY_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || "0xd281f2B9f9C26144EB7303F0f3F7cdB797E93468",
  v2ContractAddress: process.env.V2_CONTRACT_ADDRESS || "0x31a1EbDEaA206ef060747550a235E0B45c99980c",
  // Set only after V3 has been deployed and its verifiers funded.
  v3ContractAddress: process.env.V3_CONTRACT_ADDRESS || "",
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
  databaseUrl: process.env.DATABASE_URL || "",
  // Read only at boot to ensure every legacy identity was explicitly imported.
  // PostgreSQL is the sole runtime source for company identity and membership.
  legacyIdentityStoreFile: process.env.IDENTITY_STORE_FILE || path.resolve(__dirname, "../data/identities.json"),
  // The separate counterparty address book still uses a JSON file and must
  // sit on a persistent volume. STERN company identity above uses PostgreSQL.
  directoryStoreFile: process.env.DIRECTORY_STORE_FILE || path.resolve(__dirname, "../data/directory.json"),
  // Customs documents (PEB / PIB / proof of duty paid) recorded per escrow.
  // Only CIDs and file names live here — the documents themselves are on IPFS
  // — but losing the file loses the link between an escrow and its clearance,
  // so this also needs a persistent volume.
  customsStoreFile: process.env.CUSTOMS_STORE_FILE || path.resolve(__dirname, "../data/customs.json"),
  // Reviews of interpretive clauses. The clause TEXT is in the pinned creation
  // manifest and cannot move; only the verdicts live here, so losing this file
  // loses the reviews and the affected milestones go back to being blocked
  // pending a review — which is the safe direction to fail.
  clauseStoreFile: process.env.CLAUSE_STORE_FILE || path.resolve(__dirname, "../data/clauses.json"),
  // Post-dispute settlement proposals between the two parties. Same volume
  // requirement as the stores above.
  negotiationStoreFile: process.env.NEGOTIATION_STORE_FILE || path.resolve(__dirname, "../data/negotiations.json"),
  authTokenSecret: process.env.AUTH_TOKEN_SECRET,
  particleProjectId: process.env.PARTICLE_PROJECT_ID || process.env.VITE_PARTICLE_PROJECT_ID || "",
  particleServerKey: process.env.PARTICLE_SERVER_KEY || "",
  particleSafeRpcUrl: process.env.PARTICLE_SAFE_RPC_URL || "https://polygon-amoy-bor-rpc.publicnode.com",

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
