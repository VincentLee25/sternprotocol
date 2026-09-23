const crypto = require("crypto");

const SESSION_TTL = 8 * 60 * 60;
const MFA_TTL = 5 * 60;
const MFA_MAX_ATTEMPTS = 5;
const MFA_LOCKOUT_MS = 10 * 60 * 1000;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function appError(message, statusCode = 400, code = "IDENTITY_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const makeId = (prefix) => `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
const emailValue = (value) => String(value || "").trim().toLowerCase();
const handleValue = (value) => String(value || "").trim().replace(/^@/, "").toLowerCase();
const addressValue = (value) => String(value || "").trim().toLowerCase();
const iso = (value) => value ? new Date(value).toISOString() : null;

function validEmail(value) {
  const email = emailValue(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw appError("A valid work email is required.", 422, "EMAIL_INVALID");
  return email;
}

function validHandle(value) {
  const username = handleValue(value);
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
    throw appError("Choose a STERN handle with 3–32 letters, digits, dots, dashes, or underscores.", 422, "USERNAME_INVALID");
  }
  return username;
}

function validCompanyName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 120) throw appError("Company name must be 2–120 characters.", 422, "COMPANY_INVALID");
  return name;
}

function validParticle(input) {
  const particleUserId = String(input?.particleUserId || "").trim();
  const ownerAddress = addressValue(input?.ownerAddress);
  const smartAccountAddress = addressValue(input?.smartAccountAddress || input?.walletAddress);
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(particleUserId)) throw appError("A verified Particle identity is required.", 422, "PARTICLE_ID_INVALID");
  if (!/^0x[a-f0-9]{40}$/.test(ownerAddress) || !/^0x[a-f0-9]{40}$/.test(smartAccountAddress)) {
    throw appError("A verified Particle owner and Safe account are required.", 422, "PARTICLE_ACCOUNT_INVALID");
  }
  return { particleUserId, ownerAddress, smartAccountAddress };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id, companyId: user.companyId ?? user.company_id,
    email: user.email, username: user.username,
    walletAddress: user.walletAddress ?? user.smart_account_address ?? null,
    // The verified Particle owner EOA is distinct from the Safe used for
    // escrow transactions. Human clause reviewers are identified by this EOA.
    eoaOwnerAddress: user.eoaOwnerAddress ?? user.eoa_owner_address ?? null,
    particleUserId: user.particleUserId ?? (user.provider === "particle" ? user.provider_subject : null),
    role: user.role, mfaEnabled: Boolean(user.mfaEnabled ?? user.mfa_enabled),
    createdAt: iso(user.createdAt ?? user.created_at)
  };
}

function publicCompany(company) {
  if (!company) return null;
  return {
    id: company.id, name: company.name,
    ownerUserId: company.ownerUserId ?? company.owner_user_id,
    createdAt: iso(company.createdAt ?? company.created_at)
  };
}

