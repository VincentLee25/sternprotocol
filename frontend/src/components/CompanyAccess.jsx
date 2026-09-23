import { useState } from "react";
import { ArrowLeft, Check, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { companyLogin, registerCompany, verifyMfa } from "../lib/sternApi.js";

const initialRegistration = { companyName: "", email: "", username: "", password: "" };
const fieldClass = "mt-2 block h-11 w-full rounded-xl border border-sky bg-white px-3.5 text-[13px] normal-case tracking-normal text-navy outline-none transition-all placeholder:text-ink-faint focus:border-teal focus:ring-2 focus:ring-teal/10";

export default function CompanyAccess({ accountAddress, accountStatus, onPrepareAccount, onGoogleSignIn, onDisconnectAccount, onAuthenticated, accountError }) {
  const [mode, setMode] = useState("login");
  const [registration, setRegistration] = useState(initialRegistration);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [mfaToken, setMfaToken] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err?.message || "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  if (mfaToken) {
    return (
      <section className="stern-auth-step" aria-labelledby="mfa-title">
        <button type="button" onClick={() => { setMfaToken(""); setCode(""); setError(""); }} className="mb-8 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-dim transition-colors hover:text-navy">
          <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
        </button>
        <span className="stern-auth-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.14em] text-teal">Identity verification</p>
        <h1 id="mfa-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Enter your authenticator code</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">Open the authenticator linked to your STERN company account and enter its current six-digit code.</p>
        <form className="mt-8" onSubmit={(event) => { event.preventDefault(); run(async () => onAuthenticated(await verifyMfa({ mfaToken, code }))); }}>
          <label className="block text-[11px] font-semibold text-navy">
            6-digit authenticator code
            <input autoFocus aria-label="6-digit authenticator code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="stern-mfa-input" />
          </label>
          <SubmitButton busy={busy} disabled={code.length !== 6} label="Verify and continue" busyLabel="Verifying code…" icon={ShieldCheck} />
        </form>
        <FormError message={error} />
      </section>
    );
  }

  return (
    <section className="stern-auth-step" aria-labelledby="company-access-title">
      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-teal">Company workspace access</p>
      <h1 id="company-access-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">{mode === "login" ? "Sign in to STERN" : "Create your company workspace"}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">{mode === "login" ? "Use your company credentials. If MFA is enabled, verification follows before workspace access." : "Register the company owner account. STERN prepares the linked smart account without asking you to manage a wallet."}</p>

      <div className="mt-7 grid grid-cols-2 rounded-xl bg-sky/30 p-1" role="tablist" aria-label="Company access mode">
        <ModeButton active={mode === "login"} onClick={() => { setMode("login"); setError(""); }} label="Sign in" />
        <ModeButton active={mode === "register"} onClick={() => { setMode("register"); setError(""); }} label="Register company" />
      </div>

      {mode === "login" ? (
        <div className="mt-6">
          {accountAddress ? (
            <>
              <div className="stern-google-connected"><Check size={16} aria-hidden="true" /><span>Secure account connected</span></div>
              <button type="button" onClick={onDisconnectAccount} className="stern-auth-other-methods mt-2.5">Switch Google, Apple or other account</button>
            </>
          ) : (
            <div className="stern-auth-provider-actions">
              <button type="button" onClick={onGoogleSignIn} disabled={!onGoogleSignIn || accountStatus === "authenticating" || accountStatus === "loading"} className="stern-google-button">
                {accountStatus === "authenticating" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <GoogleMark />}
                {accountStatus === "authenticating" ? "Connecting with Google…" : "Continue with Google"}
              </button>
              <button type="button" onClick={onPrepareAccount} disabled={!onGoogleSignIn || accountStatus === "authenticating" || accountStatus === "loading"} className="stern-auth-other-methods"><KeyRound size={16} aria-hidden="true" />Continue with Apple or another provider</button>
            </div>
          )}
          {!onGoogleSignIn ? <p role="status" className="mt-3 text-[11px] leading-relaxed text-state-disputed">Social sign-in is unavailable here because Particle is not configured. Work email access remains available.</p> : null}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">Company access is confirmed with your work credentials and MFA when enabled.</p>
          <div className="stern-auth-method-divider"><span>Work email + password</span></div>
        </div>
      ) : null}

      {mode === "register" ? (
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (!accountAddress) return; run(async () => onAuthenticated(await registerCompany({ ...registration, walletAddress: accountAddress }))); }}>
          <FormField label="Company name" name="companyName" value={registration.companyName} setValue={setRegistration} autoComplete="organization" />
          <FormField label="Work email" name="email" value={registration.email} setValue={setRegistration} type="email" autoComplete="email" />
          <FormField label="Username" name="username" value={registration.username} setValue={setRegistration} autoComplete="username" autoCapitalize="none" spellCheck="false" pattern="[a-z0-9._-]{3,32}" minLength={3} maxLength={32} />
          <FormField label="Password" name="password" value={registration.password} setValue={setRegistration} type="password" autoComplete="new-password" minLength={12} />
          <div className="sm:col-span-2"><SmartAccountState address={accountAddress} status={accountStatus} error={accountError} onPrepare={onPrepareAccount} /></div>
          <div className="sm:col-span-2"><SubmitButton busy={busy} disabled={!accountAddress} label="Create company account" busyLabel="Creating company…" icon={KeyRound} /></div>
        </form>
      ) : (
        <form className="mt-2 space-y-4" onSubmit={(event) => { event.preventDefault(); run(async () => { const result = await companyLogin(login); if (result.mfaRequired) { setMfaToken(result.mfaToken); setCode(""); } else onAuthenticated(result); }); }}>
          <FormField label="Work email" name="email" value={login.email} setValue={setLogin} type="email" autoComplete="email" />
          <FormField label="Account password" name="password" value={login.password} setValue={setLogin} type="password" autoComplete="current-password" />
          <SubmitButton busy={busy} label="Continue" busyLabel="Signing in…" icon={KeyRound} />
        </form>
      )}
      <FormError message={error || (mode === "login" ? accountError : "")} />
    </section>
  );
}

