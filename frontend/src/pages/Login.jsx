import { useState } from "react";
import { FileCheck2, ShieldCheck, Zap } from "lucide-react";
import PortPlate from "../components/PortPlate.jsx";
import { postAuthSession } from "../lib/mockBackend.js";

const FEATURES = [
  { icon: ShieldCheck, text: "Milestone-verified settlement — Sucofindo, the shipping line, and customs each sign off before funds move" },
  { icon: Zap, text: "Gasless transactions — every action is sponsored, no POL or gas fee ever shown to you" },
  { icon: FileCheck2, text: "IDRT-demo balance provisioned automatically the moment you sign in" }
];

export default function Login({ onAuthenticated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleLogin() {
    setLoading(true);
    setError("");
    try {
      const user = await postAuthSession({ authType: "google", email: "buyer@example.com" });
      onAuthenticated(user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-onyx lg:block">
        <div className="absolute inset-0">
          <PortPlate />
        </div>
        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="text-lg font-semibold tracking-[0.14em] text-alabaster">STERN</span>

          <div className="max-w-md">
            <span className="mb-5 block font-mono text-2xs uppercase tracking-macro text-[#7FA9BC]">
              Smart escrow for export&ndash;import settlement
            </span>
            <h1 className="text-[36px] font-medium leading-[1.04] tracking-display text-alabaster">
              Paid the moment it leaves the port.
            </h1>
            <ul className="mt-8 space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#7FA9BC]/40 bg-[#7FA9BC]/10 text-[#7FA9BC]">
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="font-serif text-sm leading-relaxed text-alabaster/80">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-2xs uppercase text-alabaster/60">Polygon Amoy testnet · Fase 0 preview</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-beige p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-lg font-semibold tracking-[0.14em] text-navy">STERN</span>
          </div>

          <h2 className="text-[26px] font-medium tracking-display text-navy">Sign in to continue</h2>
          <p className="mt-1.5 font-serif text-sm text-ink-dim">
            Your wallet is created automatically — no seed phrase, no browser extension.
          </p>

          {error ? (
            <div className="mt-4 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-3.5 py-2.5 font-serif text-xs text-state-disputed">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-sky bg-white px-4 py-3 text-sm font-medium text-navy shadow-card transition-colors duration-150 hover:border-teal/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal border-t-transparent" aria-hidden="true" />
            ) : (
              <GoogleMark />
            )}
            {loading ? "Creating your wallet…" : "Continue with Google"}
          </button>

          <p className="mt-4 text-center font-mono text-2xs uppercase text-ink-faint">
            Powered by Particle Network
          </p>

          <div className="mt-10 rounded-doc border border-sky bg-white p-4">
            <p className="font-mono text-2xs uppercase text-ink-faint">What happens after sign-in</p>
            <ol className="mt-2.5 space-y-1.5 font-serif text-xs text-ink-dim">
              <li>1. A Smart Account wallet is created for you in the background</li>
              <li>2. 150,000,000 IDRT-demo is credited automatically (one-time)</li>
              <li>3. You can create or act on escrows immediately — no gas ever required</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}
