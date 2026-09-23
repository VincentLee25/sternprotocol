import { Building2, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import AccountSecurity from "../components/AccountSecurity.jsx";

export default function Security({ session, onSessionChange }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="border-b border-sky/70 pb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-teal">Account settings</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-.035em] text-navy sm:text-[32px]">Security and access</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">Review the company identity used for this workspace and manage authenticator verification.</p>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[.72fr_1.28fr] lg:items-start">
        <section className="stern-workspace-card rounded-doc bg-surface p-5 shadow-card sm:p-6" aria-labelledby="account-summary-title">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky/40 text-navy"><UserRound size={17} /></span><h2 id="account-summary-title" className="text-[15px] font-semibold text-navy">Company account</h2></div>
          <dl className="mt-5 divide-y divide-sky/70 border-y border-sky/70">
            <SummaryRow icon={Building2} label="Company" value={session?.company?.name || "—"} />
            <SummaryRow icon={UserRound} label="User" value={session?.user?.email || "—"} />
            <SummaryRow icon={KeyRound} label="Role" value={session?.user?.role || "—"} capitalize />
          </dl>
          <div className="mt-5 flex items-start gap-2.5 text-xs leading-relaxed text-ink-dim"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-teal" /><p>Workspace permissions continue to follow the company role and the parties recorded on each trade.</p></div>
        </section>

        <AccountSecurity session={session} onSessionChange={onSessionChange} />
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value, capitalize = false }) {
  return <div className="flex items-center gap-3 py-3.5"><Icon size={14} className="shrink-0 text-ink-faint" /><dt className="w-16 shrink-0 text-[11px] text-ink-faint">{label}</dt><dd className={`min-w-0 truncate text-xs font-medium text-navy ${capitalize ? "capitalize" : ""}`}>{value}</dd></div>;
}
