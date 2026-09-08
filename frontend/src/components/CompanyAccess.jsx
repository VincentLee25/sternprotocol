import { useState } from "react";
import { beginMfaSetup, companyLogin, confirmMfaSetup, registerCompany, verifyMfa } from "../lib/sternApi.js";

const initialRegistration = { companyName: "", email: "", username: "", walletAddress: "", password: "" };

export default function CompanyAccess() {
  const [mode, setMode] = useState("login");
  const [registration, setRegistration] = useState(initialRegistration);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [mfaToken, setMfaToken] = useState("");
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = (setter) => (event) => setter((current) => ({ ...current, [event.target.name]: event.target.value }));
  const run = async (action) => {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err?.message || "The request could not be completed."); } finally { setBusy(false); }
  };

  if (session) {
    return <div className="mt-5 border-t border-sky pt-4 text-xs text-ink-dim">
      <p><span className="font-medium text-navy">Company session active:</span> {session.company.name} · {session.user.role}</p>
      {/* Two separate sessions, and nothing said so. This one identifies the
          company to the backend; the workspace needs a wallet, which only
          Particle provides. After finishing MFA the panel simply sat there and
          the page looked stuck — the next step was above it all along. */}
      <p className="mt-1.5 font-serif leading-relaxed">
        This signs you in as the company. To open the workspace you still need a wallet —
        use <span className="text-navy">Continue with Google</span> above.
      </p>
      {!session.user.mfaEnabled ? <button type="button" disabled={busy} onClick={() => run(async () => setSetup(await beginMfaSetup(session.accessToken)))} className="mt-2 text-xs font-medium text-teal underline underline-offset-2 disabled:opacity-50">Enable MFA</button> : <p className="mt-2 text-teal">MFA enabled</p>}
      {error ? <p role="alert" className="mt-2 text-xs text-state-disputed">{error}</p> : null}
      {setup ? <div className="mt-3 space-y-2"><p className="break-all font-mono text-2xs text-navy">{setup.secret}</p><input aria-label="MFA verification code" inputMode="numeric" maxLength="6" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Authenticator code" className="w-full border border-sky bg-surface px-3 py-2 text-xs text-navy" /><button type="button" disabled={busy || code.length !== 6} onClick={() => run(async () => { const result = await confirmMfaSetup({ setupToken: setup.setupToken, code }); setSession((current) => ({ ...current, user: result.user })); setSetup(null); setCode(""); })} className="border border-teal px-3 py-2 text-xs font-medium text-teal disabled:opacity-50">Confirm MFA</button></div> : null}
    </div>;
  }

  if (mfaToken) {
    return <div className="mt-5 border-t border-sky pt-4"><p className="text-xs text-ink-dim">Enter the six-digit code from your authenticator.</p><input aria-label="MFA code" inputMode="numeric" maxLength="6" value={code} onChange={(event) => setCode(event.target.value)} placeholder="000000" className="mt-2 w-full border border-sky bg-surface px-3 py-2 text-xs text-navy" /><button type="button" disabled={busy || code.length !== 6} onClick={() => run(async () => { setSession(await verifyMfa({ mfaToken, code })); setMfaToken(""); setCode(""); })} className="mt-2 w-full border border-teal bg-teal/10 px-3 py-2 text-xs font-medium text-teal disabled:opacity-50">Verify MFA</button>{error ? <p role="alert" className="mt-2 text-xs text-state-disputed">{error}</p> : null}</div>;
  }

  const field = (name, label, type = "text", autoComplete) => <label className="block text-2xs uppercase text-ink-faint">{label}<input name={name} type={type} autoComplete={autoComplete} value={registration[name]} onChange={change(setRegistration)} required className="mt-1 block w-full border border-sky bg-surface px-3 py-2 text-xs normal-case text-navy" /></label>;
  return <div className="mt-5 border-t border-sky pt-4"><div className="flex gap-4 text-2xs uppercase"><button type="button" onClick={() => { setMode("login"); setError(""); }} className={mode === "login" ? "text-teal" : "text-ink-faint"}>Company sign in</button><button type="button" onClick={() => { setMode("register"); setError(""); }} className={mode === "register" ? "text-teal" : "text-ink-faint"}>Register company</button></div>{mode === "register" ? <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); run(async () => setSession(await registerCompany(registration))); }}>{field("companyName", "Company")}{field("email", "Email", "email", "email")}{field("username", "Username", "text", "username")}{field("walletAddress", "Primary wallet")}{field("password", "Password", "password", "new-password")}<button disabled={busy} className="w-full border border-teal bg-teal/10 px-3 py-2 text-xs font-medium text-teal disabled:opacity-50">Create company account</button></form> : <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); run(async () => { const result = await companyLogin(login); if (result.mfaRequired) setMfaToken(result.mfaToken); else setSession(result); }); }}><label className="block text-2xs uppercase text-ink-faint">Email<input name="email" type="email" autoComplete="email" value={login.email} onChange={change(setLogin)} required className="mt-1 block w-full border border-sky bg-surface px-3 py-2 text-xs normal-case text-navy" /></label><label className="block text-2xs uppercase text-ink-faint">Password<input name="password" type="password" autoComplete="current-password" value={login.password} onChange={change(setLogin)} required className="mt-1 block w-full border border-sky bg-surface px-3 py-2 text-xs normal-case text-navy" /></label><button disabled={busy} className="w-full border border-teal bg-teal/10 px-3 py-2 text-xs font-medium text-teal disabled:opacity-50">Sign in to company</button></form>}{error ? <p role="alert" className="mt-2 text-xs text-state-disputed">{error}</p> : null}</div>;
}
