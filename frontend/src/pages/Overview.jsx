import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown, ChevronLeft, ChevronRight, Inbox, RefreshCcw, Search
} from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import ActivityRail from "../components/ActivityRail.jsx";
import { loadActivityForRows, loadEscrowRows, sourceIsLive, sourceLabel } from "../lib/escrowSource.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { formatEscrowId } from "../lib/escrowState.js";
import { MILESTONES, STATE_ORDER } from "../lib/milestones.js";
import { useLanguage } from "../lib/language.jsx";

const PAGE_SIZE = 6;

// Chain rows carry no milestone proofs, so progress is inferred from how far
// along STATE_ORDER the escrow has walked. Mock rows report it directly.
function verifiedFromState(state) {
  const i = STATE_ORDER.indexOf(state);
  if (state === "Completed") return MILESTONES.length;
  return i <= 0 ? 0 : Math.min(i, MILESTONES.length);
}

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

export default function Overview({ walletAddress, refreshKey, onOpen, onCreate, onRegistryLoad, user, balance, canClaim, claiming, claimError, onClaim }) {
  const { t } = useLanguage();
  const [chainStatus, setChainStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  // One loader for both sources. escrowSource decides which, and returns the
  // same row shape either way, so nothing below this point knows the difference.
  async function load(signal) {
    setLoading(true);
    setChainStatus("");
    const requestController = new AbortController();
    let timedOut = false;
    const cancelWithPage = () => requestController.abort();
    if (signal?.aborted) requestController.abort();
    else signal?.addEventListener("abort", cancelWithPage, { once: true });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, 15000);
    try {
      const full = await loadEscrowRows({ address: walletAddress, signal: requestController.signal });
      setRows(full);
      onRegistryLoad?.(full);
      if (sourceIsLive && full.length === 0) {
        setChainStatus(t("Connected to the gateway. No escrows have been created yet."));
      }
      // The table is on screen by now. Activity is an event scan per escrow, so
      // it arrives afterwards and updates in place rather than holding the page.
        setLoading(false);
      if (full.length) {
        loadActivityForRows(full, { signal })
          .then((withActivity) => {
            setRows(withActivity);
            onRegistryLoad?.(withActivity);
          })
          .catch(() => {});
      }
    } catch (error) {
      if (timedOut) {
        setChainStatus(t("The local gateway did not respond. Please try again."));
        return;
      }
      if (error.name === "AbortError") return;
      setChainStatus(error.message);
    } finally {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", cancelWithPage);
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
    const locked = active.reduce((sum, escrow) => sum + (Number(escrow.value) || 0), 0);
    const settled = rows.filter((e) => e.state === "Completed");
    const disputes = rows.filter((e) => e.state === "Disputed");
    const now = Date.now();
    const soon = active.filter((e) => {
      const deadline = new Date(e.deadline || 0).getTime();
      return deadline >= now && deadline - now <= 72 * 60 * 60 * 1000;
    });
    const awaitingEvidence = active.filter((e) => (e.verified ?? verifiedFromState(e.state)) < MILESTONES.length);
    const bondAtRisk = disputes.reduce((sum, e) => sum + (Number(e.value) || 0) * 0.02, 0);
    const perMilestone = MILESTONES.map((m, i) => ({
      label: m.label,
      done: active.filter((e) => (e.verified ?? 0) > i).length,
      of: active.length
    }));
    return {
      locked,
      activeCount: active.length,
      settledCount: settled.length,
      settledValue: settled.reduce((s, e) => s + (Number(e.value) || 0), 0),
      disputeCount: disputes.length,
      awaitingEvidenceCount: awaitingEvidence.length,
      deadlineSoonCount: soon.length,
      bondAtRisk,
      perMilestone
    };
  }, [rows]);

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.035em] text-navy sm:text-[30px]">
            {t("Escrows")}
          </h1>
          <p className="mt-2 text-[14px] text-ink-dim">
            {sourceIsLive
              ? t(sourceLabel)
              : t("Monitor escrow value, evidence readiness, and upcoming operational deadlines.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="mr-1 text-right">
            <p className="text-[11px] text-ink-dim">{t("Demo IDRT balance")}</p>
            <p className="text-sm font-semibold tabular-nums text-navy">{Number(balance || 0).toLocaleString("id-ID")} IDRT</p>
            {canClaim && !user?.hasClaimedDemoBalance ? <button type="button" onClick={onClaim} disabled={claiming} className="text-xs font-medium text-teal hover:text-navy disabled:opacity-50">{t(claiming ? "Minting…" : "Claim demo balance")}</button> : null}
          </div>
          {sourceIsLive ? (
            <button
              type="button"
              onClick={() => load()}
              disabled={loading}
              className="flex cursor-pointer items-center gap-2 rounded-panel border border-sky bg-surface px-5 py-2.5 text-[13px] font-medium text-navy shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-teal/40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-40"
            >
              <RefreshCcw size={13} aria-hidden="true" />
              {t("Refresh")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCreate}
            className="cursor-pointer rounded-panel bg-navy px-6 py-2.5 text-[13px] font-medium text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-solid hover:shadow-elevated"
          >
            {t("New escrow")}
          </button>
        </div>
      </header>
      {claimError ? <p role="alert" className="mb-4 text-xs text-state-disputed">{claimError}</p> : null}

      <div className="min-w-0">
          {/* The escrow value leads; supporting counts stay compact. */}
          <section className="stern-workspace-summary mb-5">
            <div className="stern-workspace-summary-cell">
              <p className="text-sm font-medium text-white/80">{t("Active escrow value")}</p>
              <p className="mt-3 text-[38px] font-semibold leading-none tabular-nums tracking-display text-white sm:text-[44px]">
                {stats.locked.toLocaleString()}
                <span className="ml-2 align-middle text-xs font-medium text-white/70">
                  {CURRENCY_LABEL}
                </span>
              </p>
              <p className="mt-4 text-xs text-white/75">{t("Across {count} active escrows", { count: stats.activeCount })}</p>
            </div>

            <div className="stern-workspace-summary-cell">
              <p className="text-sm text-ink-dim">{t("Awaiting evidence")}</p>
              <p className="mt-3 text-[26px] font-semibold leading-none tabular-nums text-navy">{stats.awaitingEvidenceCount}</p>
              <p className="mt-3 text-xs text-ink-dim">{t("Milestone checks remaining")}</p>
            </div>

            <div className="stern-workspace-summary-cell">
              <p className="text-sm text-ink-dim">{t("Open disputes")}</p>
              <p
                className={`mt-3 text-[26px] font-semibold leading-none tabular-nums ${
                  stats.disputeCount > 0 ? "text-state-disputed" : "text-navy"
                }`}
              >
                {stats.disputeCount}
              </p>
              <p className="mt-3 text-xs text-ink-dim">{stats.disputeCount ? t("{value} bond at risk", { value: `${Math.round(stats.bondAtRisk).toLocaleString()} ${CURRENCY_LABEL}` }) : t("No intervention required")}</p>
            </div>

            <div className="stern-workspace-summary-cell">
              <p className="text-sm text-ink-dim">{t("Deadlines within 72h")}</p>
              <p className={`mt-3 text-[26px] font-semibold leading-none tabular-nums ${stats.deadlineSoonCount ? "text-state-pending" : "text-navy"}`}>{stats.deadlineSoonCount}</p>
              <p className="mt-3 text-xs text-ink-dim">{t("Time-sensitive windows")}</p>
            </div>
          </section>

          {/* ---------- toolbar ---------- */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-sky/70">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`cursor-pointer border-b-2 px-0.5 pb-2 text-[13px] transition-colors duration-150 ${
                    filter === f.key
                      ? "border-teal font-semibold text-navy"
                      : "border-transparent text-ink-dim hover:text-navy"
                  }`}
                >
                  {t(f.label)}
                  <span className="ml-1.5 tabular-nums opacity-60">
                    {counts[f.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>

            {/* Wraps, and the search field is fluid rather than a fixed 240px.
                Side by side at that width the pair ran past a 375px screen and
                the sort control was clipped off the edge. */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label className="relative min-w-0 flex-1 sm:flex-none">
                <span className="sr-only">{t("Search escrows")}</span>
                <Search
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("Search commodity or container")}
                  className="w-full rounded-panel border border-sky bg-surface py-2 pl-8 pr-3.5 text-[13px] text-navy placeholder:text-ink-faint focus:border-teal focus:outline-none sm:w-[240px]"
                />
              </label>
              <label className="flex shrink-0 items-center gap-1.5 rounded-panel border border-sky bg-surface py-2 pl-3 pr-2 text-[13px] text-ink-dim">
                <ArrowUpDown size={13} aria-hidden="true" />
                <span className="sr-only">{t("Sort by")}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="cursor-pointer bg-transparent pr-1 text-navy focus:outline-none"
                >
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {t(v.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {chainStatus ? (
            <p className="mb-3 font-serif text-sm text-ink-dim">{chainStatus}</p>
          ) : null}

          {/* ---------- table ---------- */}
          <div className="stern-workspace-card overflow-hidden rounded-doc bg-surface shadow-card">
            <div className="overflow-x-auto">
              <table className="stern-operational-table w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-sky">
                    <Th className="pl-5">{t("Escrow")}</Th>
                    <Th className="text-right">{t("Value")}</Th>
                    <Th className="w-[190px]">{t("Milestones")}</Th>
                    <Th>{t("Deadline")}</Th>
                    <Th>{t("Status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                    : pageRows.map((e) => (
                        <tr
                          key={`${e.source}-${e.id}`}
                          onClick={() => onOpen(e.id)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(e.id); } }}
                          tabIndex={0}
                          aria-label={t("Open escrow {id} for {commodity}", { id: formatEscrowId(e.id), commodity: e.commodity })}
                          className="cursor-pointer border-b border-sky/50 last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal"
                        >
                          <td className="py-3.5 pl-5 pr-4">
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
                              {relativeDays(e.deadline, t)}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <StatusPill state={e.state} />
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
                  {t(rows.length === 0 ? "No escrows yet" : "Nothing matches that filter")}
                </p>
                <p className="mt-2 max-w-sm font-serif text-[14.5px] leading-relaxed text-ink-dim">
                  {rows.length === 0
                    ? t("Lock the first shipment. The importer deposits funds, and the contract releases them only once all three milestones are verified.")
                    : t("Try a different status or clear the search.")}
                </p>
                {rows.length === 0 ? (
                  <button
                    type="button"
                    onClick={onCreate}
                    className="mt-5 cursor-pointer rounded-panel bg-teal-solid px-6 py-2.5 text-[13px] font-medium text-white shadow-card transition-colors duration-150 hover:bg-teal"
                  >
                    {t("Create escrow")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {visible.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky px-5 py-3">
                <p className="text-[12.5px] text-ink-dim">
                  {t("Showing")}{" "}
                  <span className="tabular-nums text-navy">
                    {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, visible.length)}
                  </span>{" "}
                  {t("of")} <span className="tabular-nums text-navy">{visible.length}</span>
                </p>
                <div className="flex items-center gap-1">
                  <PagerBtn onClick={() => setPage(current - 1)} disabled={current === 1} label={t("Previous page")}>
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
                  <PagerBtn onClick={() => setPage(current + 1)} disabled={current === pageCount} label={t("Next page")}>
                    <ChevronRight size={14} aria-hidden="true" />
                  </PagerBtn>
                </div>
              </div>
            ) : null}
          </div>

          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <CriticalDeadlines escrows={rows} onOpen={onOpen} />
            <ActivityRail onOpen={onOpen} escrows={rows} compact />
          </section>
        </div>
      </div>
  );
}

/* ---------------------------------- parts --------------------------------- */

function Th({ children, className = "" }) {
  return (
    <th scope="col" className={`py-3 pr-4 text-xs font-semibold text-navy ${className}`}>
      {children}
    </th>
  );
}

function CriticalDeadlines({ escrows, onOpen }) {
  const { t } = useLanguage();
  const upcoming = [...escrows]
    .filter((escrow) => escrow.deadline && !["Completed", "Refunded"].includes(escrow.state))
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 4);

  return (
    <section className="stern-workspace-card rounded-doc bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-navy">{t("Evidence and release windows")}</h2>
        </div>
        <span className="text-xs font-medium text-state-pending">{upcoming.length} {t("upcoming")}</span>
      </div>

      {upcoming.length ? (
        <ol className="mt-4 space-y-2.5">
          {upcoming.map((escrow) => (
            <li key={escrow.id}>
              <button
                type="button"
                onClick={() => onOpen(escrow.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-panel bg-beige/75 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-sky/35"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium text-navy">{escrow.commodity}</span>
                  <span className="mt-0.5 block text-xs text-ink-dim">&#8470;&thinsp;{formatEscrowId(escrow.id)} · {escrow.containerRef}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-medium text-navy">{new Date(escrow.deadline).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  <span className="mt-0.5 block text-xs text-state-pending">{relativeDays(escrow.deadline, t)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 font-serif text-sm leading-relaxed text-ink-dim">{t("There are no open escrow deadlines to review.")}</p>
      )}
    </section>
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
            className={`stern-milestone-segment h-1.5 flex-1 rounded-full ${i < verified ? "is-complete bg-state-attested" : "bg-sky/60"}`}
          />
        ))}
      </span>
      <span className="shrink-0 text-[12.5px] tabular-nums text-ink-dim">
        {verified}/{total}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-sky/60 last:border-b-0">
      {[3, 1, 1, 1, 1].map((flex, i) => (
        <td key={i} className={`py-4 pr-4 ${i === 0 ? "pl-5" : ""}`}>
          {flex ? <span className="block h-3 rounded-full bg-sky/50" style={{ width: `${flex * 28}%`, minWidth: 48 }} /> : null}
        </td>
      ))}
    </tr>
  );
}

function relativeDays(iso, t) {
  if (!iso) return "";
  const days = Math.round((new Date(iso) - Date.now()) / 86400000);
  if (days < 0) return t("{days}d overdue", { days: Math.abs(days) });
  if (days === 0) return t("today");
  return t("in {days}d", { days });
}
