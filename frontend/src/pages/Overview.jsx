import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Inbox, MoreHorizontal, RefreshCcw, Search
} from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import ActivityRail from "../components/ActivityRail.jsx";
import { getBrowserContract } from "../lib/contract.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { stateFromIndex, formatEscrowId } from "../lib/escrowState.js";
import { listEscrows, getEscrow, getActivity, countVerified } from "../lib/mockRegistry.js";
import { MILESTONES, STATE_ORDER, STATE_LABELS } from "../lib/milestones.js";

const PAGE_SIZE = 6;

// Chain rows carry no milestone proofs, so progress is inferred from how far
// along STATE_ORDER the escrow has walked. Mock rows report it directly.
function verifiedFromState(state) {
  const i = STATE_ORDER.indexOf(state);
  if (state === "Completed") return MILESTONES.length;
  return i <= 0 ? 0 : Math.min(i, MILESTONES.length);
}

// Which semantic tone a state's locked value belongs to in the composition bar.
function bucketOf(state) {
  if (state === "Disputed") return "disputed";
  if (state === "ArrivedCleared" || state === "TimelockActive") return "cleared";
  return "moving";
}

const BUCKETS = [
  { key: "moving", label: "In transit", cls: "bg-state-pending", dot: "bg-state-pending" },
  { key: "cleared", label: "Cleared", cls: "bg-state-attested", dot: "bg-state-attested" },
  { key: "disputed", label: "Disputed", cls: "bg-state-disputed", dot: "bg-state-disputed" }
];

const FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "moving", label: "In transit", match: (e) => ["Created", "Inspected", "Shipped"].includes(e.state) },
  { key: "cleared", label: "Cleared", match: (e) => ["ArrivedCleared", "TimelockActive"].includes(e.state) },
  { key: "disputed", label: "Disputed", match: (e) => e.state === "Disputed" },
  { key: "settled", label: "Settled", match: (e) => ["Completed", "Refunded"].includes(e.state) }
];

const SORTS = {
  recent: { label: "Newest", fn: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) },
  value: { label: "Value", fn: (a, b) => Number(b.value) - Number(a.value) },
  deadline: { label: "Deadline", fn: (a, b) => new Date(a.deadline || 0) - new Date(b.deadline || 0) },
  progress: { label: "Progress", fn: (a, b) => b.verified - a.verified }
};

