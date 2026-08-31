import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Inbox, RefreshCcw } from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import { getBrowserContract } from "../lib/contract.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { stateFromIndex, formatEscrowId } from "../lib/escrowState.js";

export default function Overview({ escrows, isOnChainReady, onOpen, onCreate, onChainSync }) {
  const [chainStatus, setChainStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadChainEscrows() {
    if (!isOnChainReady) return;
    setLoading(true);
    setChainStatus("Reading escrows from the local contract…");

    try {
      const contract = await getBrowserContract({ requireSigner: false });
      const next = Number(await contract.nextEscrowId());
      const ids = Array.from({ length: next }, (_item, index) => index);
      const rows = await Promise.all(
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
      onChainSync(rows);
      setChainStatus(rows.length === 0 ? "Contract deployed. No escrows created yet." : "");
    } catch (error) {
      setChainStatus(error.shortMessage || error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChainEscrows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnChainReady]);

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
          <p className="font-mono text-2xs uppercase text-ink-faint">On-chain registry</p>
          <h1 className="mt-1.5 text-[32px] font-medium leading-none tracking-display text-navy">
            Escrows
          </h1>
          <p className="mt-2 font-serif text-[15px] text-teal">
            {isOnChainReady
              ? "Local Hardhat network"
              : "Local mock session. Connect a wallet and set VITE_CONTRACT_ADDRESS for on-chain mode."}
          </p>
        </div>
        <div className="flex gap-2.5">
          {isOnChainReady ? (
            <button
              type="button"
              onClick={loadChainEscrows}
              disabled={loading}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-sky bg-white px-5 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCcw size={13} aria-hidden="true" />
              Sync chain
            </button>
          ) : null}
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
        <Stat label="Value locked" value={`${stats.locked.toLocaleString()} ${CURRENCY_LABEL}`} mono />
        <Stat
          label="Settled"
          value={`${stats.settledCount} · ${stats.settledValue.toLocaleString()} ${CURRENCY_LABEL}`}
          mono
        />
        <Stat label="Open disputes" value={String(stats.disputed)} warn={stats.disputed > 0} />
      </section>

      {chainStatus ? <p className="mb-3 font-serif text-sm text-ink-dim">{chainStatus}</p> : null}

      {escrows.length === 0 ? (
        <div className="grid place-items-center rounded-doc bg-white px-6 py-16 text-center shadow-card">
          <Inbox size={22} className="mb-3 text-ink-faint" aria-hidden="true" />
          <p className="text-base font-medium text-navy">No escrows yet</p>
          <p className="mt-2 max-w-sm font-serif text-[15px] leading-relaxed text-ink-dim">
            Lock the first shipment: the importer deposits funds, and the contract releases them
            only when all five trade checks are attested.
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
              key={`${escrow.source}-${escrow.id}`}
              type="button"
              onClick={() => onOpen(escrow.id)}
              className="flex w-full cursor-pointer flex-wrap items-center gap-4 border-b border-sky/60 px-6 py-5 text-left transition-colors duration-150 last:border-b-0 hover:bg-beige"
            >
              <span className="w-[76px] shrink-0 font-mono text-xs text-teal">
                &#8470;&thinsp;{formatEscrowId(escrow.id)}
              </span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-[17px] font-medium tracking-[-0.015em] text-navy">
                  {escrow.commodity}
                </span>
                <span className="mt-0.5 block font-serif text-sm text-teal">
                  {escrow.containerRef}
                  {escrow.deadline
                    ? ` · due ${new Date(escrow.deadline).toLocaleDateString()}`
                    : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[15px] font-medium tabular-nums text-navy">
                  {Number(escrow.value).toLocaleString()}
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

function Stat({ label, value, mono, warn }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="font-mono text-2xs uppercase text-ink-faint">{label}</p>
      <p
        className={`mt-1.5 text-lg font-medium tracking-[-0.02em] ${mono ? "font-mono text-[15px] tabular-nums" : ""} ${
          warn ? "text-state-disputed" : "text-navy"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
