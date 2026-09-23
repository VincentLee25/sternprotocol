import { useEffect, useState } from "react";
import { Check, Copy, FilePlus2, KeyRound, LayoutList, LogOut, RadioTower, ShieldCheck, Wallet, X } from "lucide-react";
import { shortAddress } from "../lib/actors.js";
import { getHealth } from "../lib/api.js";
import { onChainConfigured } from "../lib/sternContract.js";
import { CHAIN_LABEL } from "../lib/explorer.js";
import sternLogo from "../assets/stern-logo.png";
import LanguageToggle from "./LanguageToggle.jsx";
import { useLanguage } from "../lib/language.jsx";

const NAV = [
  { id: "overview", icon: LayoutList },
  { id: "create", icon: FilePlus2 },
  { id: "ops", icon: KeyRound },
  { id: "security", icon: ShieldCheck }
];

export default function Sidebar({
  open,
  onClose,
  view,
  onNavigate,
  user,
  balance,
  onClaim,
  claiming,
  canClaim,
  claimError,
  onSignOut,
  onOpenOps,
  isOnChainReady,
  companySession
}) {
  const { language } = useLanguage();
  const ui = language === "id"
    ? { workspace: "Workspace", escrows: "Escrow", create: "Buat escrow", operations: "Operasional", security: "Keamanan", signOut: "Keluar", balance: "Saldo demo IDRT" }
    : { workspace: "Workspace", escrows: "Escrows", create: "New escrow", operations: "Operations", security: "Security", signOut: "Sign out", balance: "IDRT-demo balance" };
  const labels = { overview: ui.escrows, create: ui.create, ops: ui.operations, security: ui.security };
  const [oracleOnline, setOracleOnline] = useState(null);
  const mfaEnabled = Boolean(companySession?.user?.mfaEnabled);

  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        const health = await getHealth();
        if (!cancelled) setOracleOnline(Boolean(health.ok));
      } catch {
        if (!cancelled) setOracleOnline(false);
      }
    }
    ping();
    const interval = setInterval(ping, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <aside className={`stern-workspace-sidebar flex h-dvh w-[280px] max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-sky/70 transition-transform duration-200 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 lg:w-[252px] lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sky/60 px-5 py-4">
        <button type="button" onClick={() => onNavigate("landing")} className="cursor-pointer text-left" aria-label="STERN home">
          <img src={sternLogo} alt="STERN" className="h-5 w-auto brightness-0" />
          <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-teal">Trade workspace</span>
        </button>
        <div className="flex items-center gap-1.5">
          <LanguageToggle compact />
          <button type="button" onClick={onClose} aria-label="Close navigation" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-dim transition-colors hover:bg-beige hover:text-navy lg:hidden"><X size={16} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="stern-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <nav className="sticky top-0 z-10 border-b border-sky/50 bg-[#f8faf9]/95 px-3 pb-3 pt-4 backdrop-blur" aria-label="Primary">
          <p className="px-2 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{ui.workspace}</p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} type="button" onClick={() => item.id === "ops" ? onOpenOps() : onNavigate(item.id)} aria-current={active ? "page" : undefined} className={`relative mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30 ${active ? "bg-sky/55 font-semibold text-navy" : "text-navy/85 hover:bg-sky/25 hover:text-navy"}`}>
                <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${active ? "bg-teal" : "bg-transparent"}`} aria-hidden="true" />
                <Icon size={15} className={active ? "text-teal" : "text-ink-dim"} aria-hidden="true" />
                <span className="min-w-0 flex-1"><span className="block text-[12.5px]">{labels[item.id]}</span>{item.id === "security" ? <span className={`mt-0.5 flex items-center gap-1.5 text-[9px] font-medium ${mfaEnabled ? "text-teal" : "text-ink-faint"}`}><span className={`h-1.5 w-1.5 rounded-full ${mfaEnabled ? "bg-teal" : "bg-state-pending"}`} aria-hidden="true" />MFA {mfaEnabled ? "enabled" : "not enabled"}</span> : null}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4">
          <section aria-label="System status" className="border-b border-sky/70 pb-4">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">System status</p>
            <StatusRow label={isOnChainReady ? CHAIN_LABEL : "Mock session"} tone={isOnChainReady ? "attested" : "pending"} />
            <StatusRow label="Oracle gateway" tone={oracleOnline === null ? "neutral" : oracleOnline ? "attested" : "disputed"} icon={RadioTower} />
          </section>

          <section aria-label="Workspace balance" className="border-b border-sky/70 py-4">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint"><Wallet size={11} aria-hidden="true" />{ui.balance}</div>
            <p className="mt-1.5 font-mono text-base font-semibold text-navy">{balance ? Number(balance).toLocaleString("id-ID") : "0"}</p>
            {onChainConfigured ? <SmartAccountAddress address={user?.smartAccountAddress} /> : null}
            {canClaim && !user?.hasClaimedDemoBalance ? <button type="button" onClick={onClaim} disabled={claiming} className="mt-2 cursor-pointer text-[10px] font-semibold text-teal transition-colors hover:text-navy disabled:opacity-50">{claiming ? "Minting…" : "Claim demo balance"}</button> : null}
            {canClaim && user?.hasClaimedDemoBalance ? <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Demo balance already claimed for this account.</p> : null}
            {claimError ? <p role="alert" className="mt-2 border-l-2 border-state-disputed pl-2 text-[10px] leading-relaxed text-state-disputed">{claimError}</p> : null}
          </section>

          <section className="pt-4" aria-label="Signed-in user">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold uppercase text-beige">{(companySession?.user?.email || user?.email || "S")[0].toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-navy">{companySession?.user?.email || user?.email || "Signed in"}</span><span className="block truncate text-[10px] capitalize text-ink-faint">{companySession?.company?.name} · {companySession?.user?.role}</span></span>
            </div>
            <button type="button" onClick={onSignOut} className="mt-3 flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-ink-dim transition-colors hover:text-navy"><LogOut size={11} aria-hidden="true" />{ui.signOut}</button>
          </section>
        </div>
      </div>
    </aside>
  );
}

function StatusRow({ label, tone, icon: Icon }) {
  const dot = { attested: "bg-teal", pending: "bg-state-pending", disputed: "bg-state-disputed", neutral: "bg-sky" }[tone];
  return <div className="flex items-center gap-2 py-1 text-[10px] text-ink-dim">{Icon ? <Icon size={11} className="text-ink-faint" aria-hidden="true" /> : <span className="w-[11px]" />}<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" /><span>{label}</span></div>;
}

function SmartAccountAddress({ address }) {
  const [copied, setCopied] = useState(false);
  if (!address) return <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">Resolving settlement account…</p>;
  async function copy() {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* Address remains visible. */ }
  }
  return <button type="button" onClick={copy} title={address} className="mt-2 flex w-full cursor-pointer items-center gap-1.5 border-b border-sky/70 py-1.5 text-left transition-colors hover:border-teal"><span className="min-w-0 flex-1 truncate font-mono text-[9px] text-ink-dim">{shortAddress(address)}</span>{copied ? <Check size={11} className="text-teal" /> : <Copy size={11} className="text-ink-faint" />}<span className="sr-only" role="status">{copied ? "Settlement account copied" : ""}</span></button>;
}
