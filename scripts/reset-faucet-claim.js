// Lets a wallet claim the demo faucet again.
//
//   node scripts/reset-faucet-claim.js 0xYourSmartAccount
//   node scripts/reset-faucet-claim.js --all
//   node scripts/reset-faucet-claim.js --list
//
// Why this is needed after a redeploy: scripts/deploy.js deploys a fresh
// IDRTDemo alongside the escrow, so the balance a wallet held on the old token
// is not visible to the new contract — it reads its token address straight off
// the escrow. The faucet would normally top the wallet up again, except it is
// deliberately once per address and the claim is recorded on disk, so it
// refuses. Clearing that record is the intended way back.
//
// Touches only the claim file. It mints nothing and signs nothing, so it is
// safe to run at any time; the only thing at stake is demo balance.
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");

// Same resolution the gateway uses, so this edits the file actually in play —
// including a DEMO_CLAIMS_FILE pointed at a mounted volume.
const CLAIMS_FILE =
  process.env.DEMO_CLAIMS_FILE || path.resolve(__dirname, "../.demo-claims.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(CLAIMS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function save(claims) {
  // Written via a temp file and renamed, the way the gateway does it, so an
  // interrupted write cannot leave the store half-parsed.
  const tmp = `${CLAIMS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claims, null, 2));
  fs.renameSync(tmp, CLAIMS_FILE);
}

function describe(record) {
  if (!record || typeof record !== "object") return "";
  const parts = [record.role, record.amount && `${record.amount} ${record.currency || ""}`.trim()];
  return parts.filter(Boolean).join(", ");
}

const target = process.argv[2];
const claims = load();
const addresses = Object.keys(claims);

console.log(`berkas klaim : ${CLAIMS_FILE}`);
console.log(`tercatat     : ${addresses.length} alamat\n`);

if (!target || target === "--list") {
  if (!addresses.length) {
    console.log("Kosong. Semua alamat bisa mengklaim faucet.");
  } else {
    for (const address of addresses) console.log(`  ${address}  ${describe(claims[address])}`);
  }
  if (!target) {
    console.log("\nUntuk menghapus satu: node scripts/reset-faucet-claim.js 0x...");
    console.log("Untuk menghapus semua: node scripts/reset-faucet-claim.js --all");
  }
  process.exit(0);
}

if (target === "--all") {
  if (!addresses.length) {
    console.log("Sudah kosong, tidak ada yang dihapus.");
    process.exit(0);
  }
  save({});
  console.log(`Dihapus ${addresses.length} catatan klaim. Semua alamat bisa mengklaim lagi.`);
  process.exit(0);
}

if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
  console.error(`"${target}" bukan alamat EVM yang sah.`);
  process.exit(2);
}

// Addresses are stored as the gateway normalised them, which may differ in
// letter case from what a user pastes. Match case-insensitively so a correct
// address is never reported as absent.
const match = addresses.find((address) => address.toLowerCase() === target.toLowerCase());

if (!match) {
  console.log(`${target} tidak ada di catatan. Alamat itu sudah bisa mengklaim faucet.`);
  process.exit(0);
}

delete claims[match];
save(claims);
console.log(`Catatan klaim untuk ${match} dihapus.`);
console.log("Alamat itu sekarang bisa menekan Claim demo balance sekali lagi.");
