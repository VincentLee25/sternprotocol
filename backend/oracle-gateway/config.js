const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// ORACLE_PRIVATE_KEYS: comma-separated keys for the oracle consortium members
// (demo: Hardhat accounts #1, #4, #5). Falls back to the legacy single
// ORACLE_PRIVATE_KEY so old .env files keep working with a 1-of-1 setup.
const oraclePrivateKeys = (process.env.ORACLE_PRIVATE_KEYS || process.env.ORACLE_PRIVATE_KEY || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const config = {
  port: Number(process.env.PORT || 4000),
  rpcUrl: process.env.RPC_URL,
  oraclePrivateKeys,
  arbiterPrivateKey: process.env.ARBITER_PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS
};

function isMissing(value) {
  if (Array.isArray(value)) return value.length === 0;
  return !value;
}

function requireConfig(keys) {
  const missing = keys.filter((key) => isMissing(config[key]));

  if (missing.length > 0) {
    const readable = missing
      .map((key) => {
        if (key === "rpcUrl") return "RPC_URL";
        if (key === "oraclePrivateKeys") return "ORACLE_PRIVATE_KEYS (or ORACLE_PRIVATE_KEY)";
        if (key === "arbiterPrivateKey") return "ARBITER_PRIVATE_KEY";
        if (key === "contractAddress") return "CONTRACT_ADDRESS";
        return key;
      })
      .join(", ");

    const error = new Error(`Missing required environment variable(s): ${readable}`);
    error.statusCode = 400;
    throw error;
  }
}

module.exports = { config, requireConfig };
