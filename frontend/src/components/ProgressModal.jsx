import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * A blocking overlay for work that talks to the chain.
 *
 * Verification sends up to three transactions one after another and can sit
 * there for the better part of a minute. Before this, the only sign anything was
 * happening was a spinner inside a button, and the honest question a person asks
 * at that point is the one that was impossible to answer: is this alive, or has
 * it died?
 *
 * So the elapsed counter is the point of this component, not decoration. A
 * number that keeps moving is the difference between waiting and wondering.
 * After a while it also says what "long" means here, so a slow testnet does not
 * read as a hang.
 */
export default function ProgressModal({ open, title, detail, steps }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 grid place-items-center bg-onyx/70 px-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-sm rounded-doc bg-surface p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-teal" aria-hidden="true" />
          <p className="text-[15px] font-medium text-navy">{title}</p>
        </div>

        {detail ? (
          <p className="mt-2.5 font-serif text-sm leading-relaxed text-ink-dim">{detail}</p>
        ) : null}

        {steps?.length ? (
          <ol className="mt-3.5 space-y-1.5 border-t border-sky pt-3.5">
            {steps.map((step) => (
              <li key={step} className="flex items-start gap-2 font-serif text-xs leading-relaxed text-ink-dim">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-teal" aria-hidden="true" />
                {step}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-4 flex items-baseline justify-between border-t border-sky pt-3">
          <span className="text-2xs uppercase text-ink-faint">Elapsed</span>
          <span aria-live="polite" className="font-mono text-sm tabular-nums text-navy">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        </div>

        {seconds >= 20 ? (
          <p className="mt-2.5 font-serif text-xs leading-relaxed text-ink-faint">
            Still going. Each milestone is a separate transaction, and a testnet block can
            take a few seconds — a full run of three is normally under a minute.
          </p>
        ) : null}
      </div>
    </div>
  );
}
