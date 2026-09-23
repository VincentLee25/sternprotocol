// Clauses a machine cannot judge, and the person who has to.
//
// The objection this exists to answer, and it is the strongest one anyone
// raises about STERN: the three milestones are objective. A container's
// verified gross mass either matches or it does not; a vessel has departed or
// it has not; customs has cleared the goods or it has not. Those are readings.
//
// Real trade contracts are not made only of readings. They say things like
// "biji kopi harus dalam kondisi layak jual", "substantially in conformity
// with sample", "packaging fit for ocean carriage". No feed answers those. A
// person does, and reasonable people disagree.
//
// The wrong answer is to pretend otherwise — to score such a clause with a
// model and call the number a verification. The number would be the most
// load-bearing figure on the screen and the least defensible.
//
// So STERN does the opposite. An interpretive clause is declared as
// interpretive from the start, it names the person who must judge it, and that
// person's verdict is not accepted without a written reason. Until the reason
// exists, the gateway will not submit the milestone proof the clause is
// attached to — the same refusal it already makes for a wrong e-BL or a failed
// customs document. Judgement is not automated; it is made explicit, assigned,
// recorded, and made a precondition.
//
// Two halves, deliberately stored apart:
//
//   The clause TEXT lives in the escrow's creation manifest (see
//   manifestService.js), which is pinned to IPFS and whose CID is written on
//   chain. It therefore cannot be edited, and nobody can add a convenient
//   clause after the goods have shipped.
//
//   The REVIEWS live here, because they are written afterwards by definition.
//   A review is append-only: a reviewer may change their mind, but the earlier
//   verdict stays in the record.
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");

/** The verdicts a reviewer may return. */
const VERDICTS = {
  met: {
    label: "Terpenuhi",
    blocks: false,
    note: "The clause is satisfied."
  },
  met_with_reservation: {
    label: "Terpenuhi dengan catatan",
    blocks: false,
    // Deliberately not blocking. A reviewer who has to choose between "fine"
    // and "stop the settlement" will say fine, and the reservation — the thing
    // actually worth reading — never gets written down.
    note: "Satisfied, with a recorded reservation that does not stop settlement."
  },
  not_met: {
    label: "Tidak terpenuhi",
    blocks: true,
    note: "The clause is not satisfied. The milestone it governs cannot be committed."
  }
};

const MILESTONES = ["inspected", "shipped", "arrived_cleared"];
const MIN_REASONING = 40;
const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function storePath() {
  return config.clauseStoreFile || path.resolve(__dirname, "../data/clauses.json");
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
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, file);
}

/**
 * Validates a clause as it will be written into the creation manifest.
 *
 * Called by manifestService before pinning, because after pinning nothing can
 * be corrected — the text is addressed by a CID that goes on chain.
 */
function normaliseClause(input, index) {
  const text = String(input?.text || "").trim();
  if (text.length < 12 || text.length > 600) {
    throw appError(
      `Klausul ${index + 1}: teksnya harus 12–600 karakter. Ini yang akan dinilai orang, jadi tulis lengkap.`,
      422,
      "CLAUSE_TEXT_INVALID"
    );
  }

  const kind = input?.kind === "automated" ? "automated" : "interpretive";

  const milestone = String(input?.milestone || "").trim();
  if (!MILESTONES.includes(milestone)) {
    throw appError(
      `Klausul ${index + 1}: milestone harus salah satu dari ${MILESTONES.join(", ")} — klausul yang tidak menggantung pada milestone mana pun tidak bisa menahan apa pun.`,
      422,
      "CLAUSE_MILESTONE_INVALID"
    );
  }

  // An interpretive clause without a named reviewer is a clause nobody owns.
  // The whole point is that a specific person answers for it.
  const reviewer = String(input?.reviewer || "").trim();
  if (kind === "interpretive" && !ADDRESS.test(reviewer)) {
    throw appError(
      `Klausul ${index + 1}: klausul interpretatif harus menyebut alamat penilainya. Tanpa itu tidak ada yang bertanggung jawab atas keputusannya.`,
      422,
      "CLAUSE_REVIEWER_REQUIRED"
    );
  }

  return {
    // Stable within one manifest, and derived from the position rather than
    // random, so the same declaration always pins to the same bytes.
    id: `cl${index + 1}`,
    text,
    kind,
    milestone,
    reviewer: kind === "interpretive" ? reviewer : null,
    reviewerRole: String(input?.reviewerRole || "arbiter").trim().slice(0, 40) || "arbiter",
    // Whether an unresolved clause stops the milestone. Default true for an
    // interpretive clause: a term worth writing into the instrument is worth
    // answering before the money moves.
    required: input?.required === false ? false : kind === "interpretive",
    standard: String(input?.standard || "").trim().slice(0, 200) || null
  };
}

