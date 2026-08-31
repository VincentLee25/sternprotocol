// Mock escrow registry + verifier gateway matching docs/02_API_SPEC.md and
// the state machine in docs/01_CONTRACT_SPEC.md. Two call patterns, kept
// distinct on purpose (see 02_API_SPEC.md "Prinsip pembagian kerja"):
//   - importer/exporter actions (create, dispute, refund) are written here
//     as if signed by the connected Particle smart account directly against
//     the contract — swap for real ethers.js calls via contract.js once a
//     Fase-0 contract is deployed and Particle is wired in.
//   - verifier institution actions (submitMilestoneProof) go through this
//     "backend", because those wallets are EOAs the gateway manages, not
//     something in the browser.
import { fakeAddress, fakeTxHash } from "./mockBackend.js";
import { MILESTONES } from "./milestones.js";

const CHALLENGE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h, docs/01_CONTRACT_SPEC.md §8
const TIMELOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24h
const DISPUTE_BOND_BPS = 200; // 2%

export const DEMO_PARTIES = {
  importer: fakeAddress("demo-importer"),
  exporter: fakeAddress("demo-exporter"),
  arbiter: fakeAddress("demo-arbiter")
};

export const VERIFIERS = [
  { address: fakeAddress("sucofindo"), name: "Sucofindo", role: "ROLE_QUALITY_AUDITOR", bond: "10000000.00", slashCount: 0, active: true },
  { address: fakeAddress("maersk-line"), name: "Maersk Line", role: "ROLE_LOGISTICS", bond: "10000000.00", slashCount: 0, active: true },
  { address: fakeAddress("customs-broker"), name: "Bea Cukai Tanjung Priok", role: "ROLE_CUSTOMS", bond: "10000000.00", slashCount: 0, active: true }
];

const wait = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

const store = { nextId: 12, escrows: new Map() };

function emptyMilestoneProof() {
  return { submitted: false, verifier: null, verifierName: null, proofCid: null, submittedAt: null, challengeDeadline: null, automatedCheckPassed: null };
}

function record(escrowId) {
  const escrow = store.escrows.get(String(escrowId));
  if (!escrow) {
    const error = new Error(`Escrow ${escrowId} not found`);
    error.status = 404;
    throw error;
  }
  return escrow;
}

function pushActivity(escrow, entry) {
  escrow.activity.unshift({ time: new Date().toISOString(), transactionHash: fakeTxHash(), ...entry });
}

// Seed one in-flight escrow so Overview isn't empty on first load — makes
// the Inspected/Shipped milestones already-verified so the detail page
// demonstrates the challenge-window + next-milestone state on first look.
(function seedDemoEscrow() {
  const now = Date.now();
  const inspectedAt = now - 1000 * 60 * 60 * 30;
  const shippedAt = now - 1000 * 60 * 60 * 4;
  const { importer, exporter, arbiter } = DEMO_PARTIES;
  const sucofindo = VERIFIERS[0];
  const maersk = VERIFIERS[1];

  const escrow = {
    escrowId: "12",
    state: "Shipped",
    commodity: "Arabica Gayo Grade 1",
    containerRef: "TGHU-2026-001",
    value: "45000000.00",
    documentCid: "bafybeisterndoc001",
    importer,
    exporter,
    arbiter,
    globalDeadline: new Date(now + 1000 * 60 * 60 * 24 * 20).toISOString(),
    createdAt: new Date(now - 1000 * 60 * 60 * 36).toISOString(),
    milestones: {
      inspected: {
        submitted: true,
        verifier: sucofindo.address,
        verifierName: sucofindo.name,
        proofCid: "bafybeiproof001",
        submittedAt: new Date(inspectedAt).toISOString(),
        challengeDeadline: new Date(inspectedAt + CHALLENGE_WINDOW_MS).toISOString(),
        automatedCheckPassed: true
      },
      shipped: {
        submitted: true,
        verifier: maersk.address,
        verifierName: maersk.name,
        proofCid: "bafybeiproof002",
        submittedAt: new Date(shippedAt).toISOString(),
        challengeDeadline: new Date(shippedAt + CHALLENGE_WINDOW_MS).toISOString(),
        automatedCheckPassed: true
      },
      arrivedCleared: emptyMilestoneProof()
    },
    timelock: { active: false, releaseAt: null },
    dispute: { open: false, raisedBy: null, contestedMilestone: null, bondAmount: null, raisedAt: null, resolved: false },
    activity: [
      { time: new Date(shippedAt).toISOString(), type: "milestone_verified", actor: maersk.name, actorAddress: maersk.address, text: "Shipped milestone verified, proof uploaded", transactionHash: fakeTxHash() },
      { time: new Date(inspectedAt).toISOString(), type: "milestone_verified", actor: sucofindo.name, actorAddress: sucofindo.address, text: "Inspected milestone verified, proof uploaded", transactionHash: fakeTxHash() },
      { time: new Date(now - 1000 * 60 * 60 * 36).toISOString(), type: "escrow_created", actor: "importer", actorAddress: importer, text: "Escrow created, 45,000,000 IDRT-demo locked", transactionHash: fakeTxHash() }
    ]
  };
  store.escrows.set(escrow.escrowId, escrow);
})();

