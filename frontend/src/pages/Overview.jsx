import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Inbox, RefreshCcw } from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import { listEscrows } from "../lib/mockRegistry.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { formatEscrowId } from "../lib/escrowState.js";

export default function Overview({ onOpen, onCreate }) {
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { escrows: rows } = await listEscrows();
    setEscrows(rows.map((row) => ({ ...row, id: row.escrowId })));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = escrows.filter((e) => !["Completed", "Refunded"].includes(e.state));
    const locked = active.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
    const settled = escrows.filter((e) => e.state === "Completed");
    const settledValue = settled.reduce((sum, e) => sum + (Number(e.value) || 0), 0);
    const disputed = escrows.filter((e) => e.state === "Disputed").length;
    return { activeCount: active.length, locked, settledCount: settled.length, settledValue, disputed };
  }, [escrows]);

  return (
    <div className="mx-auto max-w-[940px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-2xs uppercase text-ink-faint">Settlement registry</p>
          <h1 className="mt-1.5 text-[32px] font-medium leading-none tracking-display text-navy">
            Escrows
          </h1>
          <p className="mt-2 font-serif text-[15px] text-teal">
            Milestone-verified shipment settlement · Polygon Amoy · Fase 0 preview
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-sky bg-white px-5 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCcw size={13} aria-hidden="true" />
            Refresh
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="flex cursor-pointer items-center gap-2 rounded-full bg-navy px-6 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal"
          >
            New escrow
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-doc bg-sky shadow-card lg:grid-cols-4">
        <Stat label="Active escrows" value={String(stats.activeCount)} />
        <Stat label="Value locked" value={stats.locked.toLocaleString("id-ID")} unit={CURRENCY_LABEL} mono />
        <Stat
          label="Settled"
          value={`${stats.settledCount} · ${stats.settledValue.toLocaleString("id-ID")}`}
          unit={CURRENCY_LABEL}
          mono
        />
        <Stat label="Open disputes" value={String(stats.disputed)} warn={stats.disputed > 0} />
      </section>

      {escrows.length === 0 && !loading ? (
        <div className="grid place-items-center rounded-doc bg-white px-6 py-16 text-center shadow-card">
          <Inbox size={22} className="mb-3 text-ink-dim" aria-hidden="true" />
          <p className="text-base font-medium text-navy">No escrows yet</p>
          <p className="mt-2 max-w-sm font-serif text-[15px] leading-relaxed text-ink-dim">
            Lock the first shipment: the importer deposits IDRT-demo, and it releases once
            Sucofindo, the shipping line, and customs each verify their milestone.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 cursor-pointer rounded-full bg-navy px-6 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal"
          >
            Create escrow
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-doc bg-white shadow-card">
          {escrows.map((escrow) => (
            <button
              key={escrow.escrowId}
              type="button"
              onClick={() => onOpen(escrow.escrowId)}
              className="flex w-full cursor-pointer flex-wrap items-center gap-4 border-b border-sky/60 px-6 py-5 text-left transition-colors duration-150 last:border-b-0 hover:bg-beige"
            >
              <span className="w-[76px] shrink-0 font-mono text-xs text-teal">
                &#8470;&thinsp;{formatEscrowId(escrow.escrowId)}
              </span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-[17px] font-medium tracking-[-0.015em] text-navy">
                  {escrow.commodity}
                </span>
                <span className="mt-0.5 block font-serif text-sm text-teal">
                  {escrow.containerRef}
                  {escrow.globalDeadline ? ` · due ${new Date(escrow.globalDeadline).toLocaleDateString("id-ID")}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[15px] font-medium tabular-nums text-navy">
                  {Number(escrow.value).toLocaleString("id-ID")}
                </span>
                <span className="block font-mono text-2xs uppercase text-ink-faint">
                  {CURRENCY_LABEL}
                </span>
              </span>
              <span className="w-[150px] shrink-0 text-right">
                <StatusPill state={escrow.state} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, unit, mono, warn }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="font-mono text-2xs uppercase text-ink-faint">{label}</p>
      {/* The unit rides on its own line: as one string, `IDRT-demo` wrapped at
          its hyphen and the figure read as two broken tokens. */}
      <p
        className={`mt-1.5 whitespace-nowrap text-lg font-medium tracking-[-0.02em] ${
          mono ? "font-mono text-[15px] tabular-nums" : ""
        } ${warn ? "text-state-disputed" : "text-navy"}`}
      >
        {value}
      </p>
      {unit ? <p className="mt-0.5 font-mono text-2xs uppercase text-ink-faint">{unit}</p> : null}
    </div>
  );
}
