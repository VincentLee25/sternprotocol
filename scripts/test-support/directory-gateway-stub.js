// A gateway with nothing in it but the directory, for browser-testing the
// handle lookup without an RPC, a contract or an IPFS provider.
//
// It mounts the REAL directoryService against a throwaway store file, so what
// the browser talks to is the shipped logic — including its refusals — and not
// a second hand-written implementation that could agree with the UI while the
// gateway disagrees.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "stern-dir-"));
const store = path.join(tmp, "directory.json");
process.env.DIRECTORY_STORE_FILE = store;
process.env.IDENTITY_STORE_FILE = path.join(tmp, "identities.json");
// Long enough for identityService's own minimum. Throwaway, and never reused
// from the documentation's examples.
process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || "stub-only-secret-for-browser-tests-0000";

const express = require("express");
const cors = require("cors");
const directory = require("../../backend/oracle-gateway/directoryService");
const { createIdentityService } = require("../../backend/oracle-gateway/identityService");

// Seeded before the server listens, so the first search in the browser has
// something to find.
const SEED = [
  { handle: "gayocoffee", displayName: "PT Gayo Highland Coffee", smartAccountAddress: "0x1111111111111111111111111111111111111111" },
  { handle: "gayo.export", displayName: "Gayo Export Cooperative", smartAccountAddress: "0x2222222222222222222222222222222222222222" },
  { handle: "rotterdam-beans", displayName: "Rotterdam Beans BV", smartAccountAddress: "0x3333333333333333333333333333333333333333" },
  { handle: "sucofindo", displayName: "PT SUCOFINDO", smartAccountAddress: "0x4444444444444444444444444444444444444444" }
];
for (const entry of SEED) directory.claim(entry);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true, stub: true }));

// Company sign-in, because the workspace is now reached through it. The real
// identityService against a throwaway store.
const identities = createIdentityService({
  storeFile: process.env.IDENTITY_STORE_FILE,
  tokenSecret: process.env.AUTH_TOKEN_SECRET
});
const bearer = (req) => (req.get("authorization") || "").replace(/^Bearer\s+/i, "");

app.post("/auth/register-company", (req, res, next) => {
  try { res.status(201).json(identities.registerCompany(req.body || {})); } catch (error) { next(error); }
});
app.post("/auth/login", (req, res, next) => {
  try { res.json(identities.login(req.body || {})); } catch (error) { next(error); }
});
app.get("/auth/me", (req, res, next) => {
  try {
    const identity = identities.authenticate(bearer(req));
    res.json({ user: identities.publicUser(identity.user), company: identities.publicCompany(identity.company) });
  } catch (error) { next(error); }
});

app.post("/directory/claim", (req, res, next) => {
  try { res.json(directory.claim(req.body || {})); } catch (error) { next(error); }
});
app.get("/directory/lookup", (req, res, next) => {
  try { res.json(directory.search(req.query.q)); } catch (error) { next(error); }
});
app.get("/directory/resolve/:handle", (req, res, next) => {
  try { res.json(directory.resolve(req.params.handle)); } catch (error) { next(error); }
});
app.get("/directory/address/:smartAccountAddress", (req, res, next) => {
  try { res.json({ entry: directory.forAddress(req.params.smartAccountAddress) }); } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
});

const port = Number(process.env.PORT || 4111);
app.listen(port, () => console.log(`directory stub on :${port} (store ${store})`));
