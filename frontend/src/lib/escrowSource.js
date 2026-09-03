// One shape for escrow rows, whatever they came from.
//
// Overview and EscrowDetail were written against mockRegistry's shape. Rather
// than rewrite both pages, this normalises the gateway's response into that
// same shape, so switching source is a one-line change at the call site.
//
// Replaces the old `isOnChainReady` test, which was `VITE_CONTRACT_ADDRESS &&
// window.ethereum`. That could never be true for the users this product is for:
// a Particle user signs in with Google and has no injected wallet, so Overview
// fell back to demo data no matter how it was configured — and its chain path
// read the contract directly, bypassing the gateway entirely.
import * as api from "./sternApi.js";
import { listEscrows as mockList, getEscrow as mockGet, getActivity as mockActivity, countVerified } from "./mockRegistry.js";
import { MILESTONES } from "./milestones.js";

export const sourceIsLive = api.apiConfigured;

export const sourceLabel = sourceIsLive ? "Live — STERN gateway" : "Demo data";

// Gateway milestones are keyed by name; the mock returns the same keys. Count
// whichever reports a committed proof.
// Counts the three canonical milestones by name rather than every value, so the
// arrivedCleared alias added by normaliseMilestones cannot be counted twice.
function countCommitted(milestones) {
  if (!milestones) return 0;
  const third = milestones.arrived_cleared ?? milestones.arrivedCleared;
  return [milestones.inspected, milestones.shipped, third].filter((m) => m?.submitted).length;
}

// The third milestone has two spellings in this codebase: the contract and the
// gateway say `arrived_cleared`, while milestones.js, mockRegistry and
// EscrowDetail's CHECKS say `arrivedCleared`. Nothing reconciled them, so on the
// gateway path `escrow.milestones.arrivedCleared` was always undefined and the
// third condition could never read its on-chain proof.
//
// Keep both keys pointing at the same object rather than renaming one side:
// evidence.js and disputeFlow.js send `arrived_cleared` to the gateway, which is
// the name the contract itself uses.
function normaliseMilestones(milestones) {
  if (!milestones) return milestones;
  const out = { ...milestones };
  const third = milestones.arrived_cleared ?? milestones.arrivedCleared;
  if (third) {
    out.arrived_cleared = third;
    out.arrivedCleared = third;
  }
  return out;
}

// The gateway names the actor field `actorAddress` and the mock names it
// `actor`. ActivityRail reads `actor`, so normalise here rather than teaching
// the component about both.
function normaliseActivity(entries = []) {
  return entries.map((a) => ({
    time: a.time,
    actor: a.actor || a.actorAddress || "contract",
    event: a.text || a.event,
    transactionHash: a.transactionHash || null,
    blockNumber: a.blockNumber ?? null
  }));
}

function toRow(detail, activity, source) {
  return {
    id: String(detail.escrowId),
    source,
    commodity: detail.commodity,
    containerRef: detail.containerRef,
    value: detail.value,
    cid: detail.documentCid,
    deadline: detail.globalDeadline,
    createdAt: detail.createdAt,
    state: detail.state,
    importer: detail.importer,
    exporter: detail.exporter,
    arbiter: detail.arbiter,
    milestones: normaliseMilestones(detail.milestones),
    timelock: detail.timelock || null,
    releaseEligible: detail.releaseEligible ?? null,
    verification: null,
    votes: { importer: null, exporter: null, arbiter: null },
    pendingExtension: null,
    activity: normaliseActivity(activity),
    verified: source === "mock" ? countVerified(detail.milestones) : countCommitted(detail.milestones),
    total: MILESTONES.length,
    disputeOpen: Boolean(detail.dispute?.open)
  };
}

/**
 * Full rows for the list view. Detail and activity are fetched per escrow
 * because the detail page renders from this same state.
 *
 * `address` filters to escrows the signed-in wallet is party to. Passing none
 * returns everything, which is what the demo wants before any escrow exists.
 */
export async function loadEscrowRows({ address, signal } = {}) {
  if (!sourceIsLive) {
    const res = await mockList();
    return Promise.all(
      res.escrows.map(async (row) => {
        const [detail, log] = await Promise.all([mockGet(row.escrowId), mockActivity(row.escrowId)]);
        return toRow(detail, log.activity, "mock");
      })
    );
  }

  const res = await api.listEscrows({ address, signal });
  const rows = res.escrows || res || [];
  return Promise.all(
    rows.map(async (row) => {
      // Activity is a per-escrow event scan on the gateway. A failure there
      // should not blank the whole list, so degrade to an empty log.
      const [detail, log] = await Promise.all([
        api.getEscrow(row.escrowId, { signal }),
        api.getActivity(row.escrowId, { signal }).catch(() => ({ activity: [] }))
      ]);
      return toRow(detail, log.activity, "gateway");
    })
  );
}

/** One escrow, refreshed after a transaction. */
export async function loadEscrowDetail(id, { signal } = {}) {
  if (!sourceIsLive) {
    const [detail, log] = await Promise.all([mockGet(id), mockActivity(id)]);
    return toRow(detail, log.activity, "mock");
  }
  const [detail, log, timelock] = await Promise.all([
    api.getEscrow(id, { signal }),
    api.getActivity(id, { signal }).catch(() => ({ activity: [] })),
    api.getTimelock(id, { signal }).catch(() => null)
  ]);
  return toRow({ ...detail, timelock }, log.activity, "gateway");
}
