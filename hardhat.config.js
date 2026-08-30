require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Reused for both the Amoy deployer/oracle signers below and the oracle
// gateway's runtime wallets (backend/oracle-gateway/config.js) — one env var,
// one set of keys, everywhere.
const oracleKeys = (process.env.ORACLE_PRIVATE_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: process.env.RPC_URL || "http://127.0.0.1:8545"
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "",
      chainId: 80002,
      // Order matters: scripts/deploy.js reads signers[0] as the deployer and
      // signers[1..3] as the oracle consortium on non-local networks.
      accounts: [
        ...(process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : []),
        ...oracleKeys
      ]
    }
  }
};