function mapDatabaseError(error) {
  if (error?.code !== "23505") return error;
  switch (error.constraint) {
    case "users_email_lower_unique": return appError("Work email is already registered.", 409, "EMAIL_EXISTS");
    case "users_username_lower_unique": return appError("That STERN handle is already taken.", 409, "USERNAME_EXISTS");
    case "auth_identities_provider_subject_unique": return appError("This Particle account is already linked.", 409, "PARTICLE_ID_EXISTS");
    case "auth_identities_smart_account_lower_unique": return appError("This Safe account is already linked.", 409, "WALLET_EXISTS");
    case "memberships_user_company_unique": return appError("This person is already a company member.", 409, "MEMBERSHIP_EXISTS");
    default: return appError("An identity record already exists.", 409, "IDENTITY_EXISTS");
  }
}

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let value = 0; let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let current = 0; const bytes = [];
  for (const char of String(value || "").replace(/=|\s/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw appError("Invalid MFA code.", 422, "MFA_INVALID");
    current = (current << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((current >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 1000 / 30)));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

function matchingTotpStep(secret, code) {
  const candidate = String(code || "").replace(/\s/g, "");
  if (!secret || !/^\d{6}$/.test(candidate)) return null;
  const currentStep = Math.floor(Date.now() / 30000);
  for (const window of [-1, 0, 1]) {
    const step = currentStep + window;
    const expected = totp(secret, step * 30000);
    if (crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) return step;
  }
  return null;
}

function validTotp(secret, code) {
  return matchingTotpStep(secret, code) !== null;
}

function createIdentityService({ pool, tokenSecret }) {
  if (!pool) throw appError("DATABASE_URL must be configured for STERN company identity.", 500, "IDENTITY_DB_MISSING");
  if (!tokenSecret || tokenSecret.length < 32) throw appError("AUTH_TOKEN_SECRET must be at least 32 characters.", 500, "AUTH_SECRET_INVALID");

  function sign(payload, seconds) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url");
    const signature = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  function verify(token) {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) throw appError("Authentication is required.", 401, "TOKEN_INVALID");
    const expected = crypto.createHmac("sha256", tokenSecret).update(body).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      throw appError("Authentication is invalid.", 401, "TOKEN_INVALID");
    }
    let payload;
    try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
    catch { throw appError("Authentication is invalid.", 401, "TOKEN_INVALID"); }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw appError("Session expired. Sign in again.", 401, "TOKEN_EXPIRED");
    return payload;
  }

  async function transaction(task) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const result = await task(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      try { await db.query("ROLLBACK"); } catch { /* Preserve original failure. */ }
      throw mapDatabaseError(error);
    } finally { db.release(); }
  }

  async function loadContext(db, userId, companyId = null) {
    const { rows } = await db.query(`
      SELECT u.id, u.email, u.username, u.created_at AS user_created_at,
             m.id AS membership_id, m.company_id, m.role, m.created_at AS membership_created_at,
             c.name AS company_name, c.owner_user_id, c.created_at AS company_created_at,
             ai.id AS auth_identity_id, ai.provider, ai.provider_subject,
             ai.eoa_owner_address, ai.smart_account_address,
             COALESCE(mfa.enabled, false) AS mfa_enabled, mfa.secret AS mfa_secret
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      JOIN companies c ON c.id = m.company_id
      LEFT JOIN LATERAL (
        SELECT id, provider, provider_subject, eoa_owner_address, smart_account_address
        FROM auth_identities WHERE user_id = u.id
        ORDER BY CASE WHEN provider = 'particle' THEN 0 ELSE 1 END, created_at, id LIMIT 1
      ) ai ON true
      LEFT JOIN mfa_credentials mfa ON mfa.user_id = u.id
      WHERE u.id = $1 AND ($2::text IS NULL OR m.company_id = $2)
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at, m.id
      LIMIT 1
    `, [userId, companyId]);
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      user: {
        id: row.id, companyId: row.company_id, email: row.email, username: row.username,
        walletAddress: row.smart_account_address,
        eoaOwnerAddress: row.eoa_owner_address,
        particleUserId: row.provider === "particle" ? row.provider_subject : null,
        role: row.role, mfaEnabled: row.mfa_enabled, createdAt: row.user_created_at
      },
      company: { id: row.company_id, name: row.company_name, ownerUserId: row.owner_user_id, createdAt: row.company_created_at },
      membership: { id: row.membership_id, userId: row.id, companyId: row.company_id, role: row.role, createdAt: iso(row.membership_created_at) },
      mfaSecret: row.mfa_secret, authIdentityId: row.auth_identity_id
    };
  }

  function issueSession(context) {
    return {
      accessToken: sign({ type: "session", auth: "particle", userId: context.user.id, companyId: context.company.id }, SESSION_TTL),
      expiresIn: SESSION_TTL
    };
  }

  function sessionResponse(context) {
    return { registered: true, mfaRequired: false, user: publicUser(context.user), company: publicCompany(context.company), ...issueSession(context) };
  }

  async function mfaChallenge(db, context, identity, authIdentityId, extra = {}) {
    const challengeId = makeId("mfa");
    const companyId = extra.companyId || context.company.id;
    await db.query(`INSERT INTO mfa_challenges
      (id, user_id, company_id, auth_identity_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)`,
    [challengeId, context.user.id, companyId, authIdentityId, new Date(Date.now() + MFA_TTL * 1000)]);
    return {
      registered: true, mfaRequired: true,
      mfaToken: sign({
        type: "mfa", challengeId, userId: context.user.id, companyId,
        authIdentityId, particleUserId: identity.particleUserId,
        ownerAddress: identity.ownerAddress, smartAccountAddress: identity.smartAccountAddress,
        ...extra
      }, MFA_TTL)
    };
  }

  async function sessionContext(token, db = pool) {
    const payload = verify(token);
    if (payload.type !== "session" || payload.auth !== "particle" || !payload.userId || !payload.companyId) {
      throw appError("Authenticate with Particle to access the workspace.", 401, "TOKEN_INVALID");
    }
    const context = await loadContext(db, payload.userId, payload.companyId);
    if (!context) throw appError("Company membership no longer exists.", 401, "MEMBERSHIP_MISSING");
    if (!context.user.particleUserId) throw appError("Particle identity is no longer linked to this account.", 401, "PARTICLE_ID_MISSING");
    return context;
  }

  async function authenticate(token) {
    const context = await sessionContext(token);
    return { user: publicUser(context.user), company: publicCompany(context.company), membership: context.membership };
  }

  async function particleAuthRow(db, identity) {
    const { rows } = await db.query(`
      SELECT id, user_id, provider, provider_subject, eoa_owner_address, smart_account_address
      FROM auth_identities
      WHERE (provider = 'particle' AND provider_subject = $1) OR lower(smart_account_address) = $2
      FOR UPDATE
    `, [identity.particleUserId, identity.smartAccountAddress]);
    const bySubject = rows.find((row) => row.provider === "particle" && row.provider_subject === identity.particleUserId);
    const bySafe = rows.find((row) => addressValue(row.smart_account_address) === identity.smartAccountAddress);
    if (bySubject && addressValue(bySubject.smart_account_address) !== identity.smartAccountAddress) {
      throw appError("This Particle identity is linked to another Safe account.", 403, "PARTICLE_WALLET_MISMATCH");
    }
    if (bySubject && bySafe && bySubject.id !== bySafe.id) throw appError("This Safe account belongs to another identity.", 403, "PARTICLE_WALLET_CLAIMED");
    const row = bySubject || bySafe;
    if (!row) return null;
    if (row.provider !== "legacy" && (row.provider !== "particle" || row.provider_subject !== identity.particleUserId)) {
      throw appError("This Safe account belongs to another Particle identity.", 403, "PARTICLE_WALLET_CLAIMED");
    }
    if (row.eoa_owner_address && addressValue(row.eoa_owner_address) !== identity.ownerAddress) {
      throw appError("This Particle owner does not match the linked Safe account.", 403, "PARTICLE_OWNER_MISMATCH");
    }
    return row;
  }

  async function linkParticleIdentity(db, auth, identity) {
    if (auth.provider === "particle") {
      if (!auth.eoa_owner_address) await db.query("UPDATE auth_identities SET eoa_owner_address = $2 WHERE id = $1", [auth.id, identity.ownerAddress]);
      return;
    }
    if (auth.provider !== "legacy" || addressValue(auth.smart_account_address) !== identity.smartAccountAddress) {
      throw appError("This Safe account cannot be linked to this Particle identity.", 403, "PARTICLE_WALLET_MISMATCH");
    }
    await db.query("UPDATE auth_identities SET provider = 'particle', provider_subject = $2, eoa_owner_address = $3 WHERE id = $1", [auth.id, identity.particleUserId, identity.ownerAddress]);
  }

  async function particleSession(input) {
    const identity = validParticle(input);
    return transaction(async (db) => {
      const auth = await particleAuthRow(db, identity);
      if (!auth) return { registered: false, registrationRequired: true };
      const context = await loadContext(db, auth.user_id);
      if (!context) return { registered: false, registrationRequired: true };
      if (context.user.mfaEnabled) return mfaChallenge(db, context, identity, auth.id);
      await linkParticleIdentity(db, auth, identity);
      return sessionResponse(await loadContext(db, auth.user_id, context.company.id));
    });
  }

  async function registerCompany(input) {
    const identity = validParticle(input);
    const companyName = validCompanyName(input.companyName);
    const email = validEmail(input.email);
    const username = validHandle(input.username);
    return transaction(async (db) => {
      const existingAuth = await particleAuthRow(db, identity);
      if (existingAuth) {
        const context = await loadContext(db, existingAuth.user_id);
        if (context) throw appError("This Particle account already has a STERN company. Access its workspace instead.", 409, "PARTICLE_ID_EXISTS");
        const { rows } = await db.query("SELECT email, username FROM users WHERE id = $1 FOR UPDATE", [existingAuth.user_id]);
        if (!rows[0] || emailValue(rows[0].email) !== email || handleValue(rows[0].username) !== username) {
          throw appError("This Particle identity already has a different STERN profile.", 409, "PARTICLE_PROFILE_MISMATCH");
        }
        await linkParticleIdentity(db, existingAuth, identity);
        const companyId = makeId("company");
        await db.query("INSERT INTO companies (id, name, owner_user_id) VALUES ($1, $2, $3)", [companyId, companyName, existingAuth.user_id]);
        await db.query("INSERT INTO memberships (id, user_id, company_id, role) VALUES ($1, $2, $3, 'owner')", [makeId("membership"), existingAuth.user_id, companyId]);
        return sessionResponse(await loadContext(db, existingAuth.user_id, companyId));
      }
      const userId = makeId("user");
      const companyId = makeId("company");
      await db.query("INSERT INTO users (id, email, username) VALUES ($1, $2, $3)", [userId, email, username]);
      await db.query("INSERT INTO companies (id, name, owner_user_id) VALUES ($1, $2, $3)", [companyId, companyName, userId]);
      await db.query("INSERT INTO memberships (id, user_id, company_id, role) VALUES ($1, $2, $3, 'owner')", [makeId("membership"), userId, companyId]);
      await db.query(`INSERT INTO auth_identities
        (id, user_id, provider, provider_subject, eoa_owner_address, smart_account_address)
        VALUES ($1, $2, 'particle', $3, $4, $5)`,
      [makeId("auth"), userId, identity.particleUserId, identity.ownerAddress, identity.smartAccountAddress]);
      await db.query("INSERT INTO mfa_credentials (user_id, enabled, secret) VALUES ($1, false, NULL)", [userId]);
      return sessionResponse(await loadContext(db, userId, companyId));
    });
  }

  async function setupMfa(token) {
    const context = await sessionContext(token);
    if (context.user.mfaEnabled) throw appError("MFA is already enabled.", 409, "MFA_ENABLED");
    const secret = base32Encode(crypto.randomBytes(20));
    const issuer = "STERN Protocol";
    const label = encodeURIComponent(`${issuer}:${context.user.email}`);
    return {
      secret,
      otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
      setupToken: sign({ type: "mfa_setup", userId: context.user.id, companyId: context.company.id, secret }, MFA_TTL)
    };
  }

  async function confirmMfa({ setupToken, code }) {
    const payload = verify(setupToken);
    if (payload.type !== "mfa_setup" || !payload.secret || !validTotp(payload.secret, code)) throw appError("Invalid MFA code.", 422, "MFA_INVALID");
    return transaction(async (db) => {
      const context = await loadContext(db, payload.userId, payload.companyId);
      if (!context || !context.user.particleUserId) throw appError("Account no longer exists.", 401, "USER_NOT_FOUND");
      if (context.user.mfaEnabled) throw appError("MFA is already enabled.", 409, "MFA_ENABLED");
      await db.query(`INSERT INTO mfa_credentials (user_id, enabled, secret, created_at, updated_at)
        VALUES ($1, true, $2, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET enabled = true, secret = EXCLUDED.secret, updated_at = now()`,
      [payload.userId, payload.secret]);
      return { ok: true, user: publicUser({ ...context.user, mfaEnabled: true }) };
    });
  }

  async function verifyMfa({ mfaToken, code }) {
    const payload = verify(mfaToken);
    if (payload.type !== "mfa" || !payload.challengeId || !payload.userId || !payload.companyId || !payload.authIdentityId) {
      throw appError("MFA verification is required.", 401, "MFA_TOKEN_INVALID");
    }
    const identity = validParticle(payload);
    const result = await transaction(async (db) => {
      const challengeResult = await db.query(`SELECT user_id, company_id, auth_identity_id,
        attempts, expires_at, consumed_at FROM mfa_challenges WHERE id = $1 FOR UPDATE`, [payload.challengeId]);
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.user_id !== payload.userId || challenge.company_id !== payload.companyId || challenge.auth_identity_id !== payload.authIdentityId) {
        return { error: appError("MFA challenge is invalid. Sign in again.", 401, "MFA_TOKEN_INVALID") };
      }
      if (challenge.consumed_at) return { error: appError("MFA challenge has already been used. Sign in again.", 401, "MFA_TOKEN_USED") };
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { error: appError("MFA challenge expired. Sign in again.", 401, "MFA_TOKEN_EXPIRED") };
      }
      if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
        return { error: appError("Too many MFA attempts. Sign in again later.", 429, "MFA_LOCKED") };
      }

      const { rows } = await db.query(`SELECT enabled, secret, last_accepted_step,
        failed_attempts, locked_until FROM mfa_credentials WHERE user_id = $1 FOR UPDATE`, [payload.userId]);
      const credential = rows[0];
      const now = Date.now();
      if (credential?.locked_until && new Date(credential.locked_until).getTime() > now) {
        return { error: appError("Too many MFA attempts. Try again later.", 429, "MFA_LOCKED") };
      }
      const step = credential?.enabled ? matchingTotpStep(credential.secret, code) : null;
      if (!credential?.enabled || step === null || (credential.last_accepted_step !== null && step <= Number(credential.last_accepted_step))) {
        await db.query("UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = $1", [payload.challengeId]);
        if (credential) {
          const failedAttempts = (credential.locked_until ? 0 : credential.failed_attempts) + 1;
          const lockedUntil = failedAttempts >= MFA_MAX_ATTEMPTS ? new Date(now + MFA_LOCKOUT_MS) : null;
          await db.query("UPDATE mfa_credentials SET failed_attempts = $2, locked_until = $3, updated_at = now() WHERE user_id = $1",
            [payload.userId, failedAttempts, lockedUntil]);
          if (lockedUntil) return { error: appError("Too many MFA attempts. Try again later.", 429, "MFA_LOCKED") };
        }
        return { error: appError("Invalid MFA code.", 401, "MFA_INVALID") };
      }
      const auth = await particleAuthRow(db, identity);
      if (!auth || auth.id !== payload.authIdentityId || auth.user_id !== payload.userId) {
        throw appError("Particle identity changed during MFA verification.", 403, "PARTICLE_ID_MISMATCH");
      }
      await linkParticleIdentity(db, auth, identity);
      if (payload.invitationId) await finalizeInvitation(db, payload.invitationId, payload.userId, payload.companyId);
      const context = await loadContext(db, payload.userId, payload.companyId);
      if (!context) throw appError("Company membership no longer exists.", 401, "MEMBERSHIP_MISSING");
      await db.query(`UPDATE mfa_credentials SET last_accepted_step = $2,
        failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE user_id = $1`, [payload.userId, step]);
      await db.query("UPDATE mfa_challenges SET consumed_at = now() WHERE id = $1", [payload.challengeId]);
      return sessionResponse(context);
    });
    if (result.error) throw result.error;
    return result;
  }

  async function updateProfile(token, input) {
    const username = validHandle(input?.username);
    const context = await sessionContext(token);
    return transaction(async (db) => {
      await db.query("UPDATE users SET username = $2, updated_at = now() WHERE id = $1", [context.user.id, username]);
      const updated = await loadContext(db, context.user.id, context.company.id);
      return { user: publicUser(updated.user), company: publicCompany(updated.company) };
    });
  }

  async function companyUsers(token, companyId) {
    const actor = await sessionContext(token);
    if (actor.company.id !== companyId) throw appError("You cannot view another company.", 403, "COMPANY_FORBIDDEN");
    const { rows } = await pool.query("SELECT user_id FROM memberships WHERE company_id = $1 ORDER BY created_at, id", [companyId]);
    const users = await Promise.all(rows.map(async (row) => publicUser((await loadContext(pool, row.user_id, companyId)).user)));
    return { company: publicCompany(actor.company), users };
  }

  async function userMemberships(token) {
    const actor = await sessionContext(token);
    const { rows } = await pool.query(`
      SELECT m.company_id, m.role, m.created_at, c.name
      FROM memberships m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = $1 ORDER BY m.created_at, m.id
    `, [actor.user.id]);
    return { memberships: rows.map((row) => ({
      companyId: row.company_id, companyName: row.name,
      role: row.role, createdAt: iso(row.created_at)
    })) };
  }

  async function switchCompany(token, companyId) {
    const actor = await sessionContext(token);
    const target = await loadContext(pool, actor.user.id, String(companyId || ""));
    if (!target) throw appError("You are not a member of that company.", 403, "COMPANY_FORBIDDEN");
    return sessionResponse(target);
  }

  async function invitationRow(db, code) {
    const normalized = String(code || "").trim();
    if (!normalized || normalized.length > 256) throw appError("Company invitation is invalid.", 404, "INVITATION_NOT_FOUND");
    const digest = crypto.createHash("sha256").update(normalized).digest("hex");
    const { rows } = await db.query(`
      SELECT id, company_id, email, role, expires_at, accepted_at
      FROM company_invitations WHERE code_hash = $1 FOR UPDATE
    `, [digest]);
    const invitation = rows[0];
    if (!invitation) throw appError("Company invitation is invalid.", 404, "INVITATION_NOT_FOUND");
    if (invitation.accepted_at) throw appError("Company invitation has already been used.", 409, "INVITATION_USED");
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw appError("Company invitation has expired.", 410, "INVITATION_EXPIRED");
    }
    return invitation;
  }

  async function finalizeInvitation(db, invitationId, userId, companyId) {
    const { rows } = await db.query(`
      SELECT id, company_id, email, role, expires_at, accepted_at
      FROM company_invitations WHERE id = $1 FOR UPDATE
    `, [invitationId]);
    const invitation = rows[0];
    if (!invitation || invitation.company_id !== companyId) {
      throw appError("Company invitation is invalid.", 404, "INVITATION_NOT_FOUND");
    }
    if (invitation.accepted_at) throw appError("Company invitation has already been used.", 409, "INVITATION_USED");
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw appError("Company invitation has expired.", 410, "INVITATION_EXPIRED");
    }
    const { rows: users } = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    if (!users[0] || emailValue(users[0].email) !== emailValue(invitation.email)) {
      throw appError("This invitation is for a different work email.", 403, "INVITATION_EMAIL_MISMATCH");
    }
    const { rowCount } = await db.query("SELECT id FROM memberships WHERE user_id = $1 AND company_id = $2", [userId, companyId]);
    if (rowCount) throw appError("This person is already a company member.", 409, "MEMBERSHIP_EXISTS");
    await db.query("INSERT INTO memberships (id, user_id, company_id, role) VALUES ($1, $2, $3, $4)", [makeId("membership"), userId, companyId, invitation.role]);
    await db.query("UPDATE company_invitations SET accepted_at = now(), accepted_by_user_id = $2 WHERE id = $1", [invitation.id, userId]);
  }

  async function createInvitation(token, companyId, input) {
    const actor = await sessionContext(token);
    if (actor.company.id !== companyId) throw appError("You cannot invite to another company.", 403, "COMPANY_FORBIDDEN");
    const role = String(input?.role || "").trim().toLowerCase();
    if (actor.user.role !== "owner" && actor.user.role !== "admin") {
      throw appError("Only company owners and admins can invite members.", 403, "ROLE_FORBIDDEN");
    }
    if (!((actor.user.role === "owner" && (role === "admin" || role === "operator")) ||
          (actor.user.role === "admin" && role === "operator"))) {
      throw appError("You cannot assign that company role.", 403, "ROLE_FORBIDDEN");
    }
    const email = validEmail(input?.email);
    const existing = await pool.query(`
      SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.company_id = $1 AND lower(u.email) = $2 LIMIT 1
    `, [companyId, email]);
    if (existing.rowCount) throw appError("This person is already a company member.", 409, "MEMBERSHIP_EXISTS");
    const code = crypto.randomBytes(32).toString("base64url");
    const id = makeId("invite");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + INVITATION_TTL_MS);
    await pool.query(`
      INSERT INTO company_invitations (id, company_id, email, role, code_hash, created_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, companyId, email, role, crypto.createHash("sha256").update(code).digest("hex"), createdAt, expiresAt]);
    return { invitation: { id, email, role, code, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() } };
  }

  async function companyInvitations(token, companyId) {
    const actor = await sessionContext(token);
    if (actor.company.id !== companyId) throw appError("You cannot view another company.", 403, "COMPANY_FORBIDDEN");
    if (actor.user.role !== "owner" && actor.user.role !== "admin") {
      throw appError("Only company owners and admins can view invitations.", 403, "ROLE_FORBIDDEN");
    }
    const { rows } = await pool.query(`
      SELECT id, email, role, created_at, expires_at, accepted_at FROM company_invitations
      WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100
    `, [companyId]);
    return { invitations: rows.map((row) => ({
      id: row.id, email: row.email, role: row.role, createdAt: iso(row.created_at),
      expiresAt: iso(row.expires_at), acceptedAt: iso(row.accepted_at)
    })) };
  }

  async function acceptInvitation(input) {
    const identity = validParticle(input);
    return transaction(async (db) => {
      const invitation = await invitationRow(db, input?.code);
      const auth = await particleAuthRow(db, identity);
      let userId;
      if (auth) {
        userId = auth.user_id;
        const context = await loadContext(db, userId);
        if (!context) throw appError("STERN profile is incomplete.", 409, "PROFILE_INCOMPLETE");
        if (emailValue(context.user.email) !== emailValue(invitation.email)) {
          throw appError("This invitation is for a different work email.", 403, "INVITATION_EMAIL_MISMATCH");
        }
        if (context.user.mfaEnabled) {
          return mfaChallenge(db, context, identity, auth.id, { companyId: invitation.company_id, invitationId: invitation.id });
        }
        await linkParticleIdentity(db, auth, identity);
      } else {
        const email = validEmail(input?.email);
        if (email !== emailValue(invitation.email)) {
          throw appError("This invitation is for a different work email.", 403, "INVITATION_EMAIL_MISMATCH");
        }
        const username = validHandle(input?.username);
        userId = makeId("user");
        await db.query("INSERT INTO users (id, email, username) VALUES ($1, $2, $3)", [userId, email, username]);
        await db.query(`INSERT INTO auth_identities
          (id, user_id, provider, provider_subject, eoa_owner_address, smart_account_address)
          VALUES ($1, $2, 'particle', $3, $4, $5)`,
        [makeId("auth"), userId, identity.particleUserId, identity.ownerAddress, identity.smartAccountAddress]);
        await db.query("INSERT INTO mfa_credentials (user_id, enabled, secret) VALUES ($1, false, NULL)", [userId]);
      }
      await finalizeInvitation(db, invitation.id, userId, invitation.company_id);
      const context = await loadContext(db, userId, invitation.company_id);
      return sessionResponse(context);
    });
  }

  return {
    authenticate, particleSession, registerCompany, setupMfa, confirmMfa, verifyMfa,
    updateProfile, companyUsers, userMemberships, switchCompany, publicUser, publicCompany,
    createInvitation, companyInvitations, acceptInvitation
  };
}

module.exports = { createIdentityService };
