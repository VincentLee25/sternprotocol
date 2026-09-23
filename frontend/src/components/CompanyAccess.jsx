import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { acceptCompanyInvitation, authorizeParticle, registerCompany, verifyMfa } from "../lib/sternApi.js";
import { AUTH } from "../lib/useSternAuth.js";
import { useLanguage } from "../lib/language.jsx";

const initialRegistration = { companyName: "", email: "", username: "" };
const fieldClass = "mt-2 block h-11 w-full rounded-xl border border-sky bg-white px-3.5 text-[13px] normal-case tracking-normal text-navy outline-none transition-all placeholder:text-ink-faint focus:border-teal focus:ring-2 focus:ring-teal/10";

function invitationFromUrl() {
  return new URLSearchParams(window.location.search).get("invite")?.trim() || "";
}

function removeInvitationFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function invitationErrorMessage(error, t) {
  switch (error?.code) {
    case "INVITATION_NOT_FOUND": return t("This invitation link is not valid. Ask your company owner for a new link.");
    case "INVITATION_EXPIRED": return t("This invitation has expired. Ask your company owner for a new link.");
    case "INVITATION_USED": return t("This invitation has already been used. Ask your company owner for a new link.");
    case "INVITATION_EMAIL_MISMATCH": return t("This invitation is for a different work email. Enter the invited email or ask your company owner for another invitation.");
    default: return t(error?.message || "The company invitation could not be accepted.");
  }
}

