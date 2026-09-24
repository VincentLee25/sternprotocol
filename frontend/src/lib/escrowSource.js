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

export const sourceLabel = sourceIsLive ? "Connected to STERN gateway" : "Demo data";
const activityCache = new Map();
const ACTIVITY_CACHE_MS = 120000;

async function readActivity(id, { signal } = {}) {
  const key = String(id);
  const cached = activityCache.get(key);
  if (cached && Date.now() - cached.loadedAt < ACTIVITY_CACHE_MS) return cached.value;
  const value = await api.getActivity(id, { signal });
  activityCache.set(key, { value, loadedAt: Date.now() });
  return value;
}

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

// The gateway sends the bare Solidity event name as the activity text —
// "EscrowCreated", "MilestoneVerified". Correct, and unreadable in a feed meant
// to be skimmed. The mock path already writes sentences; these give the live
// path the same voice.
const EVENT_SENTENCE = {
  EscrowCreated: "Escrow created and funds locked",
  MilestoneVerified: "Milestone proof committed on chain",
  TimelockStarted: "Timelock started",
  PaymentReleased: "Funds released to the exporter",
  Refunded: "Funds refunded to the importer",
  DisputeRaised: "Dispute opened, bond locked",
  DisputeResolved: "Arbiter resolved the dispute",
  DisputeSettledByAgreement: "Trade settled on the parties' agreement",
  DisputeSettledByArbiter: "Arbiter resolved the dispute with a split",
  VerifierSlashed: "Verifier bond slashed"
};

/**
 * One activity shape for both sources.
 *
 * This used to rename `text` to `event` and drop `type` entirely. ActivityRail
 * reads exactly those two — `entry.type` picks the icon, `entry.text` is the
 * sentence — so on the dashboard every row rendered blank with the fallback
 * icon, and the feed looked broken rather than empty. `event` is kept as an
 * alias because ActivityLog on the detail page had been written against the
 * mangled shape.
 */
function normaliseActivity(entries = []) {
  return entries.map((a) => {
    const text = EVENT_SENTENCE[a.text] || a.text || a.event || "Activity";
    return {
      time: a.time,
      type: a.type || null,
      actor: a.actor || a.actorAddress || "contract",
      actorAddress: a.actorAddress || null,
      text,
      event: text,
      transactionHash: a.transactionHash || null,
      blockNumber: a.blockNumber ?? null
    };
  });
}

function toRow(detail, activity, source) {
  return {
    id: String(detail.escrowId),
    source,
    commodity: detail.commodity,
    containerRef: detail.containerRef,
    value: detail.value,
    // The same figure in the token's smallest unit, plus its scale. A share of
    // the escrow value has to be computed there — a percentage of a formatted
    // decimal string loses the cents and then the two parties are agreeing on
    // different numbers.
    contractValue: detail.contractValue ?? null,
    decimals: detail.decimals ?? 2,
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
    disputeOpen: Boolean(detail.dispute?.open),
    // Keep the on-chain dispute record after settlement so its negotiation
    // thread remains available as a read-only part of the trade history.
    dispute: detail.dispute || null
  };
}

/**
 * Full rows for the list view. Detail and activity are fetched per escrow
 * because the detail page renders from this same state.
 *
 * `address` filters to escrows the signed-in wallet is party to. Passing none
 * returns everything, which is what the demo wants before any escrow exists.
 */
// Two clocks, because they answer different questions. The list is one call and
// should be quick; a per-escrow detail is seven chain reads and is allowed to be
// slower before it is given up on.
const LIST_TIMEOUT_MS = 15000;
const ROW_TIMEOUT_MS = 12000;

/**
 * Runs one request under its own deadline, still cancelled by the caller's.
 *
 * The deadline has to belong to the request, not to the page. A single
 * controller aborted on a timer cancels every request sharing it, so the slowest
 * escrow was taking the fastest nine down with it.
 */
