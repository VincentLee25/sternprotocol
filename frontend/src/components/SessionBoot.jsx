// A deliberately quiet transition between secure sign-in and the operating
// workspace. The wordmark is the existing STERN asset, revealed left-to-right;
// there is no spinner, percentage, or infrastructure branding for the user to
// interpret.
import { useLanguage } from "../lib/language.jsx";

export default function SessionBoot({ label = "Opening workspace", detail, error, onRetry }) {
  const { t } = useLanguage();
  return (
    <main className="stern-boot grid min-h-dvh place-items-center px-6" aria-busy={error ? "false" : "true"}>
      <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
        <span className="stern-boot-mark" aria-hidden="true" />
        <div className="stern-boot-copy mt-7">
          <p className="text-[13px] font-medium text-navy">{t(label)}</p>
          {detail ? <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-ink-dim">{t(detail)}</p> : null}
          {error ? <><p role="alert" className="mt-3 max-w-sm text-xs text-state-disputed">{t(error)}</p>{onRetry ? <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-sky px-4 py-2 text-xs font-medium text-navy hover:bg-sky/20">{t("Retry company check")}</button> : null}</> : null}
        </div>
      </div>
    </main>
  );
}
