import { FileCheck2, ShieldCheck, Zap } from "lucide-react";
import PortPlate from "../components/PortPlate.jsx";
import { Notice } from "../components/ui.jsx";
import { missingCredentials, particleEnabled } from "../lib/particle.js";
import { contractsWithoutWallet } from "../lib/sternContract.js";
import sternLogo from "../assets/stern-logo.png";
import CompanyAccess from "../components/CompanyAccess.jsx";

const FEATURES = [
  {
    icon: ShieldCheck,
    text: "Milestone-verified settlement — Sucofindo, the shipping line and customs each sign off before funds move"
  },
  {
    icon: Zap,
    text: "Gasless transactions — every action is sponsored, and no gas fee is ever shown to you"
  },
  {
    icon: FileCheck2,
    text: "IDRT-demo balance provisioned automatically the moment you sign in"
  }
];

export default function Login({ onConnect, error, busy }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="chrome-dark relative hidden overflow-hidden bg-onyx lg:block">
        <div className="absolute inset-0">
          <PortPlate />
        </div>
        {/* Directional scrim. Without it the lede and feature rows sit straight
            on the gantry cranes and read as noise however high the nominal
            contrast is. It fades left-to-right rather than flat, so the text
            column is backed while the sun and the right of the plate stay
            visible — the plate is half the argument. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-onyx/95 via-onyx/70 to-transparent"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <img src={sternLogo} alt="STERN" className="h-6 w-auto self-start" />

          <div className="max-w-md">
            <span className="mb-5 block text-2xs font-semibold uppercase tracking-macro text-teal">
              Evidence-led escrow for export&ndash;import settlement
            </span>
            <h1 className="text-[36px] font-bold leading-[1.06] text-alabaster">
              Paid the moment it leaves the port.
            </h1>
            <ul className="mt-8 space-y-4">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-teal/40 bg-teal/10 text-teal">
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-relaxed text-ink-dim">{text}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-2xs text-ink-faint">Polygon Amoy testnet &middot; Phase 0 preview</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-beige p-6 lg:p-8">
        <div className="w-full max-w-sm py-10">
          <div className="mb-8 lg:hidden">
            <img src={sternLogo} alt="STERN" className="h-6 w-auto invert dark:invert-0" />
          </div>

          <h2 className="text-[26px] font-bold leading-tight text-navy">Sign in to continue</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-dim">
            Your wallet is created automatically — no seed phrase, no browser extension.
          </p>

          {error ? (
            <Notice tone="disputed" role="alert" className="mt-4">
              <span className="block">{error}</span>
              {/* Only offer the popup explanation when the error does not already
                  carry its own. Appending it to every failure sent people
                  hunting for a popup blocker while the real cause — an
                  unreachable RPC — was already spelled out above. */}
              {!/rpc|fetch|network|reach|VITE_/i.test(String(error)) ? (
                <span className="mt-1 block text-ink-dim">
                  If nothing opened, your browser may have blocked the popup — allow popups for this
                  site and try again.
                </span>
              ) : null}
            </Notice>
          ) : null}

          {contractsWithoutWallet ? (
            <Notice tone="pending" className="mt-4">
              Contract addresses are set, but the Particle keys are not — so there is no real wallet
              to transact with and the app stays on demo data. Fill in the three{" "}
              <code className="font-mono text-[12px]">VITE_PARTICLE_</code> keys to go on chain.
            </Notice>
          ) : missingCredentials ? (
            <Notice tone="pending" className="mt-4">
              Particle credentials are missing from{" "}
              <code className="font-mono text-[12px]">.env</code>, so this is running on demo data.
              Copy <code className="font-mono text-[12px]">.env.example</code> and fill in the three
              keys to sign in for real.
            </Notice>
          ) : null}

          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="mt-6 flex w-full cursor-pointer items-center justify-center gap-2.5 whitespace-nowrap rounded-panel border border-sky bg-surface px-4 py-3 text-sm font-medium text-navy shadow-card transition-colors duration-150 hover:border-teal/50 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-teal border-t-transparent"
                aria-hidden="true"
              />
            ) : (
              <GoogleMark />
            )}
            {busy ? "Opening sign-in…" : "Continue with Google"}
          </button>

          <p className="mt-3 text-center text-2xs text-ink-faint">
            {particleEnabled ? "Powered by Particle Network" : "Demo mode — no wallet created"}
          </p>

          <CompanyAccess />

          <div className="mt-8 rounded-doc border border-sky bg-surface p-4">
            <p className="text-[13px] font-semibold text-navy">What happens after sign-in</p>
            <ol className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink-dim">
              <li>1. A Smart Account wallet is created for you in the background</li>
              <li>2. 150,000,000 IDRT-demo is credited automatically, once</li>
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
