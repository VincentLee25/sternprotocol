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
  nativeGasWarningWei: BigInt(process.env.NATIVE_GAS_WARNING_WEI || "1000000000000000")
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