// --- §3 Escrow registry ---------------------------------------------------
export async function listEscrows({ role, address, state } = {}) {
  await wait(400);
  let rows = Array.from(store.escrows.values());
  if (state) rows = rows.filter((e) => e.state === state);
  if (address && role) rows = rows.filter((e) => e[role]?.toLowerCase() === address.toLowerCase());
  return {
    escrows: rows.map((e) => ({
      escrowId: e.escrowId,
      state: e.state,
      commodity: e.commodity,
      containerRef: e.containerRef,
      value: e.value,
      currency: "IDRT-demo",
      importer: e.importer,
      exporter: e.exporter,
      arbiter: e.arbiter,
      globalDeadline: e.globalDeadline,
      createdAt: e.createdAt
    })),
    total: rows.length
  };
}

export async function getEscrow(escrowId) {
  await wait(300);
  const e = record(escrowId);
  return {
    escrowId: e.escrowId,
    state: e.state,
    commodity: e.commodity,
    containerRef: e.containerRef,
    value: e.value,
    currency: "IDRT-demo",
    documentCid: e.documentCid,
    importer: e.importer,
    exporter: e.exporter,
    arbiter: e.arbiter,
    globalDeadline: e.globalDeadline,
    createdAt: e.createdAt,
    milestones: e.milestones,
    timelock: e.timelock,
    dispute: { open: e.dispute.open }
  };
}

export async function getTimelock(escrowId) {
  await wait(200);
  const e = record(escrowId);
  const releaseAt = e.timelock.releaseAt ? new Date(e.timelock.releaseAt).getTime() : null;
  return {
    escrowId: e.escrowId,
    state: e.state,
    timelockReleaseAt: e.timelock.releaseAt,
    canDispute: e.state !== "Completed" && e.state !== "Refunded",
    canRelease: e.state === "TimelockActive" && releaseAt !== null && Date.now() >= releaseAt,
    secondsRemaining: releaseAt ? Math.max(0, Math.round((releaseAt - Date.now()) / 1000)) : null
  };
}

export async function getActivity(escrowId) {
  await wait(250);
  const e = record(escrowId);
  return { escrowId: e.escrowId, activity: e.activity };
}

export async function getVerifiers() {
  await wait(200);
  return { verifiers: VERIFIERS };
}

