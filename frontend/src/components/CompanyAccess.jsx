import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { authorizeParticle, registerCompany, verifyMfa } from "../lib/sternApi.js";
import { AUTH } from "../lib/useSternAuth.js";

const initialRegistration = { companyName: "", email: "", username: "" };
const fieldClass = "mt-2 block h-11 w-full rounded-xl border border-sky bg-white px-3.5 text-[13px] normal-case tracking-normal text-navy outline-none transition-all placeholder:text-ink-faint focus:border-teal focus:ring-2 focus:ring-teal/10";

export default function CompanyAccess({
  accountAddress,
  accountStatus,
  particleIdentity,
  particleEmail,
  onPrepareAccount,
  onDisconnectAccount,
  onAuthenticated,
  accountError
}) {
  const [registration, setRegistration] = useState(() => ({ ...initialRegistration, email: particleEmail || "" }));
  const [mfaToken, setMfaToken] = useState("");
  const [gate, setGate] = useState("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkRevision, setCheckRevision] = useState(0);
  const particleUuid = particleIdentity?.uuid;
  const particleToken = particleIdentity?.token;

  useEffect(() => {
    if (accountStatus !== AUTH.READY || !accountAddress || !particleUuid || !particleToken) {
      setGate("idle");
      setMfaToken("");
      return undefined;
    }

    let cancelled = false;
    setGate("checking");
    setError("");
    authorizeParticle({ particleIdentity: { uuid: particleUuid, token: particleToken }, smartAccountAddress: accountAddress })
      .then((result) => {
        if (cancelled) return;
        if (result.registered === true && result.mfaRequired === true) {
          setMfaToken(result.mfaToken);
          setGate("mfa");
        } else if (result.registered === true && result.accessToken) {
          onAuthenticated(result);
        } else if (result.registrationRequired === true) {
          setRegistration((current) => ({ ...current, email: current.email || particleEmail || "" }));
          setGate("register");
        } else {
          throw new Error("The STERN membership service returned an unexpected response.");
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        setGate("error");
        setError(requestError?.message || "The company membership check failed.");
      });

    return () => { cancelled = true; };
  }, [accountStatus, accountAddress, particleUuid, particleToken, particleEmail, onAuthenticated, checkRevision]);

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (requestError) {
      setError(requestError?.message || "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const requestMembershipCheck = () => {
    setMfaToken("");
    setCode("");
    setError("");
    setCheckRevision((revision) => revision + 1);
  };

  if (mfaToken) {
    return (
      <section className="stern-auth-step" aria-labelledby="mfa-title">
        <button type="button" onClick={requestMembershipCheck} className="mb-8 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-dim transition-colors hover:text-navy">
          <ArrowLeft size={14} aria-hidden="true" /> Request a new challenge
        </button>
        <span className="stern-auth-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.14em] text-teal">Company verification</p>
        <h1 id="mfa-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Enter your authenticator code</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">Particle has confirmed your identity. Complete the MFA challenge required by your STERN company account.</p>
        <form className="mt-8" onSubmit={(event) => { event.preventDefault(); run(async () => onAuthenticated(await verifyMfa({ mfaToken, code }))); }}>
          <label className="block text-[11px] font-semibold text-navy">
            6-digit authenticator code
            <input autoFocus aria-label="6-digit authenticator code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="stern-mfa-input" />
          </label>
          <SubmitButton busy={busy} disabled={code.length !== 6} label="Verify and continue" busyLabel="Verifying code…" icon={ShieldCheck} />
        </form>
        <button type="button" onClick={onDisconnectAccount} className="mt-5 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">Use another Particle account</button>
        <FormError message={error} />
      </section>
    );
  }

  const hasParticle = Boolean(particleUuid && particleToken && accountAddress);
  const preparing = accountStatus === AUTH.LOADING || accountStatus === AUTH.AUTHENTICATING;

  if (gate === "register") {
    return (
      <section className="stern-auth-step" aria-labelledby="company-registration-title">
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-teal">Company onboarding</p>
        <h1 id="company-registration-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Create your STERN company account</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">Particle authentication is complete. Add the company details STERN needs to create your workspace.</p>
        <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          if (!hasParticle) return;
          run(async () => onAuthenticated(await registerCompany({
            ...registration,
            walletAddress: accountAddress,
            particleIdentity: { uuid: particleUuid, token: particleToken }
          })));
        }}>
          <FormField label="Company name" name="companyName" value={registration.companyName} setValue={setRegistration} autoComplete="organization" />
          <FormField label="Work email" name="email" value={registration.email} setValue={setRegistration} type="email" autoComplete="email" />
          <FormField label="Username" name="username" value={registration.username} setValue={setRegistration} autoComplete="username" autoCapitalize="none" spellCheck="false" pattern="[a-z0-9._-]{3,32}" minLength={3} maxLength={32} />
          <div className="sm:col-span-2 flex items-start gap-3 border-l-2 border-teal bg-teal/5 px-3.5 py-3">
            <Check size={14} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
            <div><p className="text-xs font-semibold text-navy">Settlement account ready</p><p className="mt-1 text-[11px] leading-relaxed text-ink-dim">STERN will use the account created through Particle automatically. No wallet address or browser extension is required.</p></div>
          </div>
          <div className="sm:col-span-2"><SubmitButton busy={busy} disabled={!hasParticle} label="Create company workspace" busyLabel="Creating company…" icon={KeyRound} /></div>
        </form>
        <button type="button" onClick={onDisconnectAccount} className="mt-5 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">Use another Particle account</button>
        <FormError message={error} />
      </section>
    );
  }

  return (
    <section className="stern-auth-step" aria-labelledby="company-access-title">
      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-teal">Secure company access</p>
      <h1 id="company-access-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Access your STERN workspace</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">Use Particle Auth as the single sign-in point. STERN checks company membership only after Particle confirms your identity.</p>

      {gate === "checking" ? (
        <div className="mt-7 flex items-center gap-3 border-l-2 border-teal bg-teal/5 px-4 py-4" role="status"><LoaderCircle size={17} className="animate-spin text-teal" /><p className="text-sm font-medium text-navy">Checking your STERN company membership…</p></div>
      ) : gate === "error" && hasParticle ? (
        <div className="mt-7 border-l-2 border-teal bg-teal/5 px-4 py-4">
          <p className="text-sm font-semibold text-navy">Company access could not be verified</p>
          <p role="alert" className="mt-1 text-xs leading-relaxed text-ink-dim">{error}</p>
          <button type="button" onClick={requestMembershipCheck} className="mt-3 cursor-pointer text-xs font-semibold text-teal underline underline-offset-2">Retry membership check</button>
          <button type="button" onClick={onDisconnectAccount} className="ml-4 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">Use another Particle account</button>
        </div>
      ) : hasParticle ? (
        <div className="mt-7 flex items-center gap-3 border-l-2 border-teal bg-teal/5 px-4 py-4" role="status"><LoaderCircle size={17} className="animate-spin text-teal" /><p className="text-sm font-medium text-navy">Checking your STERN company membership…</p></div>
      ) : (
        <div className="mt-7">
          <button type="button" onClick={onPrepareAccount} disabled={!onPrepareAccount || preparing} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0">
            {preparing ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
            {preparing ? "Preparing secure access…" : "Access Workspace"}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-dim">Particle Auth provides Google, Apple, email/password, phone, and other configured sign-in methods.</p>
        </div>
      )}
      <FormError message={gate === "error" && hasParticle ? accountError : error || accountError} />
    </section>
  );
}

function FormField({ label, name, value, setValue, type = "text", ...props }) {
  return <label className="block text-[11px] font-semibold text-navy">{label}<input name={name} type={type} value={value} onChange={(event) => setValue((current) => ({ ...current, [name]: event.target.value }))} required className={fieldClass} {...props} /></label>;
}

function SubmitButton({ busy, disabled, label, busyLabel, icon: Icon }) {
  return <button disabled={busy || disabled} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} aria-hidden="true" />}{busy ? busyLabel : label}</button>;
}

function FormError({ message }) {
  return message ? <p role="alert" className="mt-4 rounded-xl border border-state-disputed/25 bg-state-disputed/5 px-3.5 py-3 text-xs leading-relaxed text-state-disputed">{message}</p> : null;
}