function normaliseClauses(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (list.length > 12) {
    throw appError("Maksimal 12 klausul per escrow.", 422, "CLAUSE_TOO_MANY");
  }
  return list.map(normaliseClause);
}

/**
 * Records a reviewer's verdict on one clause.
 *
 * The reasoning is not optional and not a checkbox. A verdict with no argument
 * behind it is the thing this feature exists to prevent: it would look like a
 * judgement and carry none. The contract already takes this position for
 * disputes — resolveDispute refuses an empty reasoningCid — and this applies
 * the same rule one level earlier.
 */
async function review(escrowId, clauseId, input = {}, { reviewerAddress, declaredClauses, attestation } = {}) {
  const id = String(escrowId || "").trim();
  if (!/^\d+$/.test(id)) throw appError("An escrow id is required.", 422, "ESCROW_ID_INVALID");

  const clause = String(clauseId || "").trim();
  if (!/^cl\d{1,2}$/.test(clause)) throw appError("Unknown clause id.", 422, "CLAUSE_ID_INVALID");

  const verdict = String(input.verdict || "").trim();
  if (!VERDICTS[verdict]) {
    throw appError(
      `Verdict harus salah satu dari: ${Object.keys(VERDICTS).join(", ")}.`,
      422,
      "CLAUSE_VERDICT_INVALID"
    );
  }

  const reasoning = String(input.reasoning || "").trim();
  if (reasoning.length < MIN_REASONING) {
    throw appError(
      `Alasannya harus minimal ${MIN_REASONING} karakter. Putusan tanpa alasan tertulis tidak bisa dibantah, dan itu justru yang harus bisa dibantah.`,
      422,
      "CLAUSE_REASONING_REQUIRED"
    );
  }

  // The client does not choose the reviewer. The route supplies the verified
  // Particle owner EOA from the company's signed session; the Safe account is
  // reserved for on-chain escrow transactions.
  const reviewedBy = String(reviewerAddress || "").trim();
  if (!ADDRESS.test(reviewedBy)) throw appError("Identitas penilai terverifikasi diperlukan.", 401, "CLAUSE_REVIEWER_INVALID");

  const declared = Array.isArray(declaredClauses) ? declaredClauses : [];
  const designated = declared.find((item) => String(item?.id) === clause);
  if (!designated) throw appError("Klausul ini tidak ada dalam instrumen escrow yang dipin.", 404, "CLAUSE_NOT_DECLARED");
  if (designated.kind !== "interpretive") {
    throw appError("Klausul otomatis tidak menerima putusan manusia.", 409, "CLAUSE_NOT_INTERPRETIVE");
  }
  if (!ADDRESS.test(String(designated.reviewer || "")) || designated.reviewer.toLowerCase() !== reviewedBy.toLowerCase()) {
    throw appError("Hanya penilai yang ditunjuk dalam instrumen escrow yang dapat merekam putusan.", 403, "CLAUSE_REVIEWER_FORBIDDEN");
  }

  // The reasoning is pinned, so the verdict points at an address anyone can
  // fetch rather than at a row in this gateway's own database. That is the
  // same standard the arbiter's reasoning is held to on chain.
  const reviewedAt = String(attestation?.reviewedAt || new Date().toISOString());
  let reasoningCid = null;
  let pinError = null;
  try {
    const { pinDocument } = require("./ipfsService");
    const body = Buffer.from(
      `${JSON.stringify({
        stern: "stern/clause-review@1",
        escrowId: id,
        clauseId: clause,
        verdict,
        reasoning,
        reviewedBy,
        reviewedAt,
        ...(attestation ? { attestation } : {})
      }, null, 2)}\n`,
      "utf8"
    );
    const pinned = await pinDocument(body, `stern-clause-${id}-${clause}.json`);
    reasoningCid = pinned.cid;
  } catch (error) {
    // A gateway with no pinning service configured is a supported state. The
    // review is still recorded and still gates the milestone; it just cannot
    // be cited by address, and the record says so rather than implying it can.
    pinError = error.message;
  }

  const store = load();
  const existing = store[id] || { escrowId: id, reviews: {}, history: [] };
  const entry = {
    clauseId: clause,
    verdict,
    verdictLabel: VERDICTS[verdict].label,
    blocks: VERDICTS[verdict].blocks,
    reasoning,
    reasoningCid,
    ...(pinError ? { reasoningNotPinned: pinError } : {}),
    reviewedBy,
    reviewedAt,
    ...(attestation ? { attestation } : {})
  };

  // Append-only: a reviewer may revise, and the earlier verdict stays legible.
  if (existing.reviews[clause]) existing.history.push(existing.reviews[clause]);
  existing.reviews[clause] = entry;
  store[id] = existing;
  save(store);

  return entry;
}