// --- Importer action: create escrow (direct-to-contract in the real flow) -
export async function createEscrow({ importer, exporter, arbiter, documentCid, value, commodity, containerRef, globalDeadline }) {
  await wait(900);
  const escrowId = String(store.nextId++);
  const now = new Date().toISOString();
  const milestones = { inspected: emptyMilestoneProof(), shipped: emptyMilestoneProof(), arrivedCleared: emptyMilestoneProof() };
  const escrow = {
    escrowId,
    state: "Created",
    commodity,
    containerRef,
    value,
    documentCid,
    importer,
    exporter,
    arbiter,
    globalDeadline,
    createdAt: now,
    milestones,
    timelock: { active: false, releaseAt: null },
    dispute: { open: false, raisedBy: null, contestedMilestone: null, bondAmount: null, raisedAt: null, resolved: false },
    activity: []
  };
  pushActivity(escrow, { type: "escrow_created", actor: "importer", actorAddress: importer, text: `Escrow created, ${Number(value).toLocaleString("id-ID")} IDRT-demo locked` });
  store.escrows.set(escrowId, escrow);
  return { escrowId, documentCid, txHash: fakeTxHash(), status: "confirmed" };
}

// --- §4 Milestone proof (verifier institution, via backend) ---------------
export async function uploadMilestoneProof(file) {
  await wait(700);
  return { cid: `bafybeiproof${Math.random().toString(16).slice(2, 10)}`, fileName: file.name, size: file.size, sha256: `0x${Math.random().toString(16).slice(2)}` };
}

export async function submitMilestoneProof(escrowId, { milestone, proofCid, verifierAddress, automatedCheckPassed = true, automatedCheckReason }) {
  await wait(1000);
  const e = record(escrowId);
  const meta = MILESTONES.find((m) => m.key === milestone);
  if (!meta) throw new Error(`Unknown milestone: ${milestone}`);
  if (e.state !== meta.fromState) {
    const error = new Error(`Escrow is in ${e.state}, expected ${meta.fromState} before ${meta.label}`);
    error.status = 409;
    throw error;
  }

  if (!automatedCheckPassed) {
    return { status: "rejected", milestone, automatedCheck: { source: `${milestone}-mock`, passed: false, reason: automatedCheckReason || "Automated data feed did not match declared shipment data." } };
  }

  const verifier = VERIFIERS.find((v) => v.role === meta.role);
  const challengeDeadline = new Date(Date.now() + CHALLENGE_WINDOW_MS).toISOString();

  e.milestones[milestone] = {
    submitted: true,
    verifier: verifierAddress || verifier?.address,
    verifierName: verifier?.name || meta.institution,
    proofCid,
    submittedAt: new Date().toISOString(),
    challengeDeadline,
    automatedCheckPassed: true
  };
  e.state = meta.toState;
  pushActivity(e, { type: "milestone_verified", actor: verifier?.name || meta.institution, actorAddress: verifier?.address, text: `${meta.label} milestone verified, proof uploaded` });

  return {
    status: "verified",
    milestone,
    automatedCheck: { source: `${milestone}-mock`, passed: true, payload: { checked: true } },
    transactionHash: fakeTxHash(),
    challengeDeadline
  };
}

// --- Timelock -----------------------------------------------------------
export async function initiateTimelock(escrowId) {
  await wait(800);
  const e = record(escrowId);
  const lastMilestone = e.milestones.arrivedCleared;
  if (e.state !== "ArrivedCleared") throw new Error("Timelock can only start after ArrivedCleared");
  if (new Date(lastMilestone.challengeDeadline).getTime() > Date.now()) {
    const error = new Error("Challenge window for the final milestone hasn't closed yet.");
    error.status = 409;
    throw error;
  }
  const releaseAt = new Date(Date.now() + TIMELOCK_DURATION_MS).toISOString();
  e.state = "TimelockActive";
  e.timelock = { active: true, releaseAt };
  pushActivity(e, { type: "timelock_started", actor: "system", text: `24h timelock started, release at ${new Date(releaseAt).toLocaleString("id-ID")}` });
  return { escrowId: e.escrowId, releaseAt, txHash: fakeTxHash() };
}

