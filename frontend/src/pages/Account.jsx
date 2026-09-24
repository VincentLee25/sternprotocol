import { useEffect, useState } from "react";
import { Building2, Mail, ShieldCheck } from "lucide-react";
import HandleCard from "../components/HandleCard.jsx";
import { updateCompanyMe } from "../lib/sternApi.js";
import { useLanguage } from "../lib/language.jsx";

const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export default function Account({ session, onSessionChange }) {
  const { t } = useLanguage();
  const [username, setUsername] = useState(session?.user?.username || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const currentUsername = session?.user?.username || "";
  const changed = username.trim() !== currentUsername;

  useEffect(() => {
    setUsername(currentUsername);
  }, [currentUsername]);

  async function save(event) {
    event.preventDefault();
    const next = username.trim().replace(/^@/, "").toLowerCase();
    setUsername(next);
    setSaved(false);
    if (!HANDLE_PATTERN.test(next)) {
      setError(t("Use 3–32 characters, starting with a lowercase letter or number; periods, underscores and hyphens are allowed afterward."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await updateCompanyMe(session.accessToken, { username: next });
      onSessionChange({ ...session, user: result.user, company: result.company || session.company });
      setSaved(true);
    } catch (cause) {
      setError(t(cause?.message || "Could not update your STERN username."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[980px]">
      <header className="pb-6">
        <h1 className="text-[28px] font-semibold tracking-[-.035em] text-navy sm:text-[32px]">{t("Account")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">{t("Your STERN profile is attached to your company membership. You can change your handle without changing the identity you use to sign in.")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(250px,.75fr)] lg:items-start">
        <section className="stern-workspace-card rounded-doc bg-surface p-5 shadow-card sm:p-6" aria-labelledby="profile-title">
          <h2 id="profile-title" className="text-lg font-semibold text-navy">{t("STERN profile")}</h2>
          <form onSubmit={save} className="mt-6">
            <label htmlFor="stern-username" className="block text-sm font-medium text-navy">{t("Username")}</label>
            <div className="mt-2 flex max-w-md items-center rounded-xl border border-sky bg-white px-3 transition-colors focus-within:border-teal">
              <input id="stern-username" value={username} onChange={(event) => { setUsername(event.target.value.toLowerCase().replace(/^@/, "")); setSaved(false); }} autoComplete="username" spellCheck="false" maxLength={32} className="h-11 min-w-0 flex-1 bg-transparent px-1 text-sm text-navy outline-none" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-dim">{t("Your STERN username belongs to this profile. It is not recreated when you sign in, and it does not need to match your Particle email.")}</p>
            {error ? <p role="alert" className="mt-3 text-xs text-state-disputed">{error}</p> : null}
            {saved ? <p role="status" className="mt-3 text-xs text-teal">{t("Username saved.")}</p> : null}
            <button type="submit" disabled={busy || !changed} className="mt-5 rounded-xl bg-navy px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-45">{t(busy ? "Saving…" : "Save username")}</button>
          </form>
          <div className="mt-8 border-t border-sky/70 pt-5">
            <AccountDetail icon={Mail} label={t("Work email")} value={session?.user?.email || "—"} />
            <AccountDetail icon={Building2} label={t("Company")} value={session?.company?.name || "—"} />
            <AccountDetail icon={ShieldCheck} label={t("Company role")} value={t(session?.user?.role || "—")} capitalize />
          </div>
        </section>
        <section className="stern-workspace-card rounded-doc bg-surface p-5 shadow-card sm:p-6" aria-labelledby="directory-title">
          <h2 id="directory-title" className="text-lg font-semibold text-navy">{t("Trade directory")}</h2>
          <p className="mt-2 text-xs leading-relaxed text-ink-dim">{t("Your trade directory handle is a separate public alias for finding this settlement account. Claim it once, then change it only when you want to. Your STERN username above remains your profile name.")}</p>
          <HandleCard address={session?.user?.walletAddress} />
        </section>
      </div>
    </div>
  );
}

function AccountDetail({ icon: Icon, label, value, capitalize = false }) {
  return <div className="flex items-center gap-3 py-2.5 text-sm"><Icon size={15} className="shrink-0 text-teal" aria-hidden="true" /><span className="w-28 shrink-0 text-ink-dim">{label}</span><span className={`min-w-0 break-words font-medium text-navy ${capitalize ? "capitalize" : ""}`}>{value}</span></div>;
}
