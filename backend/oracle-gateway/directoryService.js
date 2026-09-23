// An address book, so creating an escrow does not mean pasting hex.
//
// The problem it solves: the New escrow form asks for the exporter's and the
// arbiter's wallet addresses, and a mistyped address sends a settlement
// somewhere unrecoverable. Nobody reads 42 hex characters carefully twice.
//
// What it is NOT, and this matters: verified identity. A handle here is
// self-chosen and nothing proves the person claiming "gayocoffee" is that
// company. Anyone who can reach this gateway can claim a free handle. So the
// resolved address is always returned alongside the handle and the UI keeps it
// visible and editable — the handle is a convenience for finding an address a
// human then confirms, never an assertion about who owns it.
//
// Two cheap protections are still worth having, and both are enforced below: a
// handle cannot be taken from the address that already holds it, and a lookup
// will not enumerate the whole book.
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");

const HANDLE = /^[a-z0-9][a-z0-9_.-]{1,31}$/;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
// Two characters is enough to be a deliberate search and short enough to be
// useful; an empty or one-character query would hand out the whole directory,
// which is a list of who uses this deployment.
const MIN_QUERY = 2;
const MAX_RESULTS = 10;

function storePath() {
  return config.directoryStoreFile || path.resolve(__dirname, "../data/directory.json");
}

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(entries) {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Temp file then rename, so an interrupted write cannot leave the store
  // half-parsed and lose every entry in it.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const normaliseHandle = (value) => String(value || "").trim().toLowerCase();

function publicEntry(entry) {
  return {
    handle: entry.handle,
    displayName: entry.displayName || null,
    smartAccountAddress: entry.smartAccountAddress,
    updatedAt: entry.updatedAt
  };
}

/**
 * Claims a handle for a Smart Account, or updates the one it already holds.
 *
 * Re-claiming is deliberately allowed for the same address — a user renaming
 * themselves is ordinary — and refused for a different one, so a handle someone
 * is already using cannot be pulled out from under them and pointed at another
 * wallet.
 */
function claim({ smartAccountAddress, handle, displayName } = {}) {
  const address = String(smartAccountAddress || "").trim();
  if (!ADDRESS.test(address)) {
    throw appError("A valid Smart Account address is required.", 422, "ADDRESS_INVALID");
  }

  const normalised = normaliseHandle(handle);
  if (!HANDLE.test(normalised)) {
    throw appError(
      "A handle is 2-32 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter or digit.",
      422,
      "HANDLE_INVALID"
    );
  }

  const entries = load();
  const existing = entries[normalised];
  if (existing && existing.smartAccountAddress.toLowerCase() !== address.toLowerCase()) {
    throw appError(`The handle "${normalised}" is already taken.`, 409, "HANDLE_TAKEN");
  }

  // One handle per address: releasing the old one keeps the book from filling
  // with names that resolve to the same wallet.
  for (const [key, entry] of Object.entries(entries)) {
    if (key !== normalised && entry.smartAccountAddress.toLowerCase() === address.toLowerCase()) {
      delete entries[key];
    }
  }

  const name = String(displayName || "").trim().slice(0, 120);
  entries[normalised] = {
    handle: normalised,
    displayName: name || null,
    smartAccountAddress: address,
    updatedAt: new Date().toISOString()
  };
  save(entries);
  return publicEntry(entries[normalised]);
}

/** The handle this address holds, if any. */
function forAddress(smartAccountAddress) {
  const address = String(smartAccountAddress || "").trim();
  if (!ADDRESS.test(address)) {
    throw appError("A valid Smart Account address is required.", 422, "ADDRESS_INVALID");
  }
  const entry = Object.values(load()).find(
    (item) => item.smartAccountAddress.toLowerCase() === address.toLowerCase()
  );
  return entry ? publicEntry(entry) : null;
}

/**
 * Finds counterparties by handle or display name.
 *
 * Refuses a query shorter than two characters rather than returning everything:
 * the directory is a list of who uses this deployment, and handing it over
 * wholesale to anyone who can reach the gateway is not the same thing as
 * helping someone find a counterparty they already know.
 */
function search(query) {
  const q = String(query || "").trim().toLowerCase();
  if (q.length < MIN_QUERY) {
    throw appError(
      `Type at least ${MIN_QUERY} characters. The directory is not listed in full.`,
      422,
      "QUERY_TOO_SHORT"
    );
  }

  const matches = Object.values(load()).filter(
    (entry) =>
      entry.handle.includes(q) || String(entry.displayName || "").toLowerCase().includes(q)
  );

  // A handle that starts with the query is what the searcher most likely meant.
  matches.sort((a, b) => {
    const aStarts = a.handle.startsWith(q) ? 0 : 1;
    const bStarts = b.handle.startsWith(q) ? 0 : 1;
    return aStarts - bStarts || a.handle.localeCompare(b.handle);
  });

  return {
    query: q,
    results: matches.slice(0, MAX_RESULTS).map(publicEntry),
    truncated: matches.length > MAX_RESULTS,
    // Said in the payload as well as the UI, so nothing consuming this can
    // mistake a handle for a verified identity.
    note: "Self-chosen handles. Confirm the address before signing — nothing here proves who owns it."
  };
}

/** Exact resolution, for a handle typed as @name into a form. */
function resolve(handle) {
  const normalised = normaliseHandle(handle).replace(/^@/, "");
  if (!HANDLE.test(normalised)) {
    throw appError("Not a valid handle.", 422, "HANDLE_INVALID");
  }
  const entry = load()[normalised];
  if (!entry) {
    throw appError(`No wallet is registered under "${normalised}".`, 404, "HANDLE_UNKNOWN");
  }
  return publicEntry(entry);
}

module.exports = { claim, forAddress, search, resolve, MIN_QUERY, MAX_RESULTS };
