const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createIdentityPool, runMigrations } = require("./migrate");

const VALID_ROLES = new Set(["owner", "admin", "operator"]);

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function importError(problems) {
  const lines = problems.slice(0, 30).map((problem) => ` - ${problem}`);
  if (problems.length > 30) lines.push(` - ...and ${problems.length - 30} more conflict(s).`);
  return new Error(`Legacy identity import cannot proceed (${problems.length} conflict(s)):\n${lines.join("\n")}`);
}

function normalizeDate(value, label, problems) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    problems.push(`${label} has an invalid createdAt timestamp.`);
    return null;
  }
  return date;
}

function uniqueSourceValue(map, value, label, owner, problems) {
  if (map.has(value)) problems.push(`${label} ${value} is duplicated by ${map.get(value)} and ${owner}.`);
  else map.set(value, owner);
}

function parseLegacyStore(filePath) {
  if (!filePath) throw new Error("Pass the legacy identities.json path explicitly with --file.");
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read legacy identity file ${filePath}: ${error.message}`);
  }
  if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.users)) {
    throw new Error("Legacy identity file must contain companies[] and users[] arrays.");
  }

  const problems = [];
  const companyIds = new Map();
  const userIds = new Map();
  const emails = new Map();
  const usernames = new Map();
  const wallets = new Map();
  const particleSubjects = new Map();
  const companies = parsed.companies.map((item, index) => {
    const label = `company row ${index + 1}`;
    const id = String(item?.id || "").trim();
    const name = String(item?.name || "").trim();
    const ownerUserId = String(item?.ownerUserId || "").trim();
    if (!id) problems.push(`${label} has no ID.`);
    if (!name) problems.push(`${label} has no name.`);
    if (!ownerUserId) problems.push(`${label} has no ownerUserId.`);
    if (id) uniqueSourceValue(companyIds, id, "Company ID", label, problems);
    return { id, name, ownerUserId, createdAt: normalizeDate(item?.createdAt, label, problems) };
  });
  const users = parsed.users.map((item, index) => {
    const label = `user row ${index + 1}`;
    const id = String(item?.id || "").trim();
    const companyId = String(item?.companyId || "").trim();
    const email = String(item?.email || "").trim().toLowerCase();
    const username = String(item?.username || "").trim().toLowerCase();
    const wallet = String(item?.walletAddress || "").trim().toLowerCase();
    const role = String(item?.role || "").trim().toLowerCase();
    const particleUserId = item?.particleUserId ? String(item.particleUserId).trim() : null;
    const mfaEnabled = item?.mfa?.enabled === true;
    const mfaSecret = item?.mfa?.secret ? String(item.mfa.secret).trim() : null;
    if (!id) problems.push(`${label} has no ID.`);
    if (!companyId) problems.push(`${label} has no companyId.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`${label} has an invalid email.`);
    if (!username) problems.push(`${label} has no username.`);
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) problems.push(`${label} has an invalid walletAddress.`);
    if (!VALID_ROLES.has(role)) problems.push(`${label} has an invalid role ${role || "(empty)"}.`);
    if (mfaEnabled && !mfaSecret) problems.push(`${label} has MFA enabled but no TOTP secret.`);
    if (id) uniqueSourceValue(userIds, id, "User ID", label, problems);
    if (email) uniqueSourceValue(emails, email, "Email", label, problems);
    if (username) uniqueSourceValue(usernames, username, "Username", label, problems);
    if (wallet) uniqueSourceValue(wallets, wallet, "Safe wallet", label, problems);
    if (particleUserId) uniqueSourceValue(particleSubjects, particleUserId, "Particle identity", label, problems);
    return {
      id, companyId, email, username, wallet, role, particleUserId,
      mfaEnabled, mfaSecret,
      createdAt: normalizeDate(item?.createdAt, label, problems),
      mfaCreatedAt: normalizeDate(item?.mfa?.enabledAt || item?.createdAt, `${label} MFA`, problems)
    };
  });

  for (const company of companies) {
    const owner = users.find((user) => user.id === company.ownerUserId);
    if (!owner) problems.push(`Company ${company.id} owner ${company.ownerUserId} is missing from the legacy users.`);
    else if (owner.companyId !== company.id || owner.role !== "owner") {
      problems.push(`Company ${company.id} owner ${owner.id} must have that companyId and the owner role.`);
    }
  }
  for (const user of users) {
    if (!companyIds.has(user.companyId)) problems.push(`User ${user.id} references missing company ${user.companyId}.`);
    if (user.role === "owner" && companies.find((company) => company.id === user.companyId)?.ownerUserId !== user.id) {
      problems.push(`User ${user.id} has owner role but is not the recorded company owner.`);
    }
  }
  if (problems.length) throw importError(problems);
  return { companies, users };
}

