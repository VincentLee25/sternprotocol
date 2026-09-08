import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Inbox, MoreHorizontal, RefreshCcw, Search
} from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import ActivityRail from "../components/ActivityRail.jsx";
import { Button, EmptyState, Metric, Notice, Th } from "../components/ui.jsx";
import { loadEscrowRows, sourceIsLive, sourceLabel } from "../lib/escrowSource.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { formatEscrowId } from "../lib/escrowState.js";
import { MILESTONES, STATE_ORDER } from "../lib/milestones.js";

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

export default function Overview({ walletAddress, refreshKey, onOpen, onCreate, onRegistryLoad }) {
  const [chainStatus, setChainStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());

  // One loader for both sources. escrowSource decides which, and returns the
  // same row shape either way, so nothing below this point knows the difference.
  async function load(signal) {
    setLoading(true);
    setChainStatus("");
    try {
      const full = await loadEscrowRows({ address: walletAddress, signal });
      setRows(full);
      onRegistryLoad?.(full);
      if (sourceIsLive && full.length === 0) {
        setChainStatus("Connected to the gateway. No escrows have been created yet.");
      }
    } catch (error) {
      if (error.name === "AbortError") return;
      setChainStatus(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, refreshKey]);

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
      done: active.filter((e) => (e.verified ?? verifiedFromState(e.state)) > i).length,
      of: active.length
    }));
    // Deadlines inside 72 hours, the horizon DESIGN.md asks the overview to
    // surface: it is the number that decides what an operator does today.
    const soon = active.filter((e) => {
      if (!e.deadline) return false;
      const ms = new Date(e.deadline).getTime() - Date.now();
      return ms > 0 && ms <= 72 * 3600 * 1000;
    }).length;
    const overdue = active.filter(
      (e) => e.deadline && new Date(e.deadline).getTime() < Date.now()
    ).length;

    return {
      locked,
      byBucket,
      activeCount: active.length,
      settledCount: settled.length,
      settledValue: settled.reduce((s, e) => s + (Number(e.value) || 0), 0),
      disputeCount: disputes.length,
      bondAtRisk,
      perMilestone,
      soon,
      overdue
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
      {!sourceIsLive ? (
        <Notice tone="pending" className="mb-5">
          Demo data. Set <code className="font-mono text-[12px]">VITE_ORACLE_API</code> to read
          escrows from the gateway.
        </Notice>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* ---------- KPI strip ----------
              Four numbers, one row, no decorative tint per card. DESIGN.md is
              explicit that the overview should not become a grid of colourful
              dashboard cards, so the composition bar lives inside the value
              card rather than becoming a fifth box. */}
          <section className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Active escrow value"
              value={stats.locked.toLocaleString()}
              unit={CURRENCY_LABEL}
              className="xl:col-span-2"
            >
              <CompositionBar total={stats.locked} byBucket={stats.byBucket} />
            </Metric>

            <Metric
              label="Milestones verified"
              value={
                <>
                  {stats.perMilestone.reduce((s, m) => s + m.done, 0)}
                  <span className="text-ink-faint">/{stats.activeCount * MILESTONES.length}</span>
                </>
              }
            >
              <div className="mt-4 space-y-2">
                {stats.perMilestone.map((m) => (
                  <div key={m.label} className="flex items-center gap-2.5">
                    <span className="w-[104px] shrink-0 truncate text-[12px] text-ink-dim">
                      {m.label}
                    </span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sky">
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
            </Metric>

            <Metric
              label="Open disputes"
              value={stats.disputeCount}
              tone={stats.disputeCount > 0 ? "disputed" : "default"}
            >
              <div className="mt-4 space-y-1.5 border-t border-sky pt-3">
                <Row
                  label="Deadlines in 72h"
                  value={String(stats.soon)}
                  tone={stats.soon > 0 ? "pending" : undefined}
                />
                <Row
                  label="Past deadline"
                  value={String(stats.overdue)}
                  tone={stats.overdue > 0 ? "disputed" : undefined}
                />
                <Row label="Bond locked" value={Math.round(stats.bondAtRisk).toLocaleString()} />
                <Row label="Settled value" value={stats.settledValue.toLocaleString()} />
              </div>
            </Metric>
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
                  className={`cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                    filter === f.key
                      ? "border-teal-solid bg-teal-solid text-white"
                      : "border-sky bg-surface text-ink-dim hover:border-teal/40 hover:text-navy"
                  }`}
                >
                  {f.label}
                  <span className={`ml-1.5 tabular-nums ${filter === f.key ? "opacity-75" : "opacity-70"}`}>
                    {counts[f.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Wraps below sm, and the search takes the full row there: at 390px
                a fixed 240px field plus the sort and refresh controls pushed
                past the viewport edge. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label className="relative w-full sm:w-auto">
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
                  className="h-10 w-full rounded-panel border border-sky bg-surface pl-8 pr-3.5 text-[13px] text-navy placeholder:text-ink-faint focus:border-teal focus:outline-none sm:w-[240px]"
                />
              </label>
              <label className="flex h-10 items-center gap-1.5 rounded-panel border border-sky bg-surface pl-3 pr-2 text-[13px] text-ink-dim">
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
              {sourceIsLive ? (
                <Button size="md" icon={RefreshCcw} onClick={() => load()} disabled={loading}>
                  Refresh
                </Button>
              ) : null}
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

          {chainStatus ? <Notice className="mb-3">{chainStatus}</Notice> : null}

          {/* ---------- table ---------- */}
          <div className="overflow-hidden rounded-doc bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-sky bg-surface-soft">
                    <Th className="w-10 pl-5">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                        aria-label="Select all escrows on this page"
                        className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--rgb-teal-solid))]"
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
                          className="cursor-pointer border-b border-sky/70 transition-colors duration-150 last:border-b-0 hover:bg-surface-soft"
                        >
                          <td className="pl-5" onClick={(ev) => ev.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(e.id)}
                              onChange={() => toggleOne(e.id)}
                              aria-label={`Select escrow ${e.id}`}
                              className="h-3.5 w-3.5 cursor-pointer accent-[rgb(var(--rgb-teal-solid))]"
                            />
                          </td>
                          <td className="py-4 pr-4">
                            <p className="text-[15px] font-semibold text-navy">{e.commodity}</p>
                            <p className="mt-0.5 text-[12.5px] text-ink-dim">
                              &#8470;&thinsp;{formatEscrowId(e.id)} &middot; {e.containerRef}
                            </p>
                          </td>
                          <td className="py-4 pr-4 text-right">
                            <p className="text-[14px] font-semibold tabular-nums text-navy">
                              {Number(e.value).toLocaleString()}
                            </p>
                            <p className="mt-0.5 text-2xs text-ink-faint">{CURRENCY_LABEL}</p>
                          </td>
                          <td className="py-4 pr-4">
                            <MilestoneMeter
                              verified={e.verified ?? verifiedFromState(e.state)}
                              total={e.total ?? 3}
                            />
                          </td>
                          <td className="py-4 pr-4">
                            <p className="text-[13.5px] text-navy">
                              {e.deadline ? new Date(e.deadline).toLocaleDateString() : "—"}
                            </p>
                            <p className="mt-0.5 text-2xs text-ink-faint">
                              {relativeDays(e.deadline)}
                            </p>
                          </td>
                          <td className="py-4 pr-4">
                            <StatusPill state={e.state} size="sm" />
                          </td>
                          <td className="pr-5 text-right" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => onOpen(e.id)}
                              aria-label={`Open escrow ${formatEscrowId(e.id)}`}
                              className="cursor-pointer rounded-panel p-1.5 text-ink-faint transition-colors duration-150 hover:bg-sky/50 hover:text-navy"
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
              <EmptyState
                icon={Inbox}
                title={rows.length === 0 ? "No escrows yet" : "Nothing matches that filter"}
                action={
                  rows.length === 0 ? (
                    <Button tone="primary" onClick={onCreate}>
                      Create escrow
                    </Button>
                  ) : null
                }
              >
                {rows.length === 0
                  ? "Lock the first shipment. The importer deposits funds, and the contract releases them only once all three milestones are verified."
                  : "Try a different status or clear the search."}
              </EmptyState>
            ) : null}

            {visible.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky px-5 py-3">
                <p className="text-[12.5px] text-ink-dim">
                  Showing{" "}
                  <span className="tabular-nums text-navy">
                    {(current - 1) * PAGE_SIZE + 1}&ndash;{Math.min(current * PAGE_SIZE, visible.length)}
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
                      className={`h-8 min-w-[32px] cursor-pointer rounded-panel px-2 text-[12.5px] tabular-nums transition-colors duration-150 ${
                        current === i + 1
                          ? "bg-teal-solid font-semibold text-white"
                          : "text-ink-dim hover:bg-sky/50 hover:text-navy"
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

          {sourceIsLive ? (
            <p className="mt-3 text-[12.5px] text-ink-faint">{sourceLabel}</p>
          ) : null}
        </div>

        <ActivityRail onOpen={onOpen} escrows={rows} />
      </div>
    </div>
  );
}

/* ---------------------------------- parts --------------------------------- */

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="text-ink-dim">{label}</span>
      <span
        className={`font-medium tabular-nums ${
          tone === "pending"
            ? "text-state-pending"
            : tone === "disputed"
              ? "text-state-disputed"
              : "text-navy"
        }`}
      >
        {value}
      </span>
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
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-panel text-ink-dim transition-colors duration-150 hover:bg-sky/50 hover:text-navy disabled:cursor-not-allowed disabled:opacity-30"
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
            className={`h-1.5 flex-1 rounded-full ${i < verified ? "bg-state-attested" : "bg-sky"}`}
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
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sky">
        {total > 0
          ? shown.map((b) => (
              <span
                key={b.key}
                className={`h-full ${b.cls} first:rounded-l-full last:rounded-r-full`}
                style={{ width: `${(byBucket[b.key] / total) * 100}%` }}
                title={`${b.label}: ${byBucket[b.key].toLocaleString()} ${CURRENCY_LABEL}`}
              />
            ))
          : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {BUCKETS.map((b) => (
          <li key={b.key} className="flex items-center gap-2 text-[12.5px]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${b.dot}`} aria-hidden="true" />
            <span className="text-ink-dim">{b.label}</span>
            <span className="font-medium tabular-nums text-navy">
              {byBucket[b.key].toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-sky/70 last:border-b-0">
      <td className="py-4 pl-5">
        <span className="block h-3.5 w-3.5 rounded-[3px] bg-sky" />
      </td>
      {[3, 1, 1, 1, 1, 0].map((flex, i) => (
        <td key={i} className="py-4 pr-4">
          {flex ? (
            <span
              className="block h-3 rounded-full bg-sky"
              style={{ width: `${flex * 28}%`, minWidth: 48 }}
            />
          ) : null}
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
