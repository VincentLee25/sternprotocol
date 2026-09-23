const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const { createIdentityService } = require("./identityService");
const { createParticleAuthService } = require("./particleAuthService");

function service() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stern-identity-"));
  const instance = createIdentityService({
    storeFile: path.join(directory, "identities.json"),
    tokenSecret: "test-secret-that-is-longer-than-thirty-two-characters"
  });
  return { instance, directory };
}

const ownerInput = {
  companyName: "Nusantara Trading",
  email: "owner@nusantara.test",
  username: "nusantara.owner",
  walletAddress: "0x1111111111111111111111111111111111111111",
  password: "a sufficiently long owner password"
};

function particleVerifier(userId = "particle-user-12345678") {
  return createParticleAuthService({
    projectId: "test-project",
    serverKey: "test-server-key",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.particle.network/server/rpc");
      assert.equal(options.method, "POST");
      assert.match(options.headers.Authorization, /^Basic /);
      const request = JSON.parse(options.body);
      assert.equal(request.method, "getUserInfo");
      return { ok: true, json: async () => ({ result: { uuid: userId, wallets: [{ chain: "evm_chain", publicAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }] } }) };
    }
  });
}

test("registers a company owner and permits role-scoped company users", () => {
  const { instance, directory } = service();
  try {
    const registered = instance.registerCompany(ownerInput);
    assert.equal(registered.user.role, "owner");
    assert.ok(registered.accessToken);

    const created = instance.addCompanyUser(registered.accessToken, registered.company.id, {
      email: "operator@nusantara.test",
      username: "nusantara.operator",
      walletAddress: "0x2222222222222222222222222222222222222222",
      password: "a sufficiently long operator password",
      role: "operator"
    });
    assert.equal(created.user.role, "operator");
    assert.equal(instance.companyUsers(registered.accessToken, registered.company.id).users.length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("requires an MFA code after the account enables TOTP", () => {
  const { instance, directory } = service();
  try {
    const registered = instance.registerCompany(ownerInput);
    const setup = instance.setupMfa(registered.accessToken);
    assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.throws(() => instance.confirmMfa({ setupToken: setup.setupToken, code: "000000" }), /Invalid MFA code/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Particle Auth resolves an existing STERN membership to a backend session", async () => {
  const { instance, directory } = service();
  try {
    const particleUserId = "particle-user-existing-1234";
    const safeAddress = ownerInput.walletAddress;
    const created = instance.registerCompany({ ...ownerInput, particleUserId });
    const particle = await particleVerifier(particleUserId).verify({ uuid: particleUserId, token: "verified-particle-session" });

    const result = instance.particleSession({ ...particle, smartAccountAddress: safeAddress });

    assert.equal(result.registered, true);
    assert.equal(result.user.id, created.user.id);
    assert.equal(result.user.particleUserId, particleUserId);
    assert.ok(result.accessToken);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Particle Auth marks an unknown identity registration-required, then recognizes it after company registration", async () => {
  const { instance, directory } = service();
  try {
    const particleUserId = "particle-user-new-1234567";
    const safeAddress = "0x3333333333333333333333333333333333333333";
    const particle = await particleVerifier(particleUserId).verify({ uuid: particleUserId, token: "verified-particle-session" });

    const unknown = instance.particleSession({ ...particle, smartAccountAddress: safeAddress });
    assert.deepEqual(unknown, { registered: false, registrationRequired: true });

    const registered = instance.registerCompany({
      companyName: "New Trade Company",
      email: "new@trade.test",
      username: "new.trade.owner",
      walletAddress: safeAddress,
      particleUserId
    });
    const recognized = instance.particleSession({ ...particle, smartAccountAddress: safeAddress });

    assert.equal(recognized.registered, true);
    assert.equal(recognized.user.id, registered.user.id);
    assert.ok(recognized.accessToken);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("verified Particle Safe links an existing pre-Particle company account without a second password", async () => {
  const { instance, directory } = service();
  try {
    const existing = instance.registerCompany(ownerInput);
    const particleUserId = "particle-legacy-member-1234";
    const verified = await particleVerifier(particleUserId).verify({ uuid: particleUserId, token: "valid" });
    assert.equal(verified.ownerAddress, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const result = instance.particleSession({ particleUserId: verified.particleUserId, smartAccountAddress: ownerInput.walletAddress });
    assert.equal(result.registered, true);
    assert.equal(result.user.id, existing.user.id);
    assert.equal(result.user.particleUserId, particleUserId);
    assert.ok(instance.authenticate(result.accessToken).user);
    assert.throws(() => instance.particleSession({ particleUserId: "particle-other-account-1234", smartAccountAddress: ownerInput.walletAddress }), { code: "PARTICLE_WALLET_CLAIMED" });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

function authenticatorCode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let value = 0; const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

test("legacy member with MFA links Particle identity only after a valid authenticator challenge", () => {
  const { instance, directory } = service();
  try {
    const existing = instance.registerCompany(ownerInput);
    const setup = instance.setupMfa(existing.accessToken);
    instance.confirmMfa({ setupToken: setup.setupToken, code: authenticatorCode(setup.secret) });
    const particleUserId = "particle-mfa-member-12345";
    const pending = instance.particleSession({ particleUserId, smartAccountAddress: ownerInput.walletAddress });
    assert.equal(pending.mfaRequired, true);
    assert.equal(pending.accessToken, undefined);
    assert.equal(instance.authenticate(existing.accessToken).user.particleUserId, null);
    assert.throws(() => instance.verifyMfa({ mfaToken: pending.mfaToken, code: "000000" }), /Invalid MFA code/);
    const completed = instance.verifyMfa({ mfaToken: pending.mfaToken, code: authenticatorCode(setup.secret) });
    assert.equal(completed.user.particleUserId, particleUserId);
    assert.ok(completed.accessToken);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Particle verification rejects a response without a verified EVM wallet", async () => {
  const verifier = createParticleAuthService({
    projectId: "test-project", serverKey: "test-key",
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: { uuid: "particle-no-wallet-12345", wallets: [] } }) })
  });
  await assert.rejects(verifier.verify({ uuid: "particle-no-wallet-12345", token: "valid" }), { code: "PARTICLE_WALLET_MISSING" });
});
