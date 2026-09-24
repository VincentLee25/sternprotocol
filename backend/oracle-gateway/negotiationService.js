const fs = require("node:fs");
const crypto = require("node:crypto");
const { verifyMessage } = require("ethers");
const { config } = require("./config");

let pool;
const OUTCOMES = {
  release_to_exporter: { label: "Release to exporter", executable: true, contractCall: "resolveDispute" },
  refund_to_importer: { label: "Refund to importer", executable: true, contractCall: "resolveDispute" },
  split: { label: "Split by agreement", executable: null, contractCall: "resolveDisputeByAgreement" }
};
const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const fail = (message, statusCode = 400, code = "DISPUTE_ERROR") => Object.assign(new Error(message), { statusCode, code });
const escrowRef = (id) => require("./contractService").parseEscrowRef(id).escrowId;
const blank = (id) => ({ escrowId: id, status: "none", proposals: [], agreement: null, withdrawn: [] });
function setPool(value) { pool = value; }
function db() { if (!pool) throw fail("Dispute database is not ready.", 503, "DATABASE_NOT_READY"); return pool; }

async function importLegacy() {
  const file = config.negotiationStoreFile;
  if (!fs.existsSync(file)) return;
  const records = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [id, record] of Object.entries(records)) {
    const existing = await db().query("SELECT record FROM dispute_threads WHERE escrow_ref=$1", [id]);
    if (existing.rows.length) {
      const imported = existing.rows[0].record;
      // A previously imported record may now have legitimate PG-only messages,
      // proposals, or agreement changes. Never overwrite it on restart.
      if (imported.escrowId !== record.escrowId) {
        throw fail(`Legacy negotiation ${id} conflicts with PostgreSQL. Inspect before continuing.`, 409, "NEGOTIATION_IMPORT_CONFLICT");
      }
      continue;
    }
    await db().query("INSERT INTO dispute_threads(escrow_ref,record) VALUES($1,$2)", [id, record]);
  }
}
async function context(id) {
  const { getEscrow, getDispute } = require("./contractService");
  const [escrow, dispute] = await Promise.all([getEscrow(id), getDispute(id)]);
  return { importer: escrow.importer, exporter: escrow.exporter, arbiter: escrow.arbiter,
    contractValue: String(escrow.contractValue), disputedMilestone: dispute.contestedMilestone,
    disputeOpen: dispute.open === true };
}
function party(ctx, identity) {
  const address = identity?.user?.walletAddress;
  if (same(ctx.importer, address)) return "importer";
  if (same(ctx.exporter, address)) return "exporter";
  throw fail("Only a registered escrow party can perform this action.", 403, "NOT_A_PARTY");
}
function arbiter(ctx, identity) {
  const user = identity?.user;
  if (!same(ctx.arbiter, user?.walletAddress) && !same(ctx.arbiter, user?.eoaOwnerAddress)) {
    throw fail("Only the designated arbiter can request inspection.", 403, "NOT_ARBITER");
  }
}
function requireOpen(ctx) { if (!ctx.disputeOpen) throw fail("No open dispute.", 409, "NO_OPEN_DISPUTE"); }
function normalize(input, value) {
  if (!OUTCOMES[input.outcome]) throw fail("Invalid settlement outcome.", 422, "OUTCOME_INVALID");
  if (input.outcome !== "split") return { outcome: input.outcome, splitToExporterBps: null, amountToExporter: null };
  const bps = Number(input.splitToExporterBps);
  if (!Number.isInteger(bps) || bps < 1 || bps > 9999) throw fail("Split must be 1 to 9999 basis points.", 422, "SPLIT_INVALID");
  return { outcome: "split", splitToExporterBps: bps, amountToExporter: (BigInt(value) * BigInt(bps) / 10000n).toString() };
}
function terms(id, input, ctx) {
  const note = String(input.note || "").trim();
  if (note.length < 20 || note.length > 4000) throw fail("A 20 to 4000 character reason is required.", 422, "NOTE_INVALID");
  return { stern: "stern/dispute-settlement@2", escrowRef: id, contractValue: ctx.contractValue,
    importer: ctx.importer.toLowerCase(), exporter: ctx.exporter.toLowerCase(),
    ...normalize(input, ctx.contractValue), note };
}
const signingMessage = (value) => `STERN dispute settlement\n${JSON.stringify(value)}`;
function verifySignature(message, signature, owner) {
  if (!owner || !signature) throw fail("A Particle owner signature is required.", 422, "SIGNATURE_REQUIRED");
  let signer;
  try { signer = verifyMessage(message, signature); } catch { throw fail("Invalid signature.", 422, "SIGNATURE_INVALID"); }
  if (!same(signer, owner)) throw fail("Signature does not match the authenticated Particle owner.", 403, "SIGNER_MISMATCH");
}
async function read(id, client = db()) {
  const { rows } = await client.query("SELECT record FROM dispute_threads WHERE escrow_ref=$1", [id]);
  return rows[0]?.record || blank(id);
}
async function lock(client, id) {
  await client.query("INSERT INTO dispute_threads(escrow_ref,record) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, blank(id)]);
  const { rows } = await client.query("SELECT record FROM dispute_threads WHERE escrow_ref=$1 FOR UPDATE", [id]);
  return rows[0].record;
}
const save = (client, id, record) => client.query("UPDATE dispute_threads SET record=$2,updated_at=now() WHERE escrow_ref=$1", [id, record]);
async function transaction(callback) {
  const client = await db().connect();
  try { await client.query("BEGIN"); const value = await callback(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
async function splitSupport(id) {
  const contracts = require("./contractService");
  const supported = await contracts.supportsAgreementSettlement(id);
  return { supported, generation: contracts.parseEscrowRef(id).generation,
    reason: supported ? null : "Partial settlement requires a V2 or V3 escrow." };
}
function execution(agreement, split) {
  if (!agreement) return null;
  const executable = Boolean(agreement.signatures?.proposer?.signature && agreement.signatures?.accepter?.signature && agreement.cid) &&
    (agreement.outcome !== "split" || split.supported);
  return { ...agreement, executable,
    contractCall: split.generation === "v3" ? "resolveDisputeByAgreement" : OUTCOMES[agreement.outcome].contractCall,
    ...(!executable ? { blockedReason: agreement.signatures ? split.reason : "Earlier agreement requires fresh signed approval from both parties." } : {}) };
}
async function prepareProposal(escrowId, input, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); party(ctx, identity); requireOpen(ctx);
  if (input.outcome === "split" && !(await splitSupport(id)).supported) {
    throw fail("This escrow's contract cannot execute a split settlement.", 422, "SPLIT_UNSUPPORTED");
  }
  return { signingMessage: signingMessage(terms(id, input, ctx)) };
}
async function propose(escrowId, input, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); const byRole = party(ctx, identity); requireOpen(ctx);
  if (input.outcome === "split" && !(await splitSupport(id)).supported) {
    throw fail("This escrow's contract cannot execute a split settlement.", 422, "SPLIT_UNSUPPORTED");
  }
  const exact = terms(id, input, ctx); const message = signingMessage(exact);
  verifySignature(message, input.signature, identity.user.eoaOwnerAddress);
  return transaction(async client => {
    const record = await lock(client, id);
    if (record.agreement) throw fail("Withdraw the agreement before proposing again.", 409, "ALREADY_AGREED");
    if (record.proposals.length >= 20) throw fail("Proposal limit reached.", 409, "TOO_MANY_PROPOSALS");
    for (const old of record.proposals) if (!old.acceptedBy) old.superseded = true;
    const proposal = { id: crypto.randomUUID(), by: identity.user.walletAddress, byRole,
      ...normalize(input, ctx.contractValue), outcomeLabel: OUTCOMES[input.outcome].label,
      note: exact.note, terms: exact, signingMessage: message,
      proposerSignature: input.signature, proposerSigner: identity.user.eoaOwnerAddress,
      at: new Date().toISOString(), acceptedBy: null, acceptedAt: null, superseded: false };
    record.proposals.push(proposal); record.status = "open"; await save(client, id, record);
    return proposal;
  });
}
async function accept(escrowId, proposalId, input, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); party(ctx, identity); requireOpen(ctx);
  const record = await read(id); const candidate = record.proposals.find(p => p.id === proposalId);
  if (!candidate || candidate.superseded || record.agreement) throw fail("Proposal is no longer open.", 409, "PROPOSAL_UNAVAILABLE");
  if (same(candidate.by, identity.user.walletAddress)) throw fail("Cannot accept your own proposal.", 403, "SELF_ACCEPT");
  verifySignature(candidate.signingMessage, candidate.proposerSignature, candidate.proposerSigner);
  verifySignature(candidate.signingMessage, input.signature, identity.user.eoaOwnerAddress);
  const document = { ...candidate.terms, proposalId, signatures: {
    proposer: { address: candidate.proposerSigner, signature: candidate.proposerSignature },
    accepter: { address: identity.user.eoaOwnerAddress, signature: input.signature }
  } };
  const pinned = await require("./ipfsService").pinDocument(Buffer.from(JSON.stringify(document)), `stern-agreement-${id}.json`);
  if (!pinned?.cid) throw fail("Agreement pinning failed.", 503, "AGREEMENT_PIN_FAILED");
  return transaction(async client => {
    const current = await lock(client, id); const proposal = current.proposals.find(p => p.id === proposalId);
    if (!proposal || proposal.superseded || current.agreement || proposal.signingMessage !== candidate.signingMessage) {
      throw fail("Proposal changed while signing.", 409, "PROPOSAL_CHANGED");
    }
    proposal.acceptedBy = identity.user.walletAddress; proposal.acceptedAt = new Date().toISOString();
    current.agreement = { ...document, escrowId: id, proposedBy: proposal.by, acceptedBy: proposal.acceptedBy,
      agreedAt: proposal.acceptedAt, cid: pinned.cid, signingMessage: candidate.signingMessage };
    current.status = "agreed"; await save(client, id, current);
    return execution(current.agreement, await splitSupport(id));
  });
}
async function acceptedAgreement(escrowId, proposalId) {
  const id = escrowRef(escrowId); const record = await read(id); const agreement = record.agreement;
  if (!agreement || agreement.proposalId !== proposalId || !agreement.cid) throw fail("No matching pinned agreement.", 404, "NO_AGREEMENT");
  const proposal = record.proposals.find(p => p.id === proposalId);
  const ctx = await context(id); requireOpen(ctx);
  if (!proposal || proposal.signingMessage !== agreement.signingMessage || String(ctx.contractValue) !== String(agreement.contractValue)) {
    throw fail("Agreement no longer matches escrow terms.", 409, "TERMS_MISMATCH");
  }
  if (!same(proposal.by, ctx.importer) && !same(proposal.by, ctx.exporter)) throw fail("Proposer is not a party.", 403, "NOT_A_PARTY");
  if (!same(agreement.acceptedBy, same(proposal.by, ctx.importer) ? ctx.exporter : ctx.importer)) throw fail("Counterparty did not approve.", 403, "COUNTERPARTY_MISMATCH");
  verifySignature(agreement.signingMessage, agreement.signatures.proposer.signature, agreement.signatures.proposer.address);
  verifySignature(agreement.signingMessage, agreement.signatures.accepter.signature, agreement.signatures.accepter.address);
  return { ...agreement, agreementCid: agreement.cid };
}
async function withdraw(escrowId, _input, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); party(ctx, identity); requireOpen(ctx);
  return transaction(async client => {
    const record = await lock(client, id);
    if (!record.agreement) throw fail("No agreement to withdraw.", 404, "NO_AGREEMENT");
    record.withdrawn.push({ ...record.agreement, withdrawnBy: identity.user.walletAddress, withdrawnAt: new Date().toISOString() });
    record.agreement = null; record.status = "open";
    for (const proposal of record.proposals) if (proposal.acceptedBy) proposal.superseded = true;
    await save(client, id, record); return { ok: true };
  });
}
async function postMessage(escrowId, content, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); const role = party(ctx, identity); requireOpen(ctx);
  const body = String(content || "").trim();
  if (!body || body.length > 4000) throw fail("Message must be 1 to 4000 characters.", 422, "MESSAGE_INVALID");
  return transaction(async client => {
    await lock(client, id);
    const { rows } = await client.query(`INSERT INTO dispute_messages(escrow_ref,sender_user_id,sender_address,sender_role,content)
      VALUES($1,$2,$3,$4,$5) RETURNING id,sender_address AS sender,sender_role AS role,content,created_at AS "createdAt"`,
      [id, identity.user.id, identity.user.walletAddress, role, body]);
    return rows[0];
  });
}
async function requestInspection(escrowId, input, identity) {
  const id = escrowRef(escrowId); const ctx = await context(id); arbiter(ctx, identity); requireOpen(ctx);
  const provider = String(input.provider || "").trim(), reason = String(input.reason || "").trim();
  const requested = String(input.requestedEvidence || "").trim();
  if (!provider || !reason || !requested || [provider, reason, requested].some(v => v.length > 1000)) throw fail("Provider, reason and requested evidence are required.", 422, "INSPECTION_INVALID");
  return transaction(async client => {
    await lock(client, id);
    const { rows } = await client.query(`INSERT INTO dispute_inspections(id,escrow_ref,provider,reason,requested_evidence,status,requested_by_user_id)
      VALUES($1,$2,$3,$4,$5,'requested',$6) RETURNING *`,
      [crypto.randomUUID(), id, provider, reason, requested, identity.user.id]);
    return rows[0];
  });
}
async function submitInspection(escrowId, inspectionId, input) {
  const id = escrowRef(escrowId); const ctx = await context(id); requireOpen(ctx);
  const cid = String(input.evidenceCid || "").trim(), note = String(input.note || "").trim(), provider = String(input.provider || "").trim();
  if (!/^bafy[a-z2-7]{20,}$/i.test(cid) || !provider || !note) throw fail("Provider, evidence CID and note are required.", 422, "EVIDENCE_INVALID");
  const evidence = await require("./ipfsService").fetchByCid(cid);
  if (!evidence) throw fail("Evidence CID could not be retrieved.", 422, "EVIDENCE_NOT_FOUND");
  const { rows } = await db().query(`UPDATE dispute_inspections SET status='submitted',evidence_cid=$3,evidence_note=$4,submitted_at=now()
    WHERE escrow_ref=$1 AND id=$2 AND provider=$5 AND status='requested' RETURNING *`, [id, inspectionId, cid, note, provider]);
  if (!rows.length) throw fail("Inspection unavailable.", 404, "INSPECTION_UNAVAILABLE");
  return rows[0];
}
async function forEscrow(escrowId) {
  const id = escrowRef(escrowId);
  const [record, messages, inspections, split] = await Promise.all([
    read(id),
    db().query(`SELECT id,sender_address AS sender,sender_role AS role,content,created_at AS "createdAt" FROM dispute_messages WHERE escrow_ref=$1 ORDER BY id`, [id]),
    db().query("SELECT * FROM dispute_inspections WHERE escrow_ref=$1 ORDER BY requested_at", [id]),
    splitSupport(id)
  ]);
  return { ...record, agreement: execution(record.agreement, split), messages: messages.rows,
    inspections: inspections.rows, outcomes: { ...OUTCOMES, split: { ...OUTCOMES.split, executable: split.supported, why: split.reason } } };
}
module.exports = { OUTCOMES, setPool, importLegacy, prepareProposal, propose, accept, withdraw,
  postMessage, requestInspection, submitInspection, forEscrow, acceptedAgreement, splitSupport };
