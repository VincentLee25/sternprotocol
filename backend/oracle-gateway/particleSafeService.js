const { createPublicClient, getAddress, http } = require("viem");
const { polygonAmoy } = require("viem/chains");
const { entryPoint07Address } = require("viem/account-abstraction");
const { toSafeSmartAccount } = require("permissionless/accounts");

// Keep these parameters identical to frontend/src/lib/smartAccount.js. The
// browser derives the Safe for transactions; the gateway independently derives
// it from Particle's verified owner before granting company access.
function createParticleSafeService({ rpcUrl }) {
  const client = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl || "https://polygon-amoy-bor-rpc.publicnode.com") });

  async function derive(ownerAddress) {
    const owner = getAddress(ownerAddress);
    const account = await toSafeSmartAccount({
      client,
      owners: [{ address: owner, type: "json-rpc" }],
      entryPoint: { address: entryPoint07Address, version: "0.7" },
      version: "1.4.1"
    });
    return account.address;
  }

  return { derive };
}

module.exports = { createParticleSafeService };
