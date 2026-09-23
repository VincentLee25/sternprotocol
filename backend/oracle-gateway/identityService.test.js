const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const { createIdentityPool, runMigrations, assertMigrationsCurrent } = require("./db/migrate");
const { importLegacyIdentities } = require("./db/importLegacyIdentities");
const { createIdentityService } = require("./identityService");
const { createParticleAuthService } = require("./particleAuthService");

const silent = { info() {} };
const ownerAddress = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const safe = (digit) => "0x" + digit.repeat(40);
const particle = (name, digit) => ({
  particleUserId: "particle-" + name + "-12345678",
  ownerAddress,
  smartAccountAddress: safe(digit)
});

function authenticatorCode(secret, stepOffset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let value = 0; const bytes = [];
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + stepOffset));
  const digest = crypto.createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

test("PostgreSQL is the sole company identity store across Particle, membership, MFA, and legacy import", async (t) => {
  const db = await PGlite.create();
  const socket = new PGLiteSocketServer({ db, host: "127.0.0.1", port: 0, maxConnections: 10 });
  await socket.start();
  const pool = createIdentityPool("postgresql://stern:stern@" + socket.getServerConn() + "/stern");
  const service = createIdentityService({ pool, tokenSecret: "identity-test-secret-with-more-than-32-characters" });
  try {
    await t.test("migrations apply once and are safe to rerun", async () => {
      await assert.rejects(assertMigrationsCurrent({ pool }), /identity schema is missing/i);
      assert.deepEqual((await runMigrations({ pool, logger: silent })).applied, ["0001_identity.sql", "0002_mfa_challenges.sql"]);
      await assertMigrationsCurrent({ pool });
      assert.deepEqual((await runMigrations({ pool, logger: silent })).skipped, ["0001_identity.sql", "0002_mfa_challenges.sql"]);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stern-migrations-crlf-"));
      try {
        for (const name of ["0001_identity.sql", "0002_mfa_challenges.sql"]) {
          const original = fs.readFileSync(path.join(__dirname, "db/migrations", name), "utf8");
          fs.writeFileSync(path.join(tempDir, name), original.replace(/\r?\n/g, "\r\n"));
        }
        assert.deepEqual((await runMigrations({ pool, logger: silent, migrationsDir: tempDir })).skipped, ["0001_identity.sql", "0002_mfa_challenges.sql"]);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    await t.test("verified Particle identity follows the new-member and existing-member backend branches", async () => {
      const uuid = "particle-verified-route-12345678";
      const verifier = createParticleAuthService({
        projectId: "test-project", serverKey: "test-server-key",
        fetchImpl: async (_url, options) => {
          assert.equal(JSON.parse(options.body).method, "getUserInfo");
          return { ok: true, json: async () => ({ result: { uuid, wallets: [{ chain: "evm_chain", publicAddress: ownerAddress }] } }) };
        }
      });
      const verified = await verifier.verify({ uuid, token: "verified-particle-session" });
      const identity = { ...verified, smartAccountAddress: safe("a") };
      assert.deepEqual(await service.particleSession(identity), { registered: false, registrationRequired: true });
      const registered = await service.registerCompany({ ...identity, companyName: "Verified Trade", email: "verified@trade.test", username: "verified.captain" });
      assert.equal((await service.particleSession(identity)).user.id, registered.user.id);
    });

    const owner = particle("owner", "1");
    let ownerSession;
    await t.test("new Particle identity requires registration, then owner membership and direct workspace session", async () => {
      assert.deepEqual(await service.particleSession(owner), { registered: false, registrationRequired: true });
      ownerSession = await service.registerCompany({ ...owner, companyName: "Nusantara Trading", email: "owner@nusantara.test", username: "mrfullstack" });
      assert.equal(ownerSession.user.role, "owner");
      assert.equal(ownerSession.user.username, "mrfullstack");
      assert.equal(ownerSession.user.walletAddress, owner.smartAccountAddress);
      assert.equal(ownerSession.user.particleUserId, owner.particleUserId);
      assert.ok(ownerSession.accessToken);
      const existing = await service.particleSession(owner);
      assert.equal(existing.registered, true);
      assert.equal(existing.user.id, ownerSession.user.id);
      assert.equal((await service.authenticate(existing.accessToken)).company.id, ownerSession.company.id);
      assert.equal((await pool.query("SELECT role FROM memberships WHERE user_id = $1", [ownerSession.user.id])).rows[0].role, "owner");
      await assert.rejects(service.registerCompany({ ...owner, companyName: "Duplicate", email: "owner@nusantara.test", username: "other" }), { code: "PARTICLE_ID_EXISTS" });
      await assert.rejects(service.particleSession({ ...owner, particleUserId: "particle-other-12345678" }), { code: "PARTICLE_WALLET_CLAIMED" });
      const differentIdentity = particle("different", "9");
      assert.deepEqual(await service.particleSession(differentIdentity), { registered: false, registrationRequired: true });
      await assert.rejects(service.registerCompany({ ...differentIdentity, companyName: "Wrong claim", email: "owner@nusantara.test", username: "other.owner" }), { code: "EMAIL_EXISTS" });
    });

    await t.test("editable STERN handle does not alter Particle identity or Safe account", async () => {
      const before = (await pool.query("SELECT provider_subject, smart_account_address FROM auth_identities WHERE user_id = $1", [ownerSession.user.id])).rows[0];
      const updated = await service.updateProfile(ownerSession.accessToken, { username: "trade.captain" });
      assert.equal(updated.user.username, "trade.captain");
      const after = (await pool.query("SELECT provider_subject, smart_account_address FROM auth_identities WHERE user_id = $1", [ownerSession.user.id])).rows[0];
      assert.deepEqual(after, before);
      assert.equal((await service.particleSession(owner)).user.username, "trade.captain");
    });

    const admin = particle("admin", "2");
    let adminSession;
    await t.test("owner invites admin; admin invites operator; operator cannot invite", async () => {
      const adminInvite = await service.createInvitation(ownerSession.accessToken, ownerSession.company.id, { email: "admin@nusantara.test", role: "admin" });
      assert.ok(adminInvite.invitation.code);
      await assert.rejects(service.acceptInvitation({ ...admin, code: adminInvite.invitation.code, email: "wrong@nusantara.test", username: "admin.ops" }), { code: "INVITATION_EMAIL_MISMATCH" });
      adminSession = await service.acceptInvitation({ ...admin, code: adminInvite.invitation.code, email: "admin@nusantara.test", username: "admin.ops" });
      assert.equal(adminSession.user.role, "admin");
      assert.equal(adminSession.company.id, ownerSession.company.id);
      assert.equal((await service.companyUsers(ownerSession.accessToken, ownerSession.company.id)).users.length, 2);
      const operatorInvite = await service.createInvitation(adminSession.accessToken, ownerSession.company.id, { email: "operator@nusantara.test", role: "operator" });
      const operatorSession = await service.acceptInvitation({ ...particle("operator", "3"), code: operatorInvite.invitation.code, email: "operator@nusantara.test", username: "ops.agent" });
      assert.equal(operatorSession.user.role, "operator");
      await assert.rejects(service.createInvitation(operatorSession.accessToken, ownerSession.company.id, { email: "next@nusantara.test", role: "operator" }), { code: "ROLE_FORBIDDEN" });
      await assert.rejects(service.createInvitation(adminSession.accessToken, ownerSession.company.id, { email: "next@nusantara.test", role: "admin" }), { code: "ROLE_FORBIDDEN" });
      await assert.rejects(service.acceptInvitation({ ...particle("other", "4"), code: adminInvite.invitation.code, email: "admin@nusantara.test", username: "other.user" }), { code: "INVITATION_USED" });
    });

    const secondOwner = particle("secondowner", "5");
    let secondSession;
    await t.test("MFA is attached to the STERN user and gates a registered Particle session", async () => {
      secondSession = await service.registerCompany({ ...secondOwner, companyName: "Harbor Export", email: "lead@harbor.test", username: "harbor.lead" });
      const setup = await service.setupMfa(secondSession.accessToken);
      assert.match(setup.otpauthUrl, /^otpauth:\/\/totp\//);
      await assert.rejects(service.confirmMfa({ setupToken: setup.setupToken, code: "000000" }), { code: "MFA_INVALID" });
      await service.confirmMfa({ setupToken: setup.setupToken, code: authenticatorCode(setup.secret) });
      const pending = await service.particleSession(secondOwner);
      assert.equal(pending.mfaRequired, true);
      assert.equal(pending.accessToken, undefined);
      await assert.rejects(service.verifyMfa({ mfaToken: pending.mfaToken, code: "000000" }), { code: "MFA_INVALID" });
      const completed = await service.verifyMfa({ mfaToken: pending.mfaToken, code: authenticatorCode(setup.secret) });
      assert.equal(completed.user.id, secondSession.user.id);
      assert.equal(completed.user.mfaEnabled, true);
      assert.ok(completed.accessToken);
      const mfa = (await pool.query("SELECT enabled, secret FROM mfa_credentials WHERE user_id = $1", [secondSession.user.id])).rows[0];
      assert.equal(mfa.enabled, true);
      assert.equal(mfa.secret, setup.secret);
    });

    await t.test("existing MFA member joins another company only after the challenge", async () => {
      const invite = await service.createInvitation(ownerSession.accessToken, ownerSession.company.id, { email: "lead@harbor.test", role: "operator" });
      const pending = await service.acceptInvitation({ ...secondOwner, code: invite.invitation.code });
      assert.equal(pending.mfaRequired, true);
      const before = await pool.query("SELECT id FROM memberships WHERE user_id = $1 AND company_id = $2", [secondSession.user.id, ownerSession.company.id]);
      assert.equal(before.rowCount, 0);
      const joined = await service.verifyMfa({ mfaToken: pending.mfaToken, code: authenticatorCode((await pool.query("SELECT secret FROM mfa_credentials WHERE user_id = $1", [secondSession.user.id])).rows[0].secret, 1) });
      assert.equal(joined.company.id, ownerSession.company.id);
      assert.equal(joined.user.role, "operator");
      const memberships = (await service.userMemberships(joined.accessToken)).memberships;
      assert.equal(memberships.length, 2);
      assert.deepEqual(new Set(memberships.map((membership) => membership.companyId)), new Set([ownerSession.company.id, secondSession.company.id]));
      const restored = await service.switchCompany(joined.accessToken, secondSession.company.id);
      assert.equal(restored.company.id, secondSession.company.id);
      assert.equal(restored.user.role, "owner");
      assert.equal((await service.authenticate(restored.accessToken)).company.id, secondSession.company.id);
      await assert.rejects(service.switchCompany(joined.accessToken, "unknown_company"), { code: "COMPANY_FORBIDDEN" });
    });

    await t.test("MFA challenges are single-use, TOTP steps cannot be replayed, and repeated failures lock the user", async () => {
      const identity = particle("mfareplay", "7");
      const session = await service.registerCompany({ ...identity, companyName: "Replay Guard Trade", email: "guard@trade.test", username: "guard.captain" });
      const setup = await service.setupMfa(session.accessToken);
      await service.confirmMfa({ setupToken: setup.setupToken, code: authenticatorCode(setup.secret) });
      const usedCode = authenticatorCode(setup.secret);
      const pending = await service.particleSession(identity);
      await service.verifyMfa({ mfaToken: pending.mfaToken, code: usedCode });
      await assert.rejects(service.verifyMfa({ mfaToken: pending.mfaToken, code: usedCode }), { code: "MFA_TOKEN_USED" });

      const replay = await service.particleSession(identity);
      await assert.rejects(service.verifyMfa({ mfaToken: replay.mfaToken, code: usedCode }), { code: "MFA_INVALID" });
      for (let attempt = 0; attempt < 3; attempt++) {
        await assert.rejects(service.verifyMfa({ mfaToken: replay.mfaToken, code: "invalid" }), { code: "MFA_INVALID" });
      }
      await assert.rejects(service.verifyMfa({ mfaToken: replay.mfaToken, code: "invalid" }), { code: "MFA_LOCKED" });
      const another = await service.particleSession(identity);
      await assert.rejects(service.verifyMfa({ mfaToken: another.mfaToken, code: usedCode }), { code: "MFA_LOCKED" });
      const state = (await pool.query("SELECT failed_attempts, locked_until, last_accepted_step FROM mfa_credentials WHERE user_id = $1", [session.user.id])).rows[0];
      assert.equal(state.failed_attempts, 5);
      assert.ok(state.locked_until);
      assert.ok(state.last_accepted_step);
      const challengeState = (await pool.query("SELECT attempts, consumed_at FROM mfa_challenges WHERE user_id = $1 ORDER BY created_at", [session.user.id])).rows;
      assert.ok(challengeState.some((challenge) => challenge.consumed_at));
      assert.ok(challengeState.some((challenge) => challenge.attempts === 5));
    });

    await t.test("legacy JSON import is explicit, idempotent, conflict-reported, and preserves MFA", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "stern-pg-import-"));
      const file = path.join(tempDir, "identities.json");
      const createdAt = "2026-01-01T00:00:00.000Z";
      const legacy = {
        companies: [{ id: "legacy_company", name: "Legacy Trade", ownerUserId: "legacy_owner", createdAt }],
        users: [{ id: "legacy_owner", companyId: "legacy_company", email: "legacy@trade.test", username: "legacy.captain", walletAddress: safe("6"), role: "owner", createdAt, mfa: { enabled: true, secret: "JBSWY3DPEHPK3PXP", enabledAt: createdAt } }]
      };
      try {
        fs.writeFileSync(file, JSON.stringify(legacy));
        const first = await importLegacyIdentities({ pool, filePath: file, logger: silent });
        assert.equal(first.users.inserted, 1);
        const second = await importLegacyIdentities({ pool, filePath: file, logger: silent });
        assert.equal(second.users.unchanged, 1);
        const pending = await service.particleSession({ ...particle("legacy", "6") });
        assert.equal(pending.mfaRequired, true);
        assert.equal((await pool.query("SELECT provider FROM auth_identities WHERE user_id = 'legacy_owner'")).rows[0].provider, "legacy");
        const linked = await service.verifyMfa({ mfaToken: pending.mfaToken, code: authenticatorCode(legacy.users[0].mfa.secret) });
        assert.equal(linked.user.id, "legacy_owner");
        assert.equal(linked.user.particleUserId, "particle-legacy-12345678");
        assert.equal(linked.user.mfaEnabled, true);
        legacy.users[0].email = "changed@trade.test";
        fs.writeFileSync(file, JSON.stringify(legacy));
        await assert.rejects(importLegacyIdentities({ pool, filePath: file, logger: silent }), /conflict/i);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  } finally {
    await pool.end();
    await socket.stop();
    await db.close();
  }
});

test("Particle verifier requires a verified EVM wallet", async () => {
  const verifier = createParticleAuthService({
    projectId: "test-project", serverKey: "test-key",
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: { uuid: "particle-no-wallet-12345", wallets: [] } }) })
  });
  await assert.rejects(verifier.verify({ uuid: "particle-no-wallet-12345", token: "valid" }), { code: "PARTICLE_WALLET_MISSING" });
});
