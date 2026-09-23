import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { getCompanyMemberships, switchCompany } from "../lib/sternApi.js";
import { useLanguage } from "../lib/language.jsx";

export default function AccountMenu({ session, onNavigate, onSignOut, onSessionChange }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState([]);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const rootRef = useRef(null);
  const handle = session?.user?.username ? `@${session.user.username}` : t("STERN account");

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !session?.accessToken) return undefined;
    let cancelled = false;
    getCompanyMemberships(session.accessToken)
      .then((result) => { if (!cancelled) setMemberships(result.memberships || []); })
      .catch(() => { if (!cancelled) setMemberships([]); });
    return () => { cancelled = true; };
  }, [open, session?.accessToken]);

  async function chooseCompany(companyId) {
    if (companyId === session?.company?.id || switching) return;
    setSwitching(true);
    setSwitchError("");
    try {
      const next = await switchCompany(session.accessToken, companyId);
      onSessionChange(next);
      navigate("overview");
    } catch (error) {
      setSwitchError(error?.message || t("Could not open that company workspace."));
    } finally {
      setSwitching(false);
    }
  }

  function navigate(destination) {
    setOpen(false);
    onNavigate(destination);
  }

  return (
    <div ref={rootRef} className="stern-account-menu relative ml-auto">
      <button
        type="button"
        aria-label={`${t("Account menu")} — ${handle}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className="stern-account-trigger flex cursor-pointer items-center gap-2.5 rounded-full border border-sky/70 bg-white px-2 py-1.5 text-left text-navy transition-colors hover:border-teal/50 hover:bg-sky/20 sm:pr-3"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold uppercase text-white">{(session?.user?.username || "S")[0]}</span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[170px] truncate text-xs font-semibold">{handle}</span>
          <span className="block max-w-[170px] truncate text-[11px] text-ink-dim">{session?.company?.name || t("Company")}</span>
        </span>
        <ChevronDown size={14} className={`hidden text-ink-dim transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div role="menu" aria-label={t("Account")} className="stern-account-popover absolute right-0 top-[calc(100%+10px)] z-50 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-sky/70 bg-white p-2 shadow-elevated">
          <div className="border-b border-sky/70 px-3 pb-3 pt-2">
            <p className="text-[15px] font-semibold text-navy">{handle}</p>
            <p className="mt-0.5 truncate text-xs text-ink-dim">{session?.company?.name || t("Company")} · <span className="capitalize">{t(session?.user?.role || "member")}</span></p>
            <p className="mt-1 truncate text-xs text-ink-dim">{session?.user?.email || ""}</p>
          </div>
          <button type="button" role="menuitem" onClick={() => navigate("account")} className="stern-account-menu-item"><Settings2 size={16} aria-hidden="true" />{t("Account")}</button>
          <button type="button" role="menuitem" onClick={() => navigate("security")} className="stern-account-menu-item"><ShieldCheck size={16} aria-hidden="true" />{t("Security")}</button>
          <button type="button" role="menuitem" onClick={() => navigate("team")} className="stern-account-menu-item"><UsersRound size={16} aria-hidden="true" />{t("Company & Team")}</button>
          {memberships.length > 1 ? (
            <div className="mt-1 border-t border-sky/70 px-1 pt-2">
              <p className="px-2 pb-1 text-[11px] font-medium text-ink-dim">{t("Switch company")}</p>
              {memberships.map((membership) => (
                <button key={membership.companyId} type="button" role="menuitem" disabled={switching || membership.companyId === session?.company?.id} onClick={() => chooseCompany(membership.companyId)} className="stern-account-menu-item justify-between disabled:cursor-default disabled:bg-sky/20">
                  <span className="truncate">{membership.companyName}</span><span className="ml-2 shrink-0 text-[11px] capitalize text-ink-dim">{t(membership.role)}</span>
                </button>
              ))}
              {switchError ? <p role="alert" className="px-2 py-1 text-xs text-state-disputed">{switchError}</p> : null}
            </div>
          ) : null}
          <div className="my-1 border-t border-sky/70" />
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onSignOut(); }} className="stern-account-menu-item"><LogOut size={16} aria-hidden="true" />{t("Sign out")}</button>
        </div>
      ) : null}
    </div>
  );
}
