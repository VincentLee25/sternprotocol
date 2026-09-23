import { ArrowLeft, LoaderCircle } from "lucide-react";
import CompanyAccess from "../components/CompanyAccess.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import sternLogo from "../assets/stern-logo.png";

export default function Login({
  companySession,
  onCompanyAuthenticated,
  accountStatus,
  accountAddress,
  particleIdentity,
  particleEmail,
  onPrepareAccount,
  onDisconnectAccount,
  accountError,
  onBack
}) {
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
          <div className="stern-auth-card">
            {companySession?.user?.particleUserId && particleIdentity?.uuid === companySession.user.particleUserId ? (
              <SessionChecking />
            ) : (
              <CompanyAccess
                accountAddress={accountAddress}
                accountStatus={accountStatus}
                particleIdentity={particleIdentity}
                particleEmail={particleEmail}
                onPrepareAccount={onPrepareAccount}
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

function SessionChecking() {
  return (
    <section className="stern-auth-step" aria-live="polite" aria-busy="true">
      <span className="stern-auth-icon"><LoaderCircle size={21} className="animate-spin" aria-hidden="true" /></span>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[.14em] text-teal">Company workspace access</p>
      <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-.04em] text-navy">Checking company access</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-dim">Confirming your Particle identity and STERN company membership before opening the workspace.</p>
    </section>
  );
}
