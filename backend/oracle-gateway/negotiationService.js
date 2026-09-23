// Negotiating a way out of a dispute, before the arbiter has to impose one.
//
// What the contract does today when a dispute is raised: the escrow freezes,
// and the only way out is `resolveDispute`, which the arbiter alone may call,
// and which is BINARY — everything to the exporter, or everything back to the
// importer. There is no middle.
//
// That is a fine backstop and a poor first resort. Most real trade disputes
// are not "who was right" but "what is this shipment now worth" — a quality
// claim settles at 85% of invoice, a late arrival at a discount. A mechanism
// that can only award all or nothing pushes both parties to fight for all,
// because conceding costs them everything.
//
// So this sits in front of the arbiter: while the dispute is open, the importer
// and the exporter exchange concrete, recorded proposals. When both sign the
// same one, the gateway pins the agreement and the arbiter executes THAT
// instead of deciding for them. The arbiter's own reasoningCid becomes the
// agreement's address, so what is written on chain is the parties' settlement
// rather than a third party's guess at it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LIMIT, STATED PLAINLY, BECAUSE THE UI HAS TO STATE IT TOO
//
// `resolveDispute(escrowId, releaseToExporter, reasoningCid, slashVerifier,
// bondFrivolous)` writes either _release() or _refund(). Neither takes an
// amount, so a split is not something that call can carry out. The contract in
// this repo now also has `resolveDisputeByAgreement(escrowId, amountToExporter,
// agreementCid)`, which can.
//
// But "the contract in this repo" is not "the contract the gateway is pointed
// at". A deployment made before that function existed cannot settle a split no
// matter what this file believes. So executability is not hardcoded here: it is
// probed against the deployed bytecode (contractService.supportsAgreementSettlement)
// and reported per escrow.
//
// When the probe says no, a split agreement is still recorded — it is what the
// parties actually agreed, and it is anchored — but it is marked unexecutable
// and the redeploy is named. Pretending a split can be settled, and then
// quietly performing the nearest binary outcome, would put a number on screen
// that the money does not follow. See docs/NEGOSIASI-SENGKETA.md.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");

const OUTCOMES = {
  release_to_exporter: {
    label: "Dana dilepas ke eksportir",
    executable: true,
    contractCall: "resolveDispute(escrowId, true, agreementCid, …)"
  },
  refund_to_importer: {
    label: "Dana dikembalikan ke importir",
    executable: true,
    contractCall: "resolveDispute(escrowId, false, agreementCid, …)"
  },
  split: {
    label: "Dibagi sesuai kesepakatan",
    // null, not false: whether a split can be executed depends on which version
    // of the contract is deployed, and that is a question for the chain.
    executable: null,
    contractCall: "resolveDisputeByAgreement(escrowId, amountToExporter, agreementCid)",
    why: "Kontrak yang ter-deploy di alamat ini hanya bisa melepas seluruhnya atau mengembalikan seluruhnya. Pembagian sebagian butuh deploy ulang dengan resolveDisputeByAgreement()."
  }
};

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const MIN_NOTE = 20;
const MAX_PROPOSALS = 20;