export default function CompanyAccess({
  accountAddress,
  accountStatus,
  particleIdentity,
  onPrepareAccount,
  onRefreshParticleIdentity,
  onDisconnectAccount,
  onAuthenticated,
  accountError
}) {
  const { t } = useLanguage();
  const [registration, setRegistration] = useState(() => ({ ...initialRegistration }));
  const [mfaToken, setMfaToken] = useState("");
  const [gate, setGate] = useState("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkRevision, setCheckRevision] = useState(0);
  const inviteAttempt = useRef(null);
  const invitationCode = invitationFromUrl();
  const particleUuid = particleIdentity?.uuid;
  const particleToken = particleIdentity?.token;

  const finishSession = useCallback((session) => {
    if (invitationCode) removeInvitationFromUrl();
    onAuthenticated(session);
  }, [invitationCode, onAuthenticated]);

  useEffect(() => {
    if (accountStatus !== AUTH.READY || !accountAddress || !particleUuid || !particleToken) {
      setGate("idle");
      setMfaToken("");
      return undefined;
    }

    let cancelled = false;
    setGate("checking");
    setError("");
    Promise.resolve().then(() => onRefreshParticleIdentity?.() || { uuid: particleUuid, token: particleToken })
      .then(async (currentIdentity) => ({
        currentIdentity,
        result: await authorizeParticle({ particleIdentity: currentIdentity, smartAccountAddress: accountAddress })
      }))
      .then(async ({ currentIdentity, result: initialResult }) => {
        if (cancelled) return;
        let result = initialResult;
        if (invitationCode && result.registered === true) {
          // A member may join another STERN company from an invitation. Reuse
          // the in-flight request if React Strict Mode replays this effect.
          const key = `${currentIdentity.uuid}:${currentIdentity.token}:${accountAddress}:${invitationCode}:${checkRevision}`;
          if (inviteAttempt.current?.key !== key) {
            inviteAttempt.current = {
              key,
              promise: acceptCompanyInvitation({
                particleIdentity: currentIdentity,
                smartAccountAddress: accountAddress,
                code: invitationCode
              })
            };
          }
          result = await inviteAttempt.current.promise;
          if (cancelled) return;
        } else if (invitationCode && result.registrationRequired === true) {
          setGate("invite-register");
          return;
        }

        if (result.registered === true && result.mfaRequired === true) {
          setMfaToken(result.mfaToken);
          setGate("mfa");
        } else if (result.registered === true && result.accessToken) {
          finishSession(result);
        } else if (result.registrationRequired === true) {
          setGate("register");
        } else {
          throw new Error("STERN received an unexpected company access response.");
        }
      })
      .catch((requestError) => {
        if (cancelled) return;
        setGate(invitationCode ? "invite-error" : "error");
        setError(invitationCode ? invitationErrorMessage(requestError, t) : t(requestError?.message || "The company membership check failed."));
      });

    return () => { cancelled = true; };
  }, [accountStatus, accountAddress, particleUuid, particleToken, invitationCode, finishSession, onRefreshParticleIdentity, checkRevision]);

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (requestError) {
      setError(invitationCode ? invitationErrorMessage(requestError, t) : t(requestError?.message || "The request could not be completed."));
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
          <ArrowLeft size={14} aria-hidden="true" /> {t("Request a new challenge")}
        </button>
        <span className="stern-auth-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.14em] text-teal">{t("Company verification")}</p>
        <h1 id="mfa-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">{t("Enter your authenticator code")}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">{t("Particle has confirmed your identity. Complete the MFA challenge required by your STERN company account.")}</p>
        <form className="mt-8" onSubmit={(event) => { event.preventDefault(); run(async () => finishSession(await verifyMfa({ mfaToken, code }))); }}>
          <label className="block text-[11px] font-semibold text-navy">
            {t("6-digit authenticator code")}
            <input autoFocus aria-label={t("6-digit authenticator code")} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="stern-mfa-input" />
          </label>
          <SubmitButton busy={busy} disabled={code.length !== 6} label={t("Verify and continue")} busyLabel={t("Verifying code…")} icon={ShieldCheck} />
        </form>
        <button type="button" onClick={onDisconnectAccount} className="mt-5 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">{t("Use another Particle account")}</button>
        <FormError message={error} />
      </section>
    );
  }

  const hasParticle = Boolean(particleUuid && particleToken && accountAddress);
  const preparing = accountStatus === AUTH.LOADING || accountStatus === AUTH.AUTHENTICATING;

  if (gate === "register" || gate === "invite-register") {
    const joiningCompany = gate === "invite-register";
    return (
      <section className="stern-auth-step" aria-labelledby="company-registration-title">
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-teal">{t("Company onboarding")}</p>
        <h1 id="company-registration-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">{t(joiningCompany ? "Join your STERN company" : "Create your STERN company account")}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">{t(joiningCompany ? "Your invitation is ready. Choose the work email and STERN handle your team will recognize." : "Particle authentication is complete. Add your company details to create a workspace.")}</p>
        <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          if (!hasParticle) return;
          run(async () => {
            const identity = { uuid: particleUuid, token: particleToken };
            const session = joiningCompany
              ? await acceptCompanyInvitation({
                  particleIdentity: identity,
                  smartAccountAddress: accountAddress,
                  code: invitationCode,
                  email: registration.email.trim(),
                  username: registration.username.trim()
                })
              : await registerCompany({
                  companyName: registration.companyName.trim(),
                  email: registration.email.trim(),
                  username: registration.username.trim(),
                  walletAddress: accountAddress,
                  particleIdentity: identity
                });
            if (session.mfaRequired === true && session.mfaToken) {
              setMfaToken(session.mfaToken);
              setGate("mfa");
            } else if (session.accessToken) {
              finishSession(session);
            } else {
              throw new Error("STERN could not finish your company access. Please try again.");
            }
          });
        }}>
          {!joiningCompany ? <div className="sm:col-span-2"><FormField label={t("Company name")} name="companyName" value={registration.companyName} setValue={setRegistration} autoComplete="organization" /></div> : null}
          <FormField label={t("Work email")} name="email" value={registration.email} setValue={setRegistration} type="email" autoComplete="email" />
          <FormField label={t("STERN handle")} name="username" value={registration.username} setValue={setRegistration} autoComplete="username" autoCapitalize="none" spellCheck="false" pattern="[a-z0-9._-]{3,32}" minLength={3} maxLength={32} prefix="@" />
          <p className="sm:col-span-2 -mt-2 text-[11px] leading-relaxed text-ink-dim">{t("Your STERN handle is separate from the email you used to sign in with Particle. You can change it later.")}</p>
          <div className="sm:col-span-2 flex items-start gap-3 border-l-2 border-teal bg-teal/5 px-3.5 py-3">
            <Check size={14} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
            <div><p className="text-xs font-semibold text-navy">{t("Settlement account ready")}</p><p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{t("STERN will use the account created through Particle automatically. No wallet address or browser extension is required.")}</p></div>
          </div>
          <div className="sm:col-span-2"><SubmitButton busy={busy} disabled={!hasParticle} label={t(joiningCompany ? "Join company workspace" : "Create company workspace")} busyLabel={t(joiningCompany ? "Joining company…" : "Creating company…")} icon={KeyRound} /></div>
        </form>
        <button type="button" onClick={onDisconnectAccount} className="mt-5 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">{t("Use another Particle account")}</button>
        <FormError message={error} />
      </section>
    );
  }

  return (
    <section className="stern-auth-step" aria-labelledby="company-access-title">
      <p className="text-[11px] font-bold uppercase tracking-[.14em] text-teal">{t("Secure company access")}</p>
      <h1 id="company-access-title" className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">{t("Access your STERN workspace")}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim">{t("Sign in with Particle. STERN will then open your company workspace or guide you through joining one.")}</p>

      {gate === "checking" ? (
        <div className="mt-7 flex items-center gap-3 border-l-2 border-teal bg-teal/5 px-4 py-4" role="status"><LoaderCircle size={17} className="animate-spin text-teal" /><p className="text-sm font-medium text-navy">{t("Checking your STERN company membership…")}</p></div>
      ) : (gate === "error" || gate === "invite-error") && hasParticle ? (
        <div className="mt-7 border-l-2 border-teal bg-teal/5 px-4 py-4">
          <p className="text-sm font-semibold text-navy">{t(gate === "invite-error" ? "Company invitation could not be accepted" : "Company access could not be verified")}</p>
          <p role="alert" className="mt-1 text-xs leading-relaxed text-ink-dim">{error}</p>
          {gate === "invite-error" ? <p className="mt-2 text-xs leading-relaxed text-ink-dim">{t("If the invitation has expired, ask your company owner for a new link.")}</p> : null}
          <button type="button" onClick={requestMembershipCheck} className="mt-3 cursor-pointer text-xs font-semibold text-teal underline underline-offset-2">{t(gate === "invite-error" ? "Retry invitation" : "Retry membership check")}</button>
          <button type="button" onClick={onDisconnectAccount} className="ml-4 cursor-pointer text-xs font-semibold text-ink-dim underline underline-offset-2">{t("Use another Particle account")}</button>
        </div>
      ) : hasParticle ? (
        <div className="mt-7 flex items-center gap-3 border-l-2 border-teal bg-teal/5 px-4 py-4" role="status"><LoaderCircle size={17} className="animate-spin text-teal" /><p className="text-sm font-medium text-navy">{t("Checking your STERN company membership…")}</p></div>
      ) : (
        <div className="mt-7">
          <button type="button" onClick={onPrepareAccount} disabled={!onPrepareAccount || preparing} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0">
            {preparing ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <KeyRound size={15} aria-hidden="true" />}
            {t(preparing ? "Preparing secure access…" : "Access Workspace")}
          </button>
          <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-dim">{t("Particle Auth provides Google, Apple, email/password, phone, and other configured sign-in methods.")}</p>
        </div>
      )}
      <FormError message={(gate === "error" || gate === "invite-error") && hasParticle ? accountError : error || accountError} />
    </section>
  );
}

function FormField({ label, name, value, setValue, type = "text", prefix, ...props }) {
  return <label className="block text-[11px] font-semibold text-navy">{label}<span className="relative block">{prefix ? <span aria-hidden="true" className="absolute left-3.5 top-1/2 mt-1 -translate-y-1/2 text-sm text-teal">{prefix}</span> : null}<input name={name} type={type} value={value} onChange={(event) => setValue((current) => ({ ...current, [name]: name === "username" ? event.target.value.replace(/^@+/, "").toLowerCase() : event.target.value }))} required className={fieldClass} style={prefix ? { paddingLeft: "2rem" } : undefined} {...props} /></span></label>;
}

function SubmitButton({ busy, disabled, label, busyLabel, icon: Icon }) {
  return <button disabled={busy || disabled} className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-4 py-3 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal hover:shadow-card disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Icon size={14} aria-hidden="true" />}{busy ? busyLabel : label}</button>;
}

function FormError({ message }) {
  return message ? <p role="alert" className="mt-4 rounded-xl border border-state-disputed/25 bg-state-disputed/5 px-3.5 py-3 text-xs leading-relaxed text-state-disputed">{message}</p> : null;
}
