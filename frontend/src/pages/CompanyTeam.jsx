import { useEffect, useState } from "react";
import { Check, Copy, MailPlus, RefreshCcw } from "lucide-react";
import { createCompanyInvitation, listCompanyUsers } from "../lib/sternApi.js";
import { useLanguage } from "../lib/language.jsx";

function invitationLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("invite", code);
  url.hash = "";
  return url.toString();
}

export default function CompanyTeam({ session }) {
  const { t } = useLanguage();
  const companyId = session?.company?.id;
  const role = session?.user?.role;
  const canInvite = role === "owner" || role === "admin";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("operator");
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!companyId || !session?.accessToken) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    listCompanyUsers(session.accessToken, companyId, { signal: controller.signal })
      .then((result) => setUsers(result.users || []))
      .catch((cause) => { if (cause?.name !== "AbortError") setLoadError(t(cause?.message || "Could not load company members.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, session?.accessToken, reload]);

  async function createInvite(event) {
    event.preventDefault();
    setSending(true);
    setInviteError("");
    setInvitation(null);
    try {
      const result = await createCompanyInvitation(session.accessToken, companyId, { email: email.trim(), role: inviteRole });
      setInvitation(result.invitation);
      setEmail("");
      setCopied(false);
    } catch (cause) {
      setInviteError(t(cause?.message || "The invitation could not be created."));
    } finally {
      setSending(false);
    }
  }

  async function copyLink() {
    if (!invitation?.code) return;
    try {
      await navigator.clipboard.writeText(invitationLink(invitation.code));
      setCopied(true);
    } catch {
      setInviteError(t("Could not copy the link. You can select the link below instead."));
    }
  }

  return (
    <div className="mx-auto max-w-[1050px]">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-.035em] text-navy sm:text-[32px]">{t("Company & Team")}</h1>
          <p className="mt-2 text-sm text-ink-dim">{session?.company?.name || t("Your company")} · {t("Members who can work in this STERN workspace.")}</p>
        </div>
        <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading} className="flex items-center gap-2 text-xs font-medium text-teal transition-colors hover:text-navy disabled:opacity-50"><RefreshCcw size={13} aria-hidden="true" />{t("Refresh members")}</button>
      </header>

      <section className="stern-workspace-card overflow-hidden rounded-doc bg-surface shadow-card" aria-labelledby="team-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sky/70 px-5 py-4 sm:px-6">
          <h2 id="team-title" className="text-lg font-semibold text-navy">{t("Members")}</h2>
          {!loading && !loadError ? <p className="text-xs text-ink-dim">{users.length} {t(users.length === 1 ? "person" : "people")}</p> : null}
        </div>
        {loadError ? <p role="alert" className="px-5 py-6 text-sm text-state-disputed sm:px-6">{loadError}</p> : loading ? <p role="status" className="px-5 py-6 text-sm text-ink-dim sm:px-6">{t("Loading members…")}</p> : users.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px] border-collapse text-left text-sm">
              <thead className="bg-sky/20 text-xs text-ink-dim"><tr><th className="px-5 py-3 font-medium sm:px-6">{t("STERN handle")}</th><th className="px-4 py-3 font-medium">{t("Work email")}</th><th className="px-4 py-3 font-medium">{t("Role")}</th></tr></thead>
              <tbody>{users.map((member) => <tr key={member.id} className="border-t border-sky/60"><td className="px-5 py-4 font-semibold text-navy sm:px-6">@{member.username}</td><td className="px-4 py-4 text-ink-dim">{member.email}</td><td className="px-4 py-4 capitalize text-navy">{t(member.role)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="px-5 py-6 text-sm text-ink-dim sm:px-6">{t("No members are listed yet.")}</p>}
      </section>

      {canInvite ? (
        <section className="mt-6 max-w-[720px] rounded-doc bg-beige/70 p-5 sm:p-6" aria-labelledby="invite-title">
          <div className="flex items-center gap-3"><MailPlus size={19} className="text-teal" aria-hidden="true" /><h2 id="invite-title" className="text-lg font-semibold text-navy">{t("Invite a team member")}</h2></div>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">{t("Create an invitation, then share the link with your colleague. They will authenticate with Particle and join this company with the assigned role.")}</p>
          <form onSubmit={createInvite} className="mt-5 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-xs font-medium text-navy">{t("Work email")}<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-2 h-11 w-full rounded-xl border border-sky bg-white px-3 text-sm text-navy outline-none focus:border-teal" /></label>
            <label className="text-xs font-medium text-navy">{t("Role")}<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} className="mt-2 block h-11 min-w-[145px] rounded-xl border border-sky bg-white px-3 text-sm text-navy outline-none focus:border-teal"><option value="operator">{t("operator")}</option>{role === "owner" ? <option value="admin">{t("admin")}</option> : null}</select></label>
            <button type="submit" disabled={sending} className="h-11 rounded-xl bg-navy px-5 text-sm font-medium text-white transition-colors hover:bg-teal disabled:opacity-50">{t(sending ? "Creating…" : "Create invitation")}</button>
          </form>
          {inviteError ? <p role="alert" className="mt-4 text-xs text-state-disputed">{inviteError}</p> : null}
          {invitation?.code ? (
            <div className="mt-5 border-t border-sky/70 pt-5" role="status">
              <p className="text-sm font-semibold text-navy">{t("Invitation ready for {email}", { email: invitation.email })}</p>
              <p className="mt-1 text-xs text-ink-dim">{t("Share this link securely. The invited person signs in with Particle before STERN applies the {role} role.", { role: t(invitation.role) })}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2"><input readOnly aria-label={t("Invitation link")} value={invitationLink(invitation.code)} onFocus={(event) => event.target.select()} className="h-10 min-w-[220px] flex-1 rounded-lg border border-sky bg-white px-3 text-xs text-navy" /><button type="button" onClick={copyLink} className="flex h-10 items-center gap-2 rounded-lg border border-teal/30 px-3 text-xs font-medium text-teal transition-colors hover:bg-white">{copied ? <Check size={14} /> : <Copy size={14} />}{t(copied ? "Copied" : "Copy link")}</button></div>
              {invitation.expiresAt ? <p className="mt-2 text-xs text-ink-dim">{t("Expires {date}.", { date: new Date(invitation.expiresAt).toLocaleString() })}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
