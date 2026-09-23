// A deliberately quiet transition between secure sign-in and the operating
// workspace. The wordmark is the existing STERN asset, revealed left-to-right;
// there is no spinner, percentage, or infrastructure branding for the user to
// interpret.
import sternLogo from "../assets/stern-logo.png";
import { useLanguage } from "../lib/language.jsx";

export default function SessionBoot({ label = "Opening workspace", detail, error, onRetry, onSignIn }) {
  const { t } = useLanguage();
  return (
    <main className="stern-boot min-h-dvh px-6" aria-busy={error ? "false" : "true"}>
      <header className="stern-boot-header" aria-label="STERN">
        <img src={sternLogo} alt="STERN" className="h-5 w-auto brightness-0" />
      </header>
      <div className="stern-boot-stage" role="status" aria-live="polite">
        <span className="stern-boot-mark" aria-hidden="true" />
        <div className="stern-boot-copy mt-7">
          <p className="text-[13px] font-medium text-navy">{t(label)}</p>
          {detail ? <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-ink-dim">{t(detail)}</p> : null}
          {error ? (
            <>
              <p role="alert" className="mt-3 max-w-sm text-xs leading-relaxed text-state-disputed">{t(error)}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                {onRetry ? <button type="button" onClick={onRetry} className="stern-boot-action stern-boot-action-primary">{t("Retry company check")}</button> : null}
                {onSignIn ? <button type="button" onClick={onSignIn} className="stern-boot-action">{t("Return to sign in")}</button> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