export default function Overview({ escrows, isOnChainReady, onOpen, onCreate, onChainSync, onRegistryLoad }) {
  const [chainStatus, setChainStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());

  async function loadChainEscrows() {
    setLoading(true);
    setChainStatus("Reading escrows from the local contract…");
    try {
      const contract = await getBrowserContract({ requireSigner: false });
      const next = Number(await contract.nextEscrowId());
      const ids = Array.from({ length: next }, (_item, index) => index);
      const chainRows = await Promise.all(
        ids.map(async (id) => {
          const escrow = await contract.getEscrow(id);
          return {
            id: String(id),
            source: "chain",
            commodity: escrow.commodity || "Export shipment",
            containerRef: escrow.containerRef,
            cid: escrow.eBLCID,
            value: String(Number(escrow.contractValue) / 1e18),
            deadline: new Date(Number(escrow.deadline) * 1000).toISOString(),
            state: stateFromIndex(escrow.state),
            exporter: escrow.exporterAddress,
            arbiter: escrow.arbiterAddress
          };
        })
      );
      onChainSync(chainRows);
      setChainStatus(chainRows.length === 0 ? "Contract deployed. No escrows created yet." : "");
    } catch (error) {
      setChainStatus(error.shortMessage || error.message);
    } finally {
      setLoading(false);
    }
  }

  // Pull the full record for each escrow, not just the list summary: the detail
  // page is rendered from App state, so it needs milestones and activity to be
  // present before a row is clicked.
  async function loadMockEscrows() {
    setLoading(true);
    try {
      const res = await listEscrows();
      const full = await Promise.all(
        res.escrows.map(async (row) => {
          const [detail, log] = await Promise.all([
            getEscrow(row.escrowId),
            getActivity(row.escrowId)
          ]);
          return {
            id: detail.escrowId,
            source: "mock",
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
            milestones: detail.milestones,
            timelock: detail.timelock,
            verification: null,
            votes: { importer: null, exporter: null, arbiter: null },
            pendingExtension: null,
            activity: log.activity.map((a) => ({ time: a.time, actor: a.actor, event: a.text })),
            verified: countVerified(detail.milestones),
            total: MILESTONES.length,
            disputeOpen: detail.dispute.open
          };
        })
      );
      setRows(full);
      onRegistryLoad?.(full);
      setChainStatus("");
    } catch (error) {
      setChainStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOnChainReady) loadChainEscrows();
    else loadMockEscrows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnChainReady]);

  // In chain mode the authoritative list lives in App state.
  useEffect(() => {
    if (!isOnChainReady) return;
    setRows(
      (escrows || []).map((e) => ({
        ...e,
        verified: verifiedFromState(e.state),
        total: MILESTONES.length,
        disputeOpen: e.state === "Disputed"
      }))
    );
  }, [escrows, isOnChainReady]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.match).length])),
    [rows]
  );

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
    const q = query.trim().toLowerCase();
    return rows
      .filter(f.match)
      .filter((e) =>
        !q ||
        e.commodity?.toLowerCase().includes(q) ||
        e.containerRef?.toLowerCase().includes(q) ||
        String(e.id).includes(q)
      )
      .sort(SORTS[sort].fn);
  }, [rows, filter, query, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, query, sort]);

  const stats = useMemo(() => {
    const active = rows.filter((e) => !["Completed", "Refunded"].includes(e.state));
    const byBucket = { moving: 0, cleared: 0, disputed: 0 };
    active.forEach((e) => {
      byBucket[bucketOf(e.state)] += Number(e.value) || 0;
    });
    const locked = Object.values(byBucket).reduce((a, b) => a + b, 0);
    const settled = rows.filter((e) => e.state === "Completed");
    const disputes = rows.filter((e) => e.state === "Disputed");
    const bondAtRisk = disputes.reduce((sum, e) => sum + (Number(e.value) || 0) * 0.02, 0);
    const perMilestone = MILESTONES.map((m, i) => ({
      label: m.label,
      done: active.filter((e) => (e.verified ?? 0) > i).length,
      of: active.length
    }));
    return {
      locked,
      byBucket,
      activeCount: active.length,
      settledCount: settled.length,
      settledValue: settled.reduce((s, e) => s + (Number(e.value) || 0), 0),
      disputeCount: disputes.length,
      bondAtRisk,
      perMilestone
    };
  }, [rows]);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  function toggleAll() {
    const next = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((r) => next.delete(r.id));
    else pageRows.forEach((r) => next.add(r.id));
    setSelected(next);
  }
  function toggleOne(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  return (
    <div className="w-full">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-2xs uppercase text-ink-faint">
            {isOnChainReady ? "On-chain registry" : "Mock session"}
          </p>
          <h1 className="mt-1.5 text-[30px] font-bold leading-none tracking-display text-navy">
            Escrows
          </h1>
          <p className="mt-2 font-serif text-[15px] text-teal">
            {isOnChainReady
              ? "Local Hardhat network"
              : "Demo data. Connect a wallet and set VITE_CONTRACT_ADDRESS for on-chain mode."}
          </p>
        </div>
        <div className="flex gap-2.5">
          {isOnChainReady ? (
            <button
              type="button"
              onClick={loadChainEscrows}
              disabled={loading}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-sky bg-surface px-5 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCcw size={13} aria-hidden="true" />
              Sync chain
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            className="cursor-pointer rounded-full bg-navy px-6 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal-solid"
          >
            New escrow
          </button>
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0">
          {/* ---------- KPI row ---------- */}
          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-doc bg-surface p-5 shadow-card xl:col-span-2">
              <p className="text-2xs uppercase text-ink-faint">Value locked</p>
              <p className="mt-2 text-[28px] font-medium leading-none tabular-nums tracking-display text-navy">
                {stats.locked.toLocaleString()}
                <span className="ml-2 align-middle text-2xs uppercase text-ink-faint">
                  {CURRENCY_LABEL}
                </span>
              </p>
              <CompositionBar total={stats.locked} byBucket={stats.byBucket} />
            </div>

            <div className="rounded-doc bg-surface p-5 shadow-card">
              <p className="text-2xs uppercase text-ink-faint">Milestones verified</p>
              <p className="mt-2 text-[28px] font-medium leading-none tabular-nums tracking-display text-navy">
                {stats.perMilestone.reduce((s, m) => s + m.done, 0)}
                <span className="text-ink-faint">
                  /{stats.activeCount * MILESTONES.length}
                </span>
              </p>
              <div className="mt-4 space-y-2">
                {stats.perMilestone.map((m) => (
                  <div key={m.label} className="flex items-center gap-2.5">
                    <span className="w-[86px] shrink-0 truncate text-[12px] text-ink-dim">
                      {m.label}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky/50">
                      <span
                        className="block h-full rounded-full bg-state-attested"
                        style={{ width: `${m.of ? (m.done / m.of) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-navy">
                      {m.done}/{m.of}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-doc bg-surface p-5 shadow-card">
              <p className="text-2xs uppercase text-ink-faint">Open disputes</p>
              <p
                className={`mt-2 text-[28px] font-medium leading-none tabular-nums tracking-display ${
                  stats.disputeCount > 0 ? "text-state-disputed" : "text-navy"
                }`}
              >
                {stats.disputeCount}
              </p>
              <div className="mt-4 space-y-1.5 border-t border-sky pt-3">
                <Row label="Bond locked" value={`${Math.round(stats.bondAtRisk).toLocaleString()}`} />
                <Row label="Settled" value={String(stats.settledCount)} />
                <Row label="Settled value" value={stats.settledValue.toLocaleString()} />
              </div>
            </div>
          </section>

          {/* ---------- toolbar ---------- */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] transition-colors duration-150 ${
                    filter === f.key
                      ? "bg-navy text-beige"
                      : "bg-surface text-ink-dim hover:text-navy"
                  }`}
                >
                  {f.label}
                  <span className={`ml-1.5 tabular-nums ${filter === f.key ? "opacity-70" : "opacity-60"}`}>
                    {counts[f.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="relative">
                <span className="sr-only">Search escrows</span>
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search commodity or container"
                  className="w-[240px] rounded-full border border-sky bg-surface py-2 pl-8 pr-3.5 text-[13px] text-navy placeholder:text-ink-faint focus:border-teal focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-1.5 rounded-full border border-sky bg-surface py-2 pl-3 pr-2 text-[13px] text-ink-dim">
                <ArrowUpDown size={13} aria-hidden="true" />
                <span className="sr-only">Sort by</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="cursor-pointer bg-transparent pr-1 text-navy focus:outline-none"
                >
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {selected.size > 0 ? (
            <div className="mb-3 flex items-center justify-between rounded-panel bg-navy px-4 py-2.5 text-[13px] text-beige">
              <span className="tabular-nums">{selected.size} selected</span>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="cursor-pointer underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                Clear
              </button>
            </div>
          ) : null}

          {chainStatus ? (
            <p className="mb-3 font-serif text-sm text-ink-dim">{chainStatus}</p>
          ) : null}

          {/* ---------- table ---------- */}
          <div className="overflow-hidden rounded-doc bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-sky">
                    <Th className="w-10 pl-5">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                        aria-label="Select all escrows on this page"
                        className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--rgb-ink))]"
                      />
                    </Th>
                    <Th>Escrow</Th>
                    <Th className="text-right">Value</Th>
                    <Th className="w-[190px]">Milestones</Th>
                    <Th>Deadline</Th>
                    <Th>Status</Th>
                    <Th className="w-12 pr-5" />
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                    : pageRows.map((e) => (
                        <tr
                          key={`${e.source}-${e.id}`}
                          onClick={() => onOpen(e.id)}
                          className="cursor-pointer border-b border-sky/60 transition-colors duration-150 last:border-b-0 hover:bg-beige"
                        >
                          <td className="pl-5" onClick={(ev) => ev.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(e.id)}
                              onChange={() => toggleOne(e.id)}
                              aria-label={`Select escrow ${e.id}`}
                              className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--rgb-ink))]"
                            />
                          </td>
                          <td className="py-3.5 pr-4">
                            <p className="text-[15px] font-medium tracking-[-0.012em] text-navy">
                              {e.commodity}
                            </p>
                            <p className="mt-0.5 text-[12.5px] text-ink-dim">
                              &#8470;&thinsp;{formatEscrowId(e.id)} · {e.containerRef}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4 text-right">
                            <p className="text-[14px] font-medium tabular-nums text-navy">
                              {Number(e.value).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-2xs uppercase text-ink-faint">
                              {CURRENCY_LABEL}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <MilestoneMeter verified={e.verified ?? 0} total={e.total ?? 3} />
                          </td>
                          <td className="py-3.5 pr-4">
                            <p className="text-[13.5px] text-navy">
                              {e.deadline ? new Date(e.deadline).toLocaleDateString() : "—"}
                            </p>
                            <p className="mt-0.5 text-2xs uppercase text-ink-faint">
                              {relativeDays(e.deadline)}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <StatusPill state={e.state} />
                          </td>
                          <td className="pr-5 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              type="button"
                              aria-label={`Actions for escrow ${e.id}`}
                              className="cursor-pointer rounded-full p-1.5 text-ink-faint transition-colors duration-150 hover:bg-sky/40 hover:text-navy"
                            >
                              <MoreHorizontal size={15} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {!loading && visible.length === 0 ? (
              <div className="grid place-items-center px-6 py-14 text-center">
                <Inbox size={20} className="mb-3 text-ink-faint" aria-hidden="true" />
                <p className="text-[15px] font-medium text-navy">
                  {rows.length === 0 ? "No escrows yet" : "Nothing matches that filter"}
                </p>
                <p className="mt-2 max-w-sm font-serif text-[14.5px] leading-relaxed text-ink-dim">
                  {rows.length === 0
                    ? "Lock the first shipment. The importer deposits funds, and the contract releases them only once all three milestones are verified."
                    : "Try a different status or clear the search."}
                </p>
                {rows.length === 0 ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    className="mt-5 cursor-pointer rounded-full bg-navy px-6 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal-solid"
                  >
                    Create escrow
                  </button>
                ) : null}
              </div>
            ) : null}

            {visible.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky px-5 py-3">
                <p className="text-[12.5px] text-ink-dim">
                  Showing{" "}
                  <span className="tabular-nums text-navy">
                    {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, visible.length)}
                  </span>{" "}
                  of <span className="tabular-nums text-navy">{visible.length}</span>
                </p>
                <div className="flex items-center gap-1">
                  <PagerBtn onClick={() => setPage(current - 1)} disabled={current === 1} label="Previous page">
                    <ChevronLeft size={14} aria-hidden="true" />
                  </PagerBtn>
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i + 1)}
                      aria-current={current === i + 1 ? "page" : undefined}
                      className={`h-7 min-w-[28px] cursor-pointer rounded-panel px-2 text-[12.5px] tabular-nums transition-colors duration-150 ${
                        current === i + 1
                          ? "bg-navy text-beige"
                          : "text-ink-dim hover:bg-sky/40 hover:text-navy"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <PagerBtn onClick={() => setPage(current + 1)} disabled={current === pageCount} label="Next page">
                    <ChevronRight size={14} aria-hidden="true" />
                  </PagerBtn>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <ActivityRail onOpen={onOpen} />
      </div>
    </div>
  );
}

/* ---------------------------------- parts --------------------------------- */

function Th({ children, className = "" }) {
  return (
    <th scope="col" className={`py-2.5 pr-4 text-2xs font-medium uppercase text-ink-faint ${className}`}>
      {children}
    </th>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="text-ink-dim">{label}</span>
      <span className="tabular-nums text-navy">{value}</span>
    </div>
  );
}

function PagerBtn({ children, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-panel text-ink-dim transition-colors duration-150 hover:bg-sky/40 hover:text-navy disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

// Three sequential proofs, so three discrete segments read truer than a bar.
function MilestoneMeter({ verified, total }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex flex-1 gap-[2px]" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < verified ? "bg-state-attested" : "bg-sky/60"}`}
          />
        ))}
      </span>
      <span className="shrink-0 text-[12.5px] tabular-nums text-ink-dim">
        {verified}/{total}
      </span>
    </div>
  );
}