function appError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function storePath() {
  return config.negotiationStoreFile || path.resolve(__dirname, "../data/negotiations.json");
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

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

/**
 * Who this escrow's parties are, and whether a dispute is actually open.
 *
 * Read from the chain rather than taken from the request: the caller says who
 * they are, and a store that believed them would let anyone post a proposal in
 * a counterparty's name.
 */
async function context(escrowId) {
  const { getEscrow, getDispute } = require("./contractService");
  const [escrow, dispute] = await Promise.all([getEscrow(escrowId), getDispute(escrowId)]);
  return {
    importer: escrow.importer,
    exporter: escrow.exporter,
    arbiter: escrow.arbiter,
    contractValue: escrow.contractValue,
    value: escrow.value,
    state: escrow.state,
    disputeOpen: dispute.open === true,
    disputedMilestone: dispute.contestedMilestone,
    raisedBy: dispute.raisedBy
  };
}

function roleOf(ctx, address) {
  if (same(ctx.importer, address)) return "importer";
  if (same(ctx.exporter, address)) return "exporter";
  return null;
}

function normaliseOutcome(input, contractValue) {
  const outcome = String(input.outcome || "").trim();
  if (!OUTCOMES[outcome]) {
    throw appError(
      `Outcome harus salah satu dari: ${Object.keys(OUTCOMES).join(", ")}.`,
      422,
      "OUTCOME_INVALID"
    );
  }

  if (outcome !== "split") return { outcome, splitToExporterBps: null, amountToExporter: null };

  const bps = Number(input.splitToExporterBps);
  if (!Number.isInteger(bps) || bps < 1 || bps > 9999) {
    throw appError(
      "Untuk pembagian, splitToExporterBps harus bilangan bulat 1–9999 (mis. 8500 untuk 85%). 0 dan 10000 bukan pembagian — pakai refund_to_importer atau release_to_exporter.",
      422,
      "SPLIT_INVALID"
    );
  }

  // Computed here, in the token's own smallest unit, so the figure the parties
  // sign is the figure a contract call would move — not a percentage someone
  // has to re-derive later.
  let amountToExporter = null;
  try {
    amountToExporter = ((BigInt(contractValue) * BigInt(bps)) / 10000n).toString();
  } catch {
    amountToExporter = null;
  }

  return { outcome, splitToExporterBps: bps, amountToExporter };
}

/**
 * Posts a proposal. Only a party to the escrow may, and only while the dispute
 * the negotiation is about is actually open.
 */
async function propose(escrowId, input = {}) {
  const id = String(escrowId || "").trim();
  if (!/^\d+$/.test(id)) throw appError("An escrow id is required.", 422, "ESCROW_ID_INVALID");

  const by = String(input.by || "").trim();
  if (!ADDRESS.test(by)) throw appError("Alamat pengusul diperlukan.", 422, "PARTY_INVALID");

  const note = String(input.note || "").trim();
  if (note.length < MIN_NOTE) {
    throw appError(
      `Tulis alasan usulannya, minimal ${MIN_NOTE} karakter. Usulan angka tanpa alasan tidak bisa ditanggapi, hanya bisa ditolak.`,
      422,
      "NOTE_REQUIRED"
    );
  }

  const ctx = await context(id);
  const role = roleOf(ctx, by);
  if (!role) {
    throw appError("Hanya importir atau eksportir yang bisa mengusulkan penyelesaian.", 403, "NOT_A_PARTY");
  }
  if (!ctx.disputeOpen) {
    throw appError(
      "Negosiasi ini untuk sengketa yang sedang terbuka. Tidak ada sengketa terbuka di escrow ini.",
      409,
      "NO_OPEN_DISPUTE"
    );
  }

  const store = load();
  const record = store[id] || { escrowId: id, status: "open", proposals: [], agreement: null };

  if (record.agreement) {
    throw appError(
      "Kedua pihak sudah menyepakati satu usulan. Tarik kesepakatan itu dulu kalau mau mengubahnya.",
      409,
      "ALREADY_AGREED"
    );
  }
  if (record.proposals.length >= MAX_PROPOSALS) {
    throw appError(
      `Sudah ada ${MAX_PROPOSALS} usulan tanpa kesepakatan. Ini bukan lagi negosiasi — serahkan ke arbiter.`,
      409,
      "TOO_MANY_PROPOSALS"
    );
  }

  const { outcome, splitToExporterBps, amountToExporter } = normaliseOutcome(input, ctx.contractValue);

  const proposal = {
    id: `pr${record.proposals.length + 1}`,
    by,
    byRole: role,
    outcome,
    outcomeLabel: OUTCOMES[outcome].label,
    splitToExporterBps,
    amountToExporter,
    note,
    at: new Date().toISOString(),
    // The counterparty's acceptance. A proposer accepting their own proposal
    // would be a one-sided settlement, so it is not allowed — the same rule
    // approveDeadlineExtension enforces on chain.
    acceptedBy: null,
    acceptedAt: null,
    superseded: false
  };

  // A new proposal supersedes the open ones: two live offers on the table is
  // how a party ends up accepting the one the other side had already moved off.
  for (const previous of record.proposals) {
    if (!previous.acceptedBy) previous.superseded = true;
  }

  record.proposals.push(proposal);
  record.status = "open";
  store[id] = record;
  save(store);

  return { ...proposal, executable: OUTCOMES[outcome].executable };
}

/**
 * The counterparty accepts. That is the moment the settlement becomes the
 * parties' own, so the agreement is pinned here and its CID is what the
 * arbiter is asked to write on chain.
 */
async function accept(escrowId, proposalId, input = {}) {
  const id = String(escrowId || "").trim();
  const by = String(input.by || "").trim();
  if (!ADDRESS.test(by)) throw appError("Alamat penerima diperlukan.", 422, "PARTY_INVALID");

  const ctx = await context(id);
  const role = roleOf(ctx, by);
  if (!role) throw appError("Hanya importir atau eksportir yang bisa menyetujui.", 403, "NOT_A_PARTY");
  if (!ctx.disputeOpen) {
    throw appError("Tidak ada sengketa terbuka di escrow ini.", 409, "NO_OPEN_DISPUTE");
  }

  const store = load();
  const record = store[id];
  if (!record) throw appError("Belum ada usulan di escrow ini.", 404, "NO_NEGOTIATION");
  if (record.agreement) throw appError("Sudah ada kesepakatan.", 409, "ALREADY_AGREED");

  const proposal = record.proposals.find((item) => item.id === proposalId);
  if (!proposal) throw appError("Usulan tidak ditemukan.", 404, "PROPOSAL_NOT_FOUND");
  if (proposal.superseded) {
    throw appError(
      "Usulan ini sudah digantikan usulan yang lebih baru. Tanggapi yang terakhir.",
      409,
      "PROPOSAL_SUPERSEDED"
    );
  }
  if (same(proposal.by, by)) {
    throw appError(
      "Pengusul tidak bisa menyetujui usulannya sendiri — kesepakatan butuh dua pihak.",
      403,
      "SELF_ACCEPT"
    );
  }

  proposal.acceptedBy = by;
  proposal.acceptedAt = new Date().toISOString();

  const agreement = {
    stern: "stern/dispute-agreement@1",
    escrowId: id,
    proposalId: proposal.id,
    outcome: proposal.outcome,
    splitToExporterBps: proposal.splitToExporterBps,
    amountToExporter: proposal.amountToExporter,
    contractValue: ctx.contractValue,
    currency: "IDRT-demo",
    disputedMilestone: ctx.disputedMilestone,
    note: proposal.note,
    proposedBy: proposal.by,
    acceptedBy: by,
    parties: { importer: ctx.importer, exporter: ctx.exporter, arbiter: ctx.arbiter },
    agreedAt: proposal.acceptedAt
  };

  let cid = null;
  let pinError = null;
  try {
    const { pinDocument } = require("./ipfsService");
    const pinned = await pinDocument(
      Buffer.from(`${JSON.stringify(agreement, null, 2)}\n`, "utf8"),
      `stern-agreement-${id}.json`
    );
    cid = pinned.cid;
  } catch (error) {
    pinError = error.message;
  }

  record.agreement = {
    ...agreement,
    cid,
    ...(pinError ? { notPinned: pinError } : {})
  };
  record.status = "agreed";
  store[id] = record;
  save(store);

  return execution(record.agreement, await splitSupport());
}

/**
 * Can the contract at the configured address settle a split?
 *
 * Asked of the chain, not of this file. The answer flips on its own the moment
 * a deployment that has the function is pointed at, and it fails closed: a
 * probe that could not run reports "no", because telling the parties a split is
 * executable and then failing the transaction is worse than telling them it is
 * not and being pleasantly wrong.
 */
async function splitSupport() {
  try {
    const { supportsAgreementSettlement } = require("./contractService");
    const supported = await supportsAgreementSettlement();
    return supported ? { supported: true } : { supported: false, reason: OUTCOMES.split.why };
  } catch (error) {
    return {
      supported: false,
      reason: `Tidak bisa memastikan kontrak yang ter-deploy mendukung pembagian: ${error.message}`
    };
  }
}

/**
 * What the arbiter should now do, and whether the deployed contract can do it.
 *
 * This is the honest half of the feature. An agreed split is a real agreement
 * and a real record either way; whether it can be carried out is a fact about
 * the deployment, and the caller is told which it is.
 */
function execution(agreement, split = { supported: false }) {
  if (!agreement) return null;
  const spec = OUTCOMES[agreement.outcome];
  const executable = spec.executable === null ? split.supported === true : spec.executable;
  const blockedReason = spec.executable === null ? split.reason : null;
  return {
    ...agreement,
    executable,
    contractCall: spec.contractCall,
    ...(executable
      ? {}
      : {
          blockedReason: blockedReason || spec.why,
          // Offered rather than performed: the parties may prefer to fall back
          // to a binary outcome, but that is their decision to make, not this
          // gateway's to make quietly on their behalf.
          fallback:
            "Sepakati ulang sebagai release_to_exporter atau refund_to_importer, atau deploy ulang kontrak dengan resolveDisputeByAgreement()."
        }),
    arbiterInstruction: executable
      ? `Arbiter memanggil ${spec.contractCall} dengan reasoningCid = CID kesepakatan ini.`
      : `Arbiter belum bisa mengeksekusi ini pada kontrak yang ter-deploy.`
  };
}

/**
 * The accepted agreement, for the arbiter's settlement call to read the amount
 * out of. `proposalId` has to be named by the caller so that executing a
 * settlement means executing a specific agreement, not whatever happens to be
 * stored under the escrow at the time.
 */
function acceptedAgreement(escrowId, proposalId) {
  const record = load()[String(escrowId)];
  if (!record?.agreement) {
    throw appError("Belum ada kesepakatan yang bisa dieksekusi di escrow ini.", 404, "NO_AGREEMENT");
  }
  if (record.agreement.proposalId !== String(proposalId)) {
    throw appError(
      `Kesepakatan yang tersimpan untuk escrow ini adalah ${record.agreement.proposalId}, bukan ${proposalId}.`,
      409,
      "AGREEMENT_MISMATCH"
    );
  }
  return { ...record.agreement, agreementCid: record.agreement.cid || null };
}

/** Withdraws an agreement, so the parties can renegotiate. Either party may. */
async function withdraw(escrowId, input = {}) {
  const id = String(escrowId || "").trim();
  const by = String(input.by || "").trim();
  if (!ADDRESS.test(by)) throw appError("Alamat diperlukan.", 422, "PARTY_INVALID");

  const ctx = await context(id);
  if (!roleOf(ctx, by)) throw appError("Hanya importir atau eksportir.", 403, "NOT_A_PARTY");

  const store = load();
  const record = store[id];
  if (!record?.agreement) throw appError("Tidak ada kesepakatan untuk ditarik.", 404, "NO_AGREEMENT");

  // Kept, not deleted: an agreement that existed and was withdrawn is part of
  // how this dispute went, and the arbiter should be able to see it.
  record.withdrawn = [...(record.withdrawn || []), { ...record.agreement, withdrawnBy: by, withdrawnAt: new Date().toISOString() }];
  record.agreement = null;
  record.status = "open";
  for (const proposal of record.proposals) {
    if (proposal.acceptedBy) {
      proposal.acceptedBy = null;
      proposal.acceptedAt = null;
      proposal.superseded = true;
    }
  }
  store[id] = record;
  save(store);

  return { ok: true, withdrawnBy: by };
}

/** The whole negotiation for an escrow, for the panel to render. */
async function forEscrow(escrowId) {
  const split = await splitSupport();
  // The panel needs to know a split is unexecutable BEFORE anyone proposes one,
  // not after both parties have signed it, so the resolved outcomes ship with
  // the thread rather than only with the agreement.
  const outcomes = {
    ...OUTCOMES,
    split: {
      ...OUTCOMES.split,
      executable: split.supported === true,
      ...(split.supported ? {} : { why: split.reason || OUTCOMES.split.why })
    }
  };

  const record = load()[String(escrowId)];
  if (!record) {
    return {
      escrowId: String(escrowId),
      status: "none",
      proposals: [],
      agreement: null,
      withdrawn: [],
      outcomes
    };
  }
  return {
    ...record,
    agreement: execution(record.agreement, split),
    withdrawn: record.withdrawn || [],
    outcomes
  };
}

module.exports = {
  OUTCOMES,
  MIN_NOTE,
  propose,
  accept,
  withdraw,
  forEscrow,
  execution,
  acceptedAgreement,
  splitSupport
};
