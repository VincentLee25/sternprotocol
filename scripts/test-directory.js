// The counterparty address book: claiming handles, resolving them, and the
// refusals that keep it from becoming a way to redirect a settlement.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stern-dir-")), "directory.json");
process.env.DIRECTORY_STORE_FILE = STORE;

const directory = require("../backend/oracle-gateway/directoryService.js");

let pass = 0;
let fail = 0;
function check(label, actual, expected) {
  if (String(actual) === String(expected)) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} — expected ${expected}, got ${actual}`);
  }
}
function refuses(label, fn, code) {
  try {
    fn();
    fail += 1;
    console.log(`  FAIL ${label} — it was accepted`);
  } catch (error) {
    check(label, error.code, code);
  }
}

const A = "0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381";
const B = "0x0997657e121213909bE3E9d7701df0753Fb102ed";

console.log("\n1. claiming a handle");
const gayo = directory.claim({ smartAccountAddress: A, handle: "GayoCoffee", displayName: "PT Gayo Highland Coffee" });
check("handle is lowercased", gayo.handle, "gayocoffee");
check("address kept as given", gayo.smartAccountAddress, A);
check("display name kept", gayo.displayName, "PT Gayo Highland Coffee");

console.log("\n2. resolving it");
check("resolve by handle", directory.resolve("gayocoffee").smartAccountAddress, A);
check("resolve tolerates a leading @", directory.resolve("@gayocoffee").smartAccountAddress, A);
check("resolve is case-insensitive", directory.resolve("GayoCoffee").smartAccountAddress, A);
refuses("unknown handle is a 404", () => directory.resolve("nobody"), "HANDLE_UNKNOWN");

console.log("\n3. a handle cannot be pointed at another wallet");
// The whole risk of an address book in a payments app: taking a name someone
// is already known by and aiming it at a different address.
refuses("another address cannot take it", () => directory.claim({ smartAccountAddress: B, handle: "gayocoffee" }), "HANDLE_TAKEN");
check("still resolves to the original", directory.resolve("gayocoffee").smartAccountAddress, A);

console.log("\n4. the owner can rename itself");
const renamed = directory.claim({ smartAccountAddress: A, handle: "gayo-highland", displayName: "PT Gayo Highland Coffee" });
check("new handle", renamed.handle, "gayo-highland");
refuses("the old handle is released", () => directory.resolve("gayocoffee"), "HANDLE_UNKNOWN");
check("one handle per address", directory.forAddress(A).handle, "gayo-highland");

console.log("\n5. malformed input is refused");
refuses("bad address", () => directory.claim({ smartAccountAddress: "0x123", handle: "x1" }), "ADDRESS_INVALID");
refuses("handle too short", () => directory.claim({ smartAccountAddress: B, handle: "a" }), "HANDLE_INVALID");
refuses("handle with spaces", () => directory.claim({ smartAccountAddress: B, handle: "two words" }), "HANDLE_INVALID");
refuses("handle starting with a dash", () => directory.claim({ smartAccountAddress: B, handle: "-x" }), "HANDLE_INVALID");

console.log("\n6. the directory is not listed in full");
directory.claim({ smartAccountAddress: B, handle: "rotterdam-beans", displayName: "Rotterdam Green Beans B.V." });
refuses("empty query", () => directory.search(""), "QUERY_TOO_SHORT");
refuses("one character", () => directory.search("g"), "QUERY_TOO_SHORT");

console.log("\n7. searching");
const hit = directory.search("gayo");
check("finds by handle", hit.results.length, 1);
check("returns the address for confirmation", hit.results[0].smartAccountAddress, A);
check("carries the caveat", /nothing here proves/.test(hit.note), true);
check("finds by display name", directory.search("rotterdam").results.length, 1);
check("no match is an empty list, not an error", directory.search("zzzz").results.length, 0);

const prefix = directory.search("ga");
check("prefix match sorts first", prefix.results[0].handle, "gayo-highland");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