/** Every review recorded for an escrow, current and superseded. */
function reviewsFor(escrowId) {
  const entry = load()[String(escrowId)];
  if (!entry) return { reviews: {}, history: [] };
  return { reviews: entry.reviews || {}, history: entry.history || [] };
}

/**
 * Joins the declared clauses to their reviews, and says what that means for
 * each milestone.
 *
 * `clauses` comes from the pinned manifest, never from this store — the text
 * being judged has to be the text that was anchored on chain.
 */
function assess(escrowId, clauses) {
  const declared = Array.isArray(clauses) ? clauses : [];
  const { reviews } = reviewsFor(escrowId);

  const rows = declared.map((clause) => {
    const review = reviews[clause.id] || null;
    // Three states, and they are not the same thing:
    //   awaiting  — a person still has to answer. Blocks, if required.
    //   met       — answered, satisfied.
    //   not_met   — answered, not satisfied. Blocks.
    const state = !review ? "awaiting" : review.verdict;
    const blocks = clause.required && (state === "awaiting" || state === "not_met");
    return { ...clause, review, state, blocks };
  });

  // Per milestone, because a clause governs one condition and should not hold
  // up the other two.
  const byMilestone = {};
  for (const milestone of MILESTONES) {
    const mine = rows.filter((row) => row.milestone === milestone);
    const blocking = mine.filter((row) => row.blocks);
    byMilestone[milestone] = {
      declared: mine.length,
      interpretive: mine.filter((row) => row.kind === "interpretive").length,
      awaiting: mine.filter((row) => row.state === "awaiting").length,
      notMet: mine.filter((row) => row.state === "not_met").length,
      blocked: blocking.length > 0,
      blockedBy: blocking.map((row) => ({
        id: row.id,
        text: row.text,
        state: row.state,
        reviewer: row.reviewer
      })),
      reason: blocking.length
        ? blocking.some((row) => row.state === "not_met")
          ? "Sebuah klausul interpretatif dinilai tidak terpenuhi."
          : "Sebuah klausul interpretatif belum dinilai siapa pun."
        : null
    };
  }

  return {
    // False when the escrow declared no clauses at all — every escrow created
    // before this existed is in that state, and it must behave exactly as it
    // did before.
    declared: rows.length > 0,
    clauses: rows,
    milestones: byMilestone
  };
}

module.exports = {
  VERDICTS,
  MILESTONES,
  MIN_REASONING,
  normaliseClauses,
  review,
  reviewsFor,
  assess
};
