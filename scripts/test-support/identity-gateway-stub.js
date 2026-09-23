// Browser-demo gateways use the real PostgreSQL identity service against an
// isolated in-memory database. This file is test support only: it trusts the
// browser's Particle fields, whereas the production gateway verifies the
// Particle token server-side and independently derives the Safe account.
const { PGlite } = require("@electric-sql/pglite");
const { PGLiteSocketServer } = require("@electric-sql/pglite-socket");
const { createIdentityPool, runMigrations } = require("../../backend/oracle-gateway/db/migrate");
const { createIdentityService } = require("../../backend/oracle-gateway/identityService");

async function installStubIdentityRoutes(app) {
  const database = await PGlite.create();
  const socket = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0, maxConnections: 10 });
  await socket.start();
  const pool = createIdentityPool("postgresql://stern:stern@" + socket.getServerConn() + "/stern");
  await runMigrations({ pool });
  const identities = createIdentityService({ pool, tokenSecret: "stub-only-secret-for-browser-tests-0000" });
  const bearer = (req) => (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const route = (handler) => async (req, res, next) => {
    try { await handler(req, res); } catch (error) { next(error); }
  };
  const particle = (body) => {
    const uuid = String(body?.particleIdentity?.uuid || "").trim();
    const token = String(body?.particleIdentity?.token || "").trim();
    const address = body?.smartAccountAddress || body?.walletAddress;
    if (!uuid || !token || !address) {
      const error = new Error("Sign in with Particle in the browser demo first.");
      error.statusCode = 401;
      error.code = "PARTICLE_AUTH_REQUIRED";
      throw error;
    }
    return { particleUserId: uuid, ownerAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", smartAccountAddress: address };
  };

  app.post("/auth/particle/session", route(async (req, res) => res.json(await identities.particleSession(particle(req.body)))));
  app.post("/auth/register-company", route(async (req, res) => {
    res.status(201).json(await identities.registerCompany({ ...req.body, ...particle(req.body) }));
  }));
  app.post("/auth/accept-invitation", route(async (req, res) => res.json(await identities.acceptInvitation({ ...req.body, ...particle(req.body) }))));
  app.post("/auth/login", (_req, res) => res.status(410).json({ code: "PARTICLE_AUTH_REQUIRED", error: "Use Particle Auth." }));
  app.get("/auth/me", route(async (req, res) => {
    const { user, company } = await identities.authenticate(bearer(req));
    res.json({ user, company });
  }));
  app.patch("/auth/me", route(async (req, res) => res.json(await identities.updateProfile(bearer(req), req.body || {}))));
  app.get("/auth/memberships", route(async (req, res) => res.json(await identities.userMemberships(bearer(req)))));
  app.post("/auth/switch-company", route(async (req, res) => res.json(await identities.switchCompany(bearer(req), req.body?.companyId))));
  app.post("/auth/mfa/setup", route(async (req, res) => res.json(await identities.setupMfa(bearer(req)))));
  app.post("/auth/mfa/confirm", route(async (req, res) => res.json(await identities.confirmMfa(req.body || {}))));
  app.post("/auth/mfa/verify", route(async (req, res) => res.json(await identities.verifyMfa(req.body || {}))));
  app.get("/companies/:companyId/users", route(async (req, res) => res.json(await identities.companyUsers(bearer(req), req.params.companyId))));
  app.post("/companies/:companyId/invitations", route(async (req, res) => res.status(201).json(await identities.createInvitation(bearer(req), req.params.companyId, req.body || {}))));

  return async () => { await pool.end(); await socket.stop(); await database.close(); };
}

module.exports = { installStubIdentityRoutes };
