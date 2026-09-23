const PARTICLE_SERVER_RPC = "https://api.particle.network/server/rpc";

function serviceError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createParticleAuthService({ projectId, serverKey, fetchImpl = fetch }) {
  async function verify(identity) {
    if (!projectId || !serverKey) {
      throw serviceError("Particle server verification is not configured. Set PARTICLE_PROJECT_ID and PARTICLE_SERVER_KEY.", 503, "PARTICLE_AUTH_NOT_CONFIGURED");
    }
    const uuid = String(identity?.uuid || "").trim();
    const token = String(identity?.token || "").trim();
    if (!uuid || !token) throw serviceError("Authenticate with a Particle provider first.", 401, "PARTICLE_AUTH_REQUIRED");

    let response;
    try {
      response = await fetchImpl(PARTICLE_SERVER_RPC, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${projectId}:${serverKey}`).toString("base64")}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getUserInfo", params: [uuid, token] }),
        signal: AbortSignal.timeout(8000)
      });
    } catch {
      throw serviceError("Could not verify the Particle session. Please try again.", 502, "PARTICLE_VERIFY_UNAVAILABLE");
    }

    if (!response.ok) throw serviceError("Particle rejected the current sign-in. Please authenticate again.", 401, "PARTICLE_TOKEN_INVALID");
    let payload;
    try { payload = await response.json(); }
    catch { throw serviceError("Particle returned an unreadable identity response.", 502, "PARTICLE_RESPONSE_INVALID"); }
    const user = payload?.result;
    if (payload?.error || !user || user.uuid !== uuid) {
      throw serviceError("Particle could not confirm this signed-in identity. Please authenticate again.", 401, "PARTICLE_TOKEN_INVALID");
    }

    // The server response, not a browser-supplied address, identifies the EOA
    // that owns STERN's Safe. Never authorize membership from email alone.
    const evmWallet = Array.isArray(user.wallets)
      ? user.wallets.find((wallet) => wallet.chain === "evm_chain" && /^0x[a-fA-F0-9]{40}$/.test(wallet.publicAddress || ""))
      : null;
    if (!evmWallet) {
      throw serviceError("Particle did not return a verified EVM account for this identity.", 422, "PARTICLE_WALLET_MISSING");
    }
    return { particleUserId: user.uuid, ownerAddress: evmWallet.publicAddress };
  }

  return { verify };
}

module.exports = { createParticleAuthService };
