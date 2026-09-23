import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, LogOut } from "lucide-react";
import CompanyAccess from "../components/CompanyAccess.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import sternLogo from "../assets/stern-logo.png";
import { AUTH } from "../lib/useSternAuth.js";

export default function Login({
  companySession,
  onCompanyAuthenticated,
  onClearCompanySession,
  accountStatus,
  accountAddress,
  onPrepareAccount,
  onGoogleSignIn,
  onDisconnectAccount,
  accountError,
  onBack
}) {
  const accountReady = accountStatus === AUTH.READY && Boolean(accountAddress);

  return (
    <main className="stern-auth-shell min-h-dvh text-navy">
      <div className="stern-auth-frame">
        <header className="stern-auth-header">
          <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40">
            <ArrowLeft size={15} className="text-teal" aria-hidden="true" />
            <img src={sternLogo} alt="STERN" className="h-5 w-auto brightness-0" />
          </button>
          <LanguageToggle compact />
        </header>

        <div className="stern-auth-panel-body">
          <div className="stern-auth-editorial" aria-hidden="true">
            <div className="stern-auth-editorial-copy">
              <span>STERN / TRADE OPERATIONS</span>
              <p>One clear record<br />from cargo to settlement.</p>
            </div>
            <figure className="stern-auth-editorial-figure">
              <img src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=960&q=85" alt="" />
              <figcaption>Physical trade, with evidence in view.</figcaption>
            </figure>
          </div>
          <div className="stern-auth-card">
            {companySession ? (
              <WorkspaceAccessStep
                session={companySession}
                accountReady={accountReady}
                accountStatus={accountStatus}
                accountAddress={accountAddress}
                error={accountError}
                onPrepare={onPrepareAccount}
                onClear={onClearCompanySession}
                onDisconnectAccount={onDisconnectAccount}
                socialAvailable={Boolean(onGoogleSignIn)}
              />
            ) : (
              <CompanyAccess
                accountAddress={accountAddress}
                accountStatus={accountStatus}
                onPrepareAccount={onPrepareAccount}
                onGoogleSignIn={onGoogleSignIn}
                onDisconnectAccount={onDisconnectAccount}
                onAuthenticated={onCompanyAuthenticated}
                accountError={accountError}
              />
            )}
          </div>
        </div>

        <footer className="stern-auth-footer">Secure company access · STERN trade workspace</footer>
      </div>
    </main>
  );
}

function WorkspaceAccessStep({ session, accountReady, accountStatus, accountAddress, error, onPrepare, onClear, onDisconnectAccount, socialAvailable }) {
  const preparing = accountStatus === AUTH.LOADING || accountStatus === AUTH.AUTHENTICATING;
  const expected = session.user?.walletAddress?.toLowerCase();
  const actual = accountAddress?.toLowerCase();
  const mismatch = Boolean(expected && actual && expected !== actual);

  return (
    <section className="stern-auth-step" aria-labelledby="workspace-access-title">
      <span className="stern-auth-icon"><KeyRound size={21} aria-hidden="true" /></span>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[.14em] text-teal">Company identity confirmed</p>
      <h1 id="workspace-access-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Finalizing workspace access</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">STERN is applying the company access and settlement permissions connected to this account.</p>

      <div className="mt-7 border-y border-sky/70 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-navy text-sm font-semibold text-white">{(session.user?.username || session.user?.email || "S")[0].toUpperCase()}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-navy">{session.company?.name}</p><p className="mt-0.5 text-xs capitalize text-ink-dim">{session.user?.email} · {session.user?.role}</p></div>
        </div>
      </div>

      {accountReady && !mismatch ? (
        <div className="mt-5 flex items-start gap-3 border-l-2 border-teal bg-teal/5 px-4 py-3">
          <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-teal" />
          <div><p className="text-xs font-semibold text-navy">Workspace access confirmed</p><p className="mt-1 text-[11px] leading-relaxed text-ink-dim">Opening the workspace with your company permissions.</p></div>
        </div>
      ) : mismatch ? (
        <div className="mt-5 border-l-2 border-state-disputed bg-state-disputed/5 px-4 py-3">
          <p className="text-xs font-semibold text-state-disputed">This workspace identity is not linked to the company user.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">Switch the connected account, then choose the identity originally linked to this company.</p>
          <button type="button" onClick={onDisconnectAccount} className="mt-3 cursor-pointer text-xs font-semibold text-teal underline underline-offset-2">Switch sign-in provider</button>
        </div>
      ) : (
        <button type="button" onClick={onPrepare} disabled={preparing} className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {preparing ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}
          {preparing ? "Finalizing access…" : socialAvailable ? "Continue with Google, Apple & more" : "Continue to workspace"}
        </button>
      )}

      {error ? <p role="alert" className="mt-4 border-l-2 border-state-disputed bg-state-disputed/5 px-3.5 py-3 text-xs text-state-disputed">{error}</p> : null}
      <button type="button" onClick={onClear} className="mt-6 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-dim transition-colors hover:text-navy"><LogOut size={13} /> Use another company account</button>
    </section>
  );
}
