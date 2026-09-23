// Server-side proof for verdicts recorded through the institutional Ops
// console. The browser proves it controls the appointed arbiter key by signing
// a short-lived challenge. The gateway then countersigns the immutable verdict
// record with ARBITER_PRIVATE_KEY. Neither key is ever returned by this module.
const crypto = require("node:crypto");
const { ethers } = require("ethers");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 500;

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sameAddress(left, right) {
  try {
    return ethers.getAddress(left) === ethers.getAddress(right);
  } catch {
    return false;
  }
}

function findDesignatedClause(declaredClauses, clauseId) {
  const clause = (Array.isArray(declaredClauses) ? declaredClauses : [])
    .find((item) => String(item?.id) === String(clauseId));
  if (!clause) throw appError("Klausul ini tidak ada dalam instrumen escrow yang dipin.", 404, "CLAUSE_NOT_DECLARED");
  if (clause.kind !== "interpretive") {
    throw appError("Klausul otomatis tidak menerima putusan arbiter.", 409, "CLAUSE_NOT_INTERPRETIVE");
  }
  if (!ethers.isAddress(clause.reviewer)) {
    throw appError("Instrumen escrow tidak memiliki penilai yang valid untuk klausul ini.", 409, "CLAUSE_REVIEWER_INVALID");
  }
  return clause;
}

function challengeMessage({ id, escrowId, clauseId, reviewer, expiresAt }) {
  return [
    "STERN Ops clause review",
    `Challenge: ${id}`,
    `Escrow: ${escrowId}`,
    `Clause: ${clauseId}`,
    `Reviewer: ${reviewer}`,
    `Expires: ${expiresAt}`
  ].join("\n");
}

function verdictMessage({ escrowId, clauseId, verdict, reasoning, reviewer, reviewedAt }) {
  return [
    "STERN Ops clause verdict",
    `Escrow: ${escrowId}`,
    `Clause: ${clauseId}`,
    `Verdict: ${verdict}`,
    `Reasoning: ${reasoning}`,
    `Reviewer: ${reviewer}`,
    `Reviewed at: ${reviewedAt}`
  ].join("\n");
}

function createOpsClauseReviewService({ arbiterPrivateKey }) {
  const challenges = new Map();
  let signer = null;

  function serverSigner() {
    if (!arbiterPrivateKey) {
      throw appError("Ops clause signing is not configured on this gateway.", 503, "OPS_CLAUSE_SIGNER_UNAVAILABLE");
    }
    if (!signer) signer = new ethers.Wallet(arbiterPrivateKey);
    return signer;
  }

  function prune(now = Date.now()) {
    for (const [id, challenge] of challenges) {
      if (challenge.expiresAtMs <= now || challenge.used) challenges.delete(id);
    }
    while (challenges.size >= MAX_CHALLENGES) {
      const oldest = challenges.keys().next().value;
      challenges.delete(oldest);
    }
  }

  function createChallenge(escrowId, clauseId, declaredClauses) {
    const wallet = serverSigner();
    const clause = findDesignatedClause(declaredClauses, clauseId);
    const reviewer = ethers.getAddress(clause.reviewer);
    if (!sameAddress(wallet.address, reviewer)) {
      throw appError("The configured Ops signer is not the reviewer named in this clause.", 403, "OPS_REVIEWER_FORBIDDEN");
    }

    prune();
    const id = crypto.randomBytes(24).toString("base64url");
    const expiresAtMs = Date.now() + CHALLENGE_TTL_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const message = challengeMessage({ id, escrowId: String(escrowId), clauseId: String(clauseId), reviewer, expiresAt });
    challenges.set(id, { id, escrowId: String(escrowId), clauseId: String(clauseId), reviewer, message, expiresAtMs, used: false });
    return { challengeId: id, message, reviewer, expiresAt };
  }

  async function verifyAndAttest({ escrowId, clauseId, verdict, reasoning, challengeId, signature, declaredClauses }) {
    const challenge = challenges.get(String(challengeId || ""));
    if (!challenge || challenge.used || challenge.expiresAtMs <= Date.now()) {
      throw appError("This Ops review challenge has expired. Request a new one.", 401, "OPS_CHALLENGE_EXPIRED");
    }
    if (challenge.escrowId !== String(escrowId) || challenge.clauseId !== String(clauseId)) {
      throw appError("This Ops review challenge does not belong to this clause.", 403, "OPS_CHALLENGE_MISMATCH");
    }

    const clause = findDesignatedClause(declaredClauses, clauseId);
    const wallet = serverSigner();
    if (!sameAddress(clause.reviewer, challenge.reviewer) || !sameAddress(wallet.address, challenge.reviewer)) {
      throw appError("The designated clause reviewer no longer matches the authorized Ops signer.", 403, "OPS_REVIEWER_FORBIDDEN");
    }

    let browserSigner;
    try {
      browserSigner = ethers.verifyMessage(challenge.message, String(signature || ""));
    } catch {
      throw appError("The Ops signature is invalid.", 401, "OPS_SIGNATURE_INVALID");
    }
    if (!sameAddress(browserSigner, challenge.reviewer)) {
      throw appError("The Ops signature was not made by the reviewer named in this clause.", 403, "OPS_REVIEWER_FORBIDDEN");
    }

    // Single use before persistence prevents two concurrent browser requests
    // from obtaining attestations for the same challenge.
    challenge.used = true;
    const reviewedAt = new Date().toISOString();
    const payload = verdictMessage({
      escrowId: String(escrowId),
      clauseId: String(clauseId),
      verdict: String(verdict || "").trim(),
      reasoning: String(reasoning || "").trim(),
      reviewer: challenge.reviewer,
      reviewedAt
    });
    const serverSignature = await wallet.signMessage(payload);
    const verifiedServerSigner = ethers.verifyMessage(payload, serverSignature);
    if (!sameAddress(verifiedServerSigner, challenge.reviewer)) {
      throw appError("The server verdict attestation could not be verified.", 500, "OPS_ATTESTATION_INVALID");
    }

    return {
      reviewerAddress: challenge.reviewer,
      attestation: {
        scheme: "stern/ops-clause-attestation@1",
        challengeId: challenge.id,
        reviewedAt,
        browserSignature: String(signature),
        serverSigner: wallet.address,
        serverSignature,
        payload
      }
    };
  }

  return { createChallenge, verifyAndAttest };
}

module.exports = { createOpsClauseReviewService };