export async function releasePayment(escrowId) {
  await wait(900);
  const e = record(escrowId);
  if (e.state !== "TimelockActive") throw new Error(`Cannot release from state ${e.state}`);
  if (new Date(e.timelock.releaseAt).getTime() > Date.now()) {
    const error = new Error("Timelock has not elapsed yet.");
    error.status = 409;
    throw error;
  }
  e.state = "Completed";
  pushActivity(e, { type: "payment_released", actor: "keeper", text: `${Number(e.value).toLocaleString("id-ID")} IDRT-demo released to exporter` });
  return { escrowId: e.escrowId, status: "released", txHash: fakeTxHash() };
}

export async function claimRefund(escrowId, importerAddress) {
  await wait(800);
  const e = record(escrowId);
  if (e.importer.toLowerCase() !== importerAddress.toLowerCase()) throw new Error("Only the importer can claim a refund");
  if (new Date(e.globalDeadline).getTime() > Date.now()) throw new Error("Global deadline has not passed yet");
  if (e.state === "Completed" || e.state === "Refunded") throw new Error(`Escrow already ${e.state}`);
  e.state = "Refunded";
  pushActivity(e, { type: "refunded", actor: "importer", actorAddress: importerAddress, text: `${Number(e.value).toLocaleString("id-ID")} IDRT-demo refunded to importer` });
  return { escrowId: e.escrowId, status: "refunded", txHash: fakeTxHash() };
}

// --- §5 Dispute -----------------------------------------------------------
export async function previewDisputeBond(escrowId, contestedMilestone) {
  await wait(300);
  const e = record(escrowId);
  const bondAmount = (Number(e.value) * DISPUTE_BOND_BPS) / 10000;
  const milestoneProof = contestedMilestone && contestedMilestone !== "none" ? e.milestones[contestedMilestone] : null;
  const windowStillOpen = !milestoneProof || new Date(milestoneProof.challengeDeadline).getTime() > Date.now();
  return {
    escrowId: e.escrowId,
    disputeBondAmount: bondAmount.toFixed(2),
    currency: "IDRT-demo",
    contestedMilestone: contestedMilestone || "none",
    windowStillOpen,
    challengeDeadline: milestoneProof?.challengeDeadline || null
  };
}

export async function raiseDispute(escrowId, { raisedBy, contestedMilestone, bondAmount }) {
  await wait(900);
  const e = record(escrowId);
  e.state = "Disputed";
  e.dispute = { open: true, raisedBy, contestedMilestone: contestedMilestone || "none", bondAmount, raisedAt: new Date().toISOString(), resolved: false };
  pushActivity(e, { type: "dispute_raised", actor: "party", actorAddress: raisedBy, text: `Dispute raised${contestedMilestone && contestedMilestone !== "none" ? ` on ${contestedMilestone}` : ""}, ${Number(bondAmount).toLocaleString("id-ID")} IDRT-demo bond locked` });
  return { escrowId: e.escrowId, status: "disputed", txHash: fakeTxHash() };
}

export async function getDispute(escrowId) {
  await wait(200);
  const e = record(escrowId);
  return { escrowId: e.escrowId, ...e.dispute };
}

export async function resolveDispute(escrowId, { releaseToExporter, reasoningCid, slashVerifier, bondFrivolous }) {
  await wait(1000);
  const e = record(escrowId);
  if (e.state !== "Disputed") throw new Error("Escrow is not in dispute");
  e.state = releaseToExporter ? "Completed" : "Refunded";
  e.dispute.resolved = true;
  e.dispute.open = false;
  pushActivity(e, {
    type: "dispute_resolved",
    actor: "arbiter",
    actorAddress: e.arbiter,
    text: `Dispute resolved — ${releaseToExporter ? "released to exporter" : "refunded to importer"}${slashVerifier ? ", verifier slashed" : ""}${bondFrivolous ? ", buyer bond forfeited (frivolous)" : ""}`
  });
  return { escrowId: e.escrowId, status: "resolved", releaseToExporter, txHash: fakeTxHash() };
}
