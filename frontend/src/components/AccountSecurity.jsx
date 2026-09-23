import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { beginMfaSetup, confirmMfaSetup } from "../lib/sternApi.js";

export default function AccountSecurity({ session, onSessionChange }) {
  const [setup, setSetup] = useState(null);
  const [qrData, setQrData] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const enabled = Boolean(session?.user?.mfaEnabled);

  useEffect(() => {
    let active = true;
    if (!setup?.otpauthUrl) {
      setQrData("");
      return undefined;
    }
    import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(setup.otpauthUrl, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#2F4156", light: "#FFFFFF" }
      }))
      .then((value) => { if (active) setQrData(value); })
      .catch(() => { if (active) setQrData(""); });
    return () => { active = false; };
  }, [setup]);

  async function startSetup() {
    setBusy(true);
    setError("");
    try {
      setSetup(await beginMfaSetup(session.accessToken));
      setCode("");
    } catch (err) {
      setError(err?.message || "MFA setup could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await confirmMfaSetup({ setupToken: setup.setupToken, code });
      onSessionChange({ ...session, user: result.user });
      setSetup(null);
      setCode("");
    } catch (err) {
      setError(err?.message || "The authenticator code could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The secret remains visible as a manual setup fallback.
    }
  }

  return (
    <section className="stern-workspace-card overflow-hidden rounded-doc bg-surface shadow-card" aria-labelledby="mfa-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky/70 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky/40 text-navy"><ShieldCheck size={17} /></span>
          <div>
            <h2 id="mfa-settings-title" className="text-[15px] font-semibold text-navy">Authenticator MFA</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-dim">Require a current six-digit authenticator code after company credentials.</p>
          </div>
        </div>
        <SecurityStatus enabled={enabled} />
      </div>

      <div className="p-5 sm:p-6">
        {enabled ? (
          <div className="flex max-w-xl items-start gap-3 border-l-2 border-teal bg-teal/5 px-4 py-3">
            <Check size={15} className="mt-0.5 shrink-0 text-teal" />
            <p className="text-xs leading-relaxed text-ink-dim"><span className="font-semibold text-navy">MFA is active for this account.</span><br />The backend will request an authenticator code after successful credential verification.</p>
          </div>
        ) : setup ? (
          <form onSubmit={confirm} className="max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="text-sm font-semibold text-navy">Link an authenticator</h3><p className="mt-1 text-xs leading-relaxed text-ink-dim">Scan the QR code with your authenticator, then confirm the current code.</p></div>
              <button type="button" onClick={() => { setSetup(null); setCode(""); setError(""); }} aria-label="Cancel MFA setup" className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-faint transition-colors hover:bg-sky/30 hover:text-navy"><X size={14} /></button>
            </div>
            <div className="mt-5 grid gap-6 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
              <div className="grid min-h-[190px] place-items-center border border-sky/70 bg-white p-3">{qrData ? <img src={qrData} alt="Authenticator setup QR code" className="h-40 w-40" /> : <LoaderCircle size={20} className="animate-spin text-teal" />}</div>
              <div>
                <label className="block text-[11px] font-semibold text-navy">Manual setup key</label>
                <button type="button" onClick={copySecret} className="mt-2 flex w-full cursor-pointer items-center gap-2 border-b border-sky py-2 text-left transition-colors hover:border-teal"><span className="min-w-0 flex-1 break-all font-mono text-[10px] text-navy">{setup.secret}</span>{copied ? <Check size={13} className="shrink-0 text-teal" /> : <Copy size={13} className="shrink-0 text-ink-faint" />}</button>
                <label className="mt-5 block text-[11px] font-semibold text-navy">6-digit authenticator code<input aria-label="Confirm six-digit authenticator code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-2 h-11 w-full rounded-xl border border-sky bg-white px-3 text-center font-mono text-lg tracking-[.28em] text-navy outline-none focus:border-teal focus:ring-2 focus:ring-teal/10" /></label>
                <button disabled={busy || code.length !== 6} className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-navy px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />}Confirm MFA</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="max-w-xl">
            <p className="text-sm leading-relaxed text-ink-dim">MFA is not enabled for this user. Setup is confirmed and stored by the existing STERN identity service.</p>
            <button type="button" onClick={startSetup} disabled={busy} className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 focus-visible:ring-offset-2 disabled:opacity-50">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <KeyRound size={14} />}Set up MFA</button>
          </div>
        )}
        {error ? <p role="alert" className="mt-4 max-w-xl border-l-2 border-state-disputed bg-state-disputed/5 px-3 py-2.5 text-xs leading-relaxed text-state-disputed">{error}</p> : null}
      </div>
    </section>
  );
}

function SecurityStatus({ enabled }) {
  return <span className={`inline-flex items-center gap-2 text-xs font-semibold ${enabled ? "text-teal" : "text-state-pending"}`}><span className={`h-2 w-2 rounded-full ${enabled ? "bg-teal" : "bg-state-pending"}`} aria-hidden="true" />{enabled ? "MFA enabled" : "MFA not enabled"}</span>;
}