function GoogleMark() {
  return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.88 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.39 14.39 0 0 1 9.75 24c0-1.6.27-3.14.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.51 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6C30.02 37.64 27.25 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}

function ModeButton({ active, onClick, label }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`cursor-pointer rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${active ? "bg-white text-navy shadow-card" : "text-ink-dim hover:text-navy"}`}>{label}</button>;
}

function FormField({ label, name, value, setValue, type = "text", ...props }) {
  return <label className="block text-[11px] font-semibold text-navy">{label}<input name={name} type={type} value={value} onChange={(event) => setValue((current) => ({ ...current, [name]: event.target.value }))} required className={fieldClass} {...props} /></label>;
}

function SmartAccountState({ address, status, error, onPrepare }) {
  const preparing = status === "loading" || status === "authenticating";
  if (address) return <div className="flex items-start gap-3 border-l-2 border-teal bg-teal/5 px-3.5 py-3"><span className="mt-0.5 text-teal"><Check size={14} /></span><div><p className="text-xs font-semibold text-navy">Registration setup ready</p><p className="mt-1 text-[11px] leading-relaxed text-ink-dim">The required company access will be linked automatically.</p></div></div>;
  return <div className="border-t border-sky/70 pt-4"><p className="text-xs font-semibold text-navy">Finish registration setup</p><p className="mt-1 text-[11px] leading-relaxed text-ink-dim">STERN prepares the required settlement access in the background. No wallet address or browser extension is required.</p><button type="button" onClick={onPrepare} disabled={preparing} className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-navy/15 bg-white px-3.5 py-2 text-[11px] font-semibold text-navy transition-colors hover:border-teal hover:text-teal disabled:cursor-wait disabled:opacity-60">{preparing ? <LoaderCircle size={13} className="animate-spin" /> : <KeyRound size={13} />}{preparing ? "Preparing registration…" : "Continue registration setup"}</button>{error ? <p className="mt-2 text-[11px] text-state-disputed">{error}</p> : null}</div>;
}

function SubmitButton({ busy, disabled, label, busyLabel, icon: Icon }) {
  return <button disabled={busy || disabled} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} aria-hidden="true" />}{busy ? busyLabel : label}</button>;
}

function FormError({ message }) {
  return message ? <p role="alert" className="mt-4 rounded-xl border border-state-disputed/25 bg-state-disputed/5 px-3.5 py-3 text-xs leading-relaxed text-state-disputed">{message}</p> : null;
}
