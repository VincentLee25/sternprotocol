const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROLES = new Set(["owner", "admin", "operator"]);
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MFA_TTL_SECONDS = 5 * 60;

function appError(message, statusCode = 400, code = "IDENTITY_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function createIdentityService({ storeFile, tokenSecret }) {
  if (!storeFile) throw appError("IDENTITY_STORE_FILE is required.", 500, "IDENTITY_STORE_MISSING");
  if (!tokenSecret || tokenSecret.length < 32) {
    throw appError("AUTH_TOKEN_SECRET must be at least 32 characters.", 500, "AUTH_SECRET_INVALID");
  }

  function emptyStore() {
    return { version: 1, companies: [], users: [] };
  }

  function readStore() {
    if (!fs.existsSync(storeFile)) return emptyStore();
    try {
      const parsed = JSON.parse(fs.readFileSync(storeFile, "utf8"));
      if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.users)) throw new Error("invalid shape");
      return parsed;
    } catch {
      throw appError("Identity store is unreadable. Restore it from a known-good backup.", 500, "IDENTITY_STORE_INVALID");
    }
  }

  function writeStore(store) {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
    const tmp = `${storeFile}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, storeFile);
  }

  function nowIso() { return new Date().toISOString(); }
  function id(prefix) { return `${prefix}_${crypto.randomBytes(12).toString("hex")}`; }
  function normalEmail(value) { return String(value || "").trim().toLowerCase(); }
  function normalUsername(value) { return String(value || "").trim().toLowerCase(); }
  function normalWallet(value) { return String(value || "").trim().toLowerCase(); }

  function validateIdentity({ email, username, walletAddress, password }, { requirePassword = true } = {}) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail(email))) throw appError("A valid email is required.", 422, "EMAIL_INVALID");
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(normalUsername(username))) {
      throw appError("Username must be 3-32 lowercase letters, digits, dot, dash, or underscore.", 422, "USERNAME_INVALID");
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(String(walletAddress || "").trim())) {
      throw appError("A valid EVM wallet address is required.", 422, "WALLET_INVALID");
    }
    if (requirePassword && (typeof password !== "string" || password.length < 12)) {
      throw appError("Password must be at least 12 characters.", 422, "PASSWORD_WEAK");
    }
  }

  function validateParticleUserId(value) {
    const particleUserId = String(value || "").trim();
    if (!/^[a-zA-Z0-9-]{8,128}$/.test(particleUserId)) throw appError("A valid Particle identity is required.", 422, "PARTICLE_ID_INVALID");
    return particleUserId;
  }

  function hashPassword(password, salt = crypto.randomBytes(16).toString("base64url")) {
    const digest = crypto.scryptSync(password, salt, 64).toString("base64url");
    return `scrypt$${salt}$${digest}`;
  }

  function passwordMatches(password, stored) {
    const [scheme, salt, digest] = String(stored || "").split("$");
    if (scheme !== "scrypt" || !salt || !digest) return false;
    const expected = Buffer.from(digest, "base64url");
    const actual = crypto.scryptSync(password, salt, 64);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function sign(payload, ttlSeconds) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
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

  function publicUser(user) {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      username: user.username,
      walletAddress: user.walletAddress,
      particleUserId: user.particleUserId || null,
      role: user.role,
      mfaEnabled: Boolean(user.mfa?.enabled),
      createdAt: user.createdAt
    };
  }

  function publicCompany(company) {
    return { id: company.id, name: company.name, ownerUserId: company.ownerUserId, createdAt: company.createdAt };
  }

  function userById(store, userId) {
    const user = store.users.find((item) => item.id === userId);
    if (!user) throw appError("Account no longer exists.", 401, "USER_NOT_FOUND");
    return user;
  }

  function issueSession(user) {
    return { accessToken: sign({ type: "session", userId: user.id, companyId: user.companyId, role: user.role }, TOKEN_TTL_SECONDS), expiresIn: TOKEN_TTL_SECONDS };
  }

  function authenticate(bearerToken) {
    const payload = verify(bearerToken);
    if (payload.type !== "session") throw appError("Authentication is required.", 401, "TOKEN_INVALID");
    const store = readStore();
    const user = userById(store, payload.userId);
    return { user, company: store.companies.find((item) => item.id === user.companyId), store };
  }

  function registerCompany(input) {
    validateIdentity(input, { requirePassword: !input.particleUserId });
    const companyName = String(input.companyName || "").trim();
    if (companyName.length < 2 || companyName.length > 120) throw appError("Company name must be 2-120 characters.", 422, "COMPANY_INVALID");
    const store = readStore();
    const email = normalEmail(input.email);
    const username = normalUsername(input.username);
    const walletAddress = normalWallet(input.walletAddress);
    if (store.users.some((item) => item.email === email)) throw appError("Email is already registered.", 409, "EMAIL_EXISTS");
    if (store.users.some((item) => item.username === username)) throw appError("Username is already registered.", 409, "USERNAME_EXISTS");
    if (store.users.some((item) => item.walletAddress === walletAddress)) throw appError("Wallet is already linked to an account.", 409, "WALLET_EXISTS");
    const company = { id: id("company"), name: companyName, ownerUserId: null, createdAt: nowIso() };
    const particleUserId = input.particleUserId ? validateParticleUserId(input.particleUserId) : null;
    if (particleUserId && store.users.some((item) => item.particleUserId === particleUserId)) {
      throw appError("This Particle account is already registered.", 409, "PARTICLE_ID_EXISTS");
    }
    const user = {
      id: id("user"), companyId: company.id, email, username, walletAddress, role: "owner",
      passwordHash: typeof input.password === "string" && input.password ? hashPassword(input.password) : null,
      particleUserId, mfa: { enabled: false, secret: null }, createdAt: nowIso()
    };
    company.ownerUserId = user.id;
    store.companies.push(company);
    store.users.push(user);
    writeStore(store);
    return { company: publicCompany(company), user: publicUser(user), ...issueSession(user) };
  }

  function login({ email, password }) {
    const store = readStore();
    const user = store.users.find((item) => item.email === normalEmail(email));
    if (!user || !passwordMatches(String(password || ""), user.passwordHash)) {
      throw appError("Invalid email or password.", 401, "LOGIN_INVALID");
    }
    if (user.mfa?.enabled) {
      return { mfaRequired: true, mfaToken: sign({ type: "mfa", userId: user.id }, MFA_TTL_SECONDS) };
    }
    return { mfaRequired: false, user: publicUser(user), company: publicCompany(store.companies.find((item) => item.id === user.companyId)), ...issueSession(user) };
  }

  function particleSession({ particleUserId, smartAccountAddress }) {
    const normalizedParticleId = validateParticleUserId(particleUserId);
    const walletAddress = normalWallet(smartAccountAddress);
    if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) throw appError("A valid settlement account is required.", 422, "WALLET_INVALID");

    const store = readStore();
    let user = store.users.find((item) => item.particleUserId === normalizedParticleId);
    // Older STERN registrations predate Particle linkage. A verified Particle
    // owner may claim only the exact Safe already recorded for that member.
    // This lookup is safe only because the route derives smartAccountAddress
    // server-side from Particle's verified owner wallet.
    const legacyMember = !user && store.users.find((item) => !item.particleUserId && normalWallet(item.walletAddress) === walletAddress);
    if (legacyMember) user = legacyMember;
    if (user) {
      if (normalWallet(user.walletAddress) !== walletAddress) {
        throw appError("This Particle identity is linked to a different settlement account.", 403, "PARTICLE_WALLET_MISMATCH");
      }
      if (user.mfa?.enabled) {
        return { registered: true, mfaRequired: true, mfaToken: sign({ type: "mfa", userId: user.id, particleUserId: legacyMember ? normalizedParticleId : undefined, walletAddress }, MFA_TTL_SECONDS) };
      }
      if (legacyMember) {
        user.particleUserId = normalizedParticleId;
        writeStore(store);
      }
      return {
        registered: true,
        mfaRequired: false,
        user: publicUser(user),
        company: publicCompany(store.companies.find((item) => item.id === user.companyId)),
        ...issueSession(user)
      };
    }

    if (store.users.some((item) => normalWallet(item.walletAddress) === walletAddress)) {
      throw appError("This settlement account belongs to another Particle identity.", 403, "PARTICLE_WALLET_CLAIMED");
    }
    return { registered: false, registrationRequired: true };
  }

  function base32Encode(buffer) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0; let value = 0; let output = "";
    for (const byte of buffer) {
      value = (value << 8) | byte; bits += 8;
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
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return String(code).padStart(6, "0");
  }

  function validTotp(secret, code) {
    const candidate = String(code || "").replace(/\s/g, "");
    return [-1, 0, 1].some((window) => {
      const expected = totp(secret, Date.now() + window * 30000);
      return candidate.length === expected.length && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    });
  }

  function beginMfa(user) {
    const secret = base32Encode(crypto.randomBytes(20));
    const issuer = "STERN Protocol";
    const label = encodeURIComponent(`${issuer}:${user.email}`);
    return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
  }

  function setupMfa(sessionToken) {
    const { user } = authenticate(sessionToken);
    if (user.mfa?.enabled) throw appError("MFA is already enabled.", 409, "MFA_ENABLED");
    const setup = beginMfa(user);
    const payload = verify(sessionToken);
    return { ...setup, setupToken: sign({ type: "mfa_setup", userId: payload.userId, secret: setup.secret }, MFA_TTL_SECONDS) };
  }

  function confirmMfa({ setupToken, code }) {
    const payload = verify(setupToken);
    if (payload.type !== "mfa_setup" || !payload.secret || !validTotp(payload.secret, code)) {
      throw appError("Invalid MFA code.", 422, "MFA_INVALID");
    }
    const store = readStore();
    const user = userById(store, payload.userId);
    user.mfa = { enabled: true, secret: payload.secret, enabledAt: nowIso() };
    writeStore(store);
    return { ok: true, user: publicUser(user) };
  }

  function verifyMfa({ mfaToken, code }) {
    const payload = verify(mfaToken);
    if (payload.type !== "mfa") throw appError("MFA verification is required.", 401, "MFA_TOKEN_INVALID");
    const store = readStore();
    const user = userById(store, payload.userId);
    if (!user.mfa?.enabled || !validTotp(user.mfa.secret, code)) throw appError("Invalid MFA code.", 401, "MFA_INVALID");
    if (payload.particleUserId) {
      if (user.particleUserId && user.particleUserId !== payload.particleUserId) throw appError("This company account is linked to another Particle identity.", 403, "PARTICLE_ID_MISMATCH");
      if (normalWallet(user.walletAddress) !== payload.walletAddress) throw appError("The settlement account changed during verification.", 403, "PARTICLE_WALLET_MISMATCH");
      user.particleUserId = payload.particleUserId;
      writeStore(store);
    }
    return { mfaRequired: false, user: publicUser(user), company: publicCompany(store.companies.find((item) => item.id === user.companyId)), ...issueSession(user) };
  }

  function addCompanyUser(sessionToken, companyId, input) {
    const { user: actor } = authenticate(sessionToken);
    if (actor.companyId !== companyId || !["owner", "admin"].includes(actor.role)) throw appError("Only the company owner or admin can add users.", 403, "ROLE_FORBIDDEN");
    validateIdentity(input);
    const role = String(input.role || "operator").toLowerCase();
    if (!ROLES.has(role) || role === "owner") throw appError("New company users must be admin or operator.", 422, "ROLE_INVALID");
    if (actor.role === "admin" && role === "admin") throw appError("Only the owner can add an admin.", 403, "ROLE_FORBIDDEN");
    const store = readStore();
    const email = normalEmail(input.email); const username = normalUsername(input.username); const walletAddress = normalWallet(input.walletAddress);
    if (store.users.some((item) => item.email === email || item.username === username || item.walletAddress === walletAddress)) {
      throw appError("Email, username, or wallet is already registered.", 409, "IDENTITY_EXISTS");
    }
    const newUser = { id: id("user"), companyId, email, username, walletAddress, role, passwordHash: hashPassword(input.password), mfa: { enabled: false, secret: null }, createdAt: nowIso() };
    store.users.push(newUser); writeStore(store);
    return { user: publicUser(newUser) };
  }

  function companyUsers(sessionToken, companyId) {
    const { user: actor, store } = authenticate(sessionToken);
    if (actor.companyId !== companyId) throw appError("You cannot view another company.", 403, "COMPANY_FORBIDDEN");
    return { company: publicCompany(store.companies.find((item) => item.id === companyId)), users: store.users.filter((item) => item.companyId === companyId).map(publicUser) };
  }

  return { registerCompany, login, particleSession, authenticate, setupMfa, confirmMfa, verifyMfa, addCompanyUser, companyUsers, publicUser, publicCompany };
}

module.exports = { createIdentityService };
