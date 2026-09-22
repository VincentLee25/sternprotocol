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

const store = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stern-dir-")), "directory.json");
process.env.DIRECTORY_STORE_FILE = store;

const express = require("express");
const cors = require("cors");
const directory = require("../../backend/oracle-gateway/directoryService");

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