function existingBy(rows, keyFn) {
  return new Map(rows.map((row) => [keyFn(row), row]));
}

function sameTime(a, b) {
  return new Date(a).getTime() === new Date(b).getTime();
}

async function importLegacyIdentities({ pool, filePath, logger = console, dryRun = false } = {}) {
  if (!pool) throw new Error("A PostgreSQL pool is required for legacy identity import.");
  const source = parseLegacyStore(filePath);
  const client = await pool.connect();
  const report = {
    companies: { inserted: 0, unchanged: 0 },
    users: { inserted: 0, unchanged: 0 },
    memberships: { inserted: 0, unchanged: 0 },
    authIdentities: { inserted: 0, unchanged: 0 },
    mfaCredentials: { inserted: 0, unchanged: 0 },
    dryRun
  };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["stern_identity_legacy_import"]);
    // A transaction owns one client: query it sequentially (pg 9 rejects
    // concurrent client.query calls even when they happen to queue today).
    const companyResult = await client.query("SELECT id, name, owner_user_id, created_at FROM companies");
    const userResult = await client.query("SELECT id, email, username, created_at FROM users");
    const membershipResult = await client.query("SELECT id, user_id, company_id, role, created_at FROM memberships");
    const authResult = await client.query("SELECT id, user_id, provider, provider_subject, smart_account_address FROM auth_identities");
    const mfaResult = await client.query("SELECT user_id, enabled, secret, created_at FROM mfa_credentials");
    const dbCompanies = existingBy(companyResult.rows, (row) => row.id);
    const dbUsers = existingBy(userResult.rows, (row) => row.id);
    const dbEmails = existingBy(userResult.rows, (row) => row.email.toLowerCase());
    const dbUsernames = existingBy(userResult.rows, (row) => row.username.toLowerCase());
    const dbMemberships = existingBy(membershipResult.rows, (row) => `${row.user_id}:${row.company_id}`);
    const dbMembershipIds = existingBy(membershipResult.rows, (row) => row.id);
    const dbAuthWallets = existingBy(authResult.rows, (row) => row.smart_account_address.toLowerCase());
    const dbAuthSubjects = existingBy(authResult.rows, (row) => `${row.provider}:${row.provider_subject}`);
    const dbAuthIds = existingBy(authResult.rows, (row) => row.id);
    const dbMfa = existingBy(mfaResult.rows, (row) => row.user_id);
    const problems = [];

    for (const company of source.companies) {
      const prior = dbCompanies.get(company.id);
      if (prior && (prior.name !== company.name || prior.owner_user_id !== company.ownerUserId || !sameTime(prior.created_at, company.createdAt))) {
        problems.push(`Company ID ${company.id} already exists with different name, owner, or creation date.`);
      }
    }
    for (const user of source.users) {
      const prior = dbUsers.get(user.id);
      if (prior && (prior.email.toLowerCase() !== user.email || prior.username.toLowerCase() !== user.username || !sameTime(prior.created_at, user.createdAt))) {
        problems.push(`User ID ${user.id} already exists with different email, username, or creation date.`);
      }
      if (dbEmails.get(user.email) && dbEmails.get(user.email).id !== user.id) {
        problems.push(`Email ${user.email} already belongs to another PostgreSQL user (${dbEmails.get(user.email).id}).`);
      }
      if (dbUsernames.get(user.username) && dbUsernames.get(user.username).id !== user.id) {
        problems.push(`Username ${user.username} already belongs to another PostgreSQL user (${dbUsernames.get(user.username).id}).`);
      }
      const membershipId = stableId("membership", `${user.id}:${user.companyId}`);
      const membership = dbMemberships.get(`${user.id}:${user.companyId}`);
      const membershipById = dbMembershipIds.get(membershipId);
      if (membership && (membership.role !== user.role || !sameTime(membership.created_at, user.createdAt))) {
        problems.push(`Membership ${user.id}/${user.companyId} already exists with different role or creation date.`);
      }
      if (membershipById && (membershipById.user_id !== user.id || membershipById.company_id !== user.companyId)) {
        problems.push(`Generated membership ID ${membershipId} already belongs to another membership.`);
      }

      const provider = user.particleUserId ? "particle" : "legacy";
      const subject = user.particleUserId || user.wallet;
      const authId = stableId("auth", `${provider}:${subject}`);
      const authByWallet = dbAuthWallets.get(user.wallet);
      const authBySubject = dbAuthSubjects.get(`${provider}:${subject}`);
      const authById = dbAuthIds.get(authId);
      if (authByWallet && authByWallet.user_id !== user.id) {
        problems.push(`Safe wallet ${user.wallet} already belongs to another PostgreSQL user (${authByWallet.user_id}).`);
      }
      if (authByWallet && authByWallet.user_id === user.id && (provider === "particle" || authByWallet.provider === "legacy") &&
          (authByWallet.provider !== provider || authByWallet.provider_subject !== subject)) {
        problems.push(`Safe wallet ${user.wallet} is linked to a different provider identity for user ${user.id}.`);
      }
      if (authBySubject && (authBySubject.user_id !== user.id || authBySubject.smart_account_address.toLowerCase() !== user.wallet)) {
        problems.push(`Provider identity ${provider}/${subject} already belongs to a different user or Safe wallet.`);
      }
      if (authById && (authById.user_id !== user.id || authById.provider !== provider || authById.provider_subject !== subject)) {
        problems.push(`Generated auth ID ${authId} already belongs to a different provider identity.`);
      }

      const mfa = dbMfa.get(user.id);
      if (mfa && (mfa.enabled !== user.mfaEnabled || (mfa.secret || null) !== user.mfaSecret || !sameTime(mfa.created_at, user.mfaCreatedAt))) {
        problems.push(`MFA credential for user ${user.id} already exists with different state, secret, or creation date.`);
      }
    }
    if (problems.length) throw importError(problems);

    for (const user of source.users) {
      if (dbUsers.has(user.id)) report.users.unchanged++;
      else {
        await client.query(
          "INSERT INTO users (id, email, username, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)",
          [user.id, user.email, user.username, user.createdAt]
        );
        report.users.inserted++;
      }
    }
    for (const company of source.companies) {
      if (dbCompanies.has(company.id)) report.companies.unchanged++;
      else {
        await client.query(
          "INSERT INTO companies (id, name, owner_user_id, created_at) VALUES ($1, $2, $3, $4)",
          [company.id, company.name, company.ownerUserId, company.createdAt]
        );
        report.companies.inserted++;
      }
    }
    for (const user of source.users) {
      const membershipKey = `${user.id}:${user.companyId}`;
      if (dbMemberships.has(membershipKey)) report.memberships.unchanged++;
      else {
        await client.query(
          "INSERT INTO memberships (id, user_id, company_id, role, created_at) VALUES ($1, $2, $3, $4, $5)",
          [stableId("membership", membershipKey), user.id, user.companyId, user.role, user.createdAt]
        );
        report.memberships.inserted++;
      }
      const provider = user.particleUserId ? "particle" : "legacy";
      const subject = user.particleUserId || user.wallet;
      const priorAuth = dbAuthWallets.get(user.wallet);
      if (priorAuth) report.authIdentities.unchanged++;
      else {
        await client.query(
          `INSERT INTO auth_identities
           (id, user_id, provider, provider_subject, eoa_owner_address, smart_account_address, created_at)
           VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
          [stableId("auth", `${provider}:${subject}`), user.id, provider, subject, user.wallet, user.createdAt]
        );
        report.authIdentities.inserted++;
      }
      if (dbMfa.has(user.id)) report.mfaCredentials.unchanged++;
      else {
        await client.query(
          "INSERT INTO mfa_credentials (user_id, enabled, secret, created_at, updated_at) VALUES ($1, $2, $3, $4, $4)",
          [user.id, user.mfaEnabled, user.mfaSecret, user.mfaCreatedAt]
        );
        report.mfaCredentials.inserted++;
      }
    }
    if (dryRun) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    logger.info?.(`STERN legacy identity import ${dryRun ? "dry run" : "committed"}: ${JSON.stringify(report)}`);
    return report;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original error. */ }
    if (error.code === "23505" || error.code === "23503" || error.code === "23514") {
      throw new Error(`Legacy import rejected by PostgreSQL constraint ${error.constraint || error.code}: ${error.detail || error.message}. No identity records were imported.`);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  if (fileIndex < 0 || !args[fileIndex + 1]) {
    throw new Error("Usage: node backend/oracle-gateway/db/importLegacyIdentities.js --file <identities.json> [--dry-run]");
  }
  const pool = createIdentityPool();
  try {
    await runMigrations({ pool });
    await importLegacyIdentities({ pool, filePath: path.resolve(args[fileIndex + 1]), dryRun: args.includes("--dry-run") });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { importLegacyIdentities, parseLegacyStore };