// Stacked composition of locked value. Segments carry a 2px surface gap and
// the legend direct-labels every series, so identity is never colour-alone.
function CompositionBar({ total, byBucket }) {
  const shown = BUCKETS.filter((b) => byBucket[b.key] > 0);
  return (
    <div className="mt-4">
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sky/40">
        {total > 0 ? (
          shown.map((b) => (
            <span
              key={b.key}
              className={`h-full ${b.cls} first:rounded-l-full last:rounded-r-full`}
              style={{ width: `${(byBucket[b.key] / total) * 100}%` }}
              title={`${b.label}: ${byBucket[b.key].toLocaleString()} ${CURRENCY_LABEL}`}
            />
          ))
        ) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {BUCKETS.map((b) => (
          <li key={b.key} className="flex items-center gap-2 text-[12.5px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${b.dot}`} aria-hidden="true" />
            <span className="text-ink-dim">{b.label}</span>
            <span className="tabular-nums text-navy">{byBucket[b.key].toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-sky/60 last:border-b-0">
      <td className="pl-5 py-4">
        <span className="block h-3.5 w-3.5 rounded-[3px] bg-sky/50" />
      </td>
      {[3, 1, 1, 1, 1, 0].map((flex, i) => (
        <td key={i} className="py-4 pr-4">
          {flex ? <span className="block h-3 rounded-full bg-sky/50" style={{ width: `${flex * 28}%`, minWidth: 48 }} /> : null}
        </td>
      ))}
    </tr>
  );
}

function relativeDays(iso) {
  if (!iso) return "";
  const days = Math.round((new Date(iso) - Date.now()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  return `in ${days}d`;
}