async function withTimeout(run, { signal, ms, code }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  try {
    return await run(controller.signal);
  } catch (error) {
    // An abort means one of two very different things, and the caller has to be
    // able to tell them apart: this request ran out of time, or the page moved
    // on and cancelled it.
    if (timedOut) {
      const timeout = new Error(`Timed out after ${Math.round(ms / 1000)}s.`);
      timeout.code = code;
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function loadEscrowRows({
  address,
  signal,
  listTimeoutMs = LIST_TIMEOUT_MS,
  rowTimeoutMs = ROW_TIMEOUT_MS
} = {}) {
  if (!sourceIsLive) {
    const res = await mockList();
    return Promise.all(
      res.escrows.map(async (row) => {
        const [detail, log] = await Promise.all([mockGet(row.escrowId), mockActivity(row.escrowId)]);
        return toRow(detail, log.activity, "mock");
      })
    );
  }

  // The list itself. This one IS allowed to fail the page: if it does not
  // answer there is nothing to show, and the caller should say why.
  const res = await withTimeout(
    (listSignal) => api.listEscrows({ address, signal: listSignal }),
    { signal, ms: listTimeoutMs, code: "LIST_TIMEOUT" }
  );
  const rows = res.escrows || res || [];

  // Activity is NOT fetched here. It is an event scan per escrow, and making the
  // list wait for every one of them left the whole dashboard on skeleton rows
  // until the slowest finished — for data that appears in a single side panel.
  // loadActivityForRows fills it in once the page is already useful.
  //
  // Nor does one escrow's detail decide the fate of the rest. Promise.all
  // rejects on the first failure and abandons the others, so a single escrow
  // whose reads time out took the entire dashboard down with it — nine rows
  // that had already come back were thrown away to report one that had not.
  return settleRowDetails(rows, (row) => fetchRowDetail(row, { signal, rowTimeoutMs }));
}

/**
 * Reads every row's detail and lets each one fail on its own.
 *
 * Separated from the fetching so it can be tested without a browser or a
 * gateway: the caller supplies how a detail is read, and this decides what
 * happens when one of them does not come back.
 */
export async function settleRowDetails(rows, fetchDetail) {
  const settled = await Promise.allSettled(rows.map((row) => fetchDetail(row)));
  return settled.map((outcome, index) =>
    outcome.status === "fulfilled" ? outcome.value : failedRow(rows[index], outcome.reason)
  );
}

/**
 * One escrow's detail, on its own clock.
 *
 * Its own timeout as well as its own request: a row that hangs must fail by
 * itself, and a shared deadline aborts the controller every other row is using
 * too — which turns one slow escrow into an empty dashboard.
 */
async function fetchRowDetail(row, { signal, rowTimeoutMs }) {
  const detail = await withTimeout(
    (rowSignal) => api.getEscrow(row.escrowId, { signal: rowSignal }),
    { signal, ms: rowTimeoutMs, code: "ESCROW_DETAIL_TIMEOUT" }
  );
  const full = toRow(detail, [], "gateway");
  full.activityPending = true;
  return full;
}

/**
 * The row that could not be completed, still rendered.
 *
 * GET /escrows already returned this escrow's parties, value, commodity,
 * deadline and state — the detail call adds milestones, the dispute record and
 * release eligibility. So a failed detail is a row with less in it, not a row
 * that has to disappear. Dropping it would be the worse answer: the escrow
 * exists, and a dashboard that silently omits one is harder to trust than one
 * that admits a gap.
 */
function failedRow(listRow, error) {
  const row = toRow(listRow, [], "gateway");
  row.detailError = error?.message || "Could not read this escrow's detail.";
  row.detailErrorCode = error?.code || null;
  row.activityPending = false;
  // Nothing was read, so nothing may be claimed. Left explicitly null rather
  // than zero: "no milestones" and "milestones unknown" are different, and a
  // progress bar reading 0/3 on an escrow that is actually complete is a lie
  // the page would be telling on its own.
  row.milestones = null;
  row.verified = null;
  row.releaseEligible = null;
  if (typeof console !== "undefined") {
    console.warn(`[stern] escrow ${listRow?.escrowId} detail failed:`, error);
  }
  return row;
}

/**
 * Re-reads only the rows that failed, keeping everything already on screen.
 *
 * Refresh used to re-fetch all of them, so a dashboard with one bad escrow paid
 * for every other escrow again to retry the one.
 */
export async function retryFailedRows(rows, { signal, rowTimeoutMs = ROW_TIMEOUT_MS, fetchDetail } = {}) {
  if (!sourceIsLive && !fetchDetail) return rows;
  const failed = rows.filter((row) => row.detailError);
  if (failed.length === 0) return rows;

  const read =
    fetchDetail ||
    ((row) => fetchRowDetail(row, { signal, rowTimeoutMs }));
  const settled = await Promise.allSettled(
    failed.map((row) => read({ escrowId: row.id }))
  );
  const repaired = new Map();
  failed.forEach((row, index) => {
    const outcome = settled[index];
    if (outcome.status === "fulfilled") repaired.set(row.id, outcome.value);
    else repaired.set(row.id, { ...row, detailError: outcome.reason?.message || row.detailError });
  });
  return rows.map((row) => repaired.get(row.id) || row);
}

/**
 * Activity for rows that are already on screen.
 *
 * Deliberately separate, and deliberately second. Each escrow resolves on its
 * own, so one slow or failing scan delays only its own row rather than the page.
 */
export async function loadActivityForRows(rows, { signal } = {}) {
  if (!sourceIsLive) return rows.map((row) => ({ ...row, activityPending: false }));
  return Promise.all(
    rows.map(async (row) => {
      try {
        const log = await readActivity(row.id, { signal });
        return {
          ...row,
          activity: normaliseActivity(log.activity),
          activityError: null,
          activityTruncatedBefore: log.truncatedBefore ?? null,
          activityPending: false
        };
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        return { ...row, activityError: error.message, activityPending: false };
      }
    })
  );
}

/**
 * One escrow's STATE, refreshed after a transaction.
 *
 * Activity is deliberately not fetched here, and that omission is the whole
 * point. The gateway's activity endpoint is an event-log scan over a wide
 * block range; the state is a handful of eth_calls. Putting both in one
 * Promise.all made the fast half wait for the slow half, so "Reading the latest
 * state" sat on screen for as long as a history rescan took — minutes, on a
 * deployment with no CONTRACT_DEPLOY_BLOCK set.
 *
 * The list view was already split this way (loadEscrowRows /
 * loadActivityForRows). The detail view was the one place still paying for
 * history to see a state change.
 *
 * `activity` is left undefined rather than empty: the caller is merging into a
 * row that already has one, and an empty array would wipe the log off screen
 * for as long as the second request takes.
 */
export async function loadEscrowDetail(id, { signal } = {}) {
  if (!sourceIsLive) {
    const detail = await mockGet(id);
    return toRow(detail, [], "mock");
  }
  const detail = await api.getEscrow(id, { signal });
  return toRow(detail, [], "gateway");
}

/** Activity is a historical scan; callers render the escrow before requesting it. */
export async function loadEscrowActivity(id, { signal } = {}) {
  if (!sourceIsLive) {
    const log = await mockActivity(id);
    return { activity: normaliseActivity(log.activity), activityError: null, activityTruncatedBefore: null };
  }
  try {
    const log = await readActivity(id, { signal });
    return { activity: normaliseActivity(log.activity), activityError: null, activityTruncatedBefore: log.truncatedBefore ?? null };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { activity: [], activityError: error.message, activityTruncatedBefore: null };
  }
}
