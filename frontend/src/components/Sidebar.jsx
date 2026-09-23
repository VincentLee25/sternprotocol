import { useEffect, useState } from "react";
import { FilePlus2, KeyRound, LayoutList, RadioTower, ShieldCheck, X } from "lucide-react";
import { getHealth } from "../lib/api.js";
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
  onOpenOps,
  isOnChainReady
}) {
  const { t } = useLanguage();
  const labels = { overview: t("Escrows"), create: t("New escrow"), ops: t("Operations"), security: t("Security") };
  const [oracleOnline, setOracleOnline] = useState(null);

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
        <button type="button" onClick={() => onNavigate("landing")} className="cursor-pointer text-left" aria-label={t("STERN home")}>
          <img src={sternLogo} alt="STERN" className="h-5 w-auto brightness-0" />
          <span className="mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] text-teal">{t("Trade workspace")}</span>
        </button>
        <div className="flex items-center gap-1.5">
          <LanguageToggle compact />
          <button type="button" onClick={onClose} aria-label={t("Close navigation")} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-dim transition-colors hover:bg-beige hover:text-navy lg:hidden"><X size={16} aria-hidden="true" /></button>
        </div>
      </div>

      <div className="stern-sidebar-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <nav className="px-3 pb-3 pt-4" aria-label={t("Primary navigation")}>
          <p className="px-2 pb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{t("Workspace")}</p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button key={item.id} type="button" onClick={() => item.id === "ops" ? onOpenOps() : onNavigate(item.id)} aria-current={active ? "page" : undefined} className={`relative mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/30 ${active ? "bg-sky/55 font-semibold text-navy" : "text-navy/85 hover:bg-sky/25 hover:text-navy"}`}>
                <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full ${active ? "bg-teal" : "bg-transparent"}`} aria-hidden="true" />
                <Icon size={15} className={active ? "text-teal" : "text-ink-dim"} aria-hidden="true" />
                <span className="min-w-0 flex-1 text-[13px]">{labels[item.id]}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <section aria-label={t("System status")} className="shrink-0 border-t border-sky/60 px-5 py-3">
        <p className="mb-1.5 text-[11px] font-medium text-ink-dim">{t("System status")}</p>
        <StatusRow label={isOnChainReady ? CHAIN_LABEL : t("Demo network")} tone={isOnChainReady ? "attested" : "pending"} />
        <StatusRow label={t("Gateway")} tone={oracleOnline === null ? "neutral" : oracleOnline ? "attested" : "disputed"} icon={RadioTower} />
      </section>
    </aside>
  );
}

function StatusRow({ label, tone, icon: Icon }) {
  const color = { attested: "text-teal", pending: "text-state-pending", disputed: "text-state-disputed", neutral: "text-ink-dim" }[tone];
  return <div className={`flex items-center gap-2 py-1 text-[10px] ${color}`}>{Icon ? <Icon size={11} aria-hidden="true" /> : <span className="w-[11px]" />}<span>{label}</span></div>;
}
