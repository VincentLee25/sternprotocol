import { Check, Scale, Undo2 } from "lucide-react";
import { lifecycleStep } from "../lib/escrowState.js";

const MAIN_STEPS = [
  { key: "Pending", label: "Funds locked", detail: "Importer deposit held by the contract" },
  { key: "Verified", label: "Oracle verified", detail: "All three milestones verified on-chain" },
  { key: "Completed", label: "Settled", detail: "Funds to exporter · e-BL to importer" }
];

export default function Timeline({ state }) {
  const isDisputed = state === "Disputed";
  const isRefunded = state === "Refunded";
  const activeIndex = lifecycleStep(state);

  function stepStatus(index) {
    if (isDisputed || isRefunded) return index === 0 ? "done" : "off";
    if (index < activeIndex) return "done";
    if (index === activeIndex) return "current";
    return "off";
  }

  return (
    <ol className="relative">
      {MAIN_STEPS.map((step, index) => {
        const status = stepStatus(index);
        const last = index === MAIN_STEPS.length - 1;

        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                aria-hidden="true"
                className={`absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px ${
                  status === "done" ? "bg-state-attested/50" : "bg-sky"
                }`}
              />
            ) : null}
            <span
              className={`relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-2xs ${
                status === "done"
                  ? "border-state-attested bg-state-attested text-beige"
                  : status === "current"
                    // text-beige, not text-white: `beige` is --rgb-page, so it
                    // flips to onyx in dark mode. White on the dark theme's
                    // lighter ochre fill is only 2.4:1.
                    ? "border-state-pending bg-state-pending text-beige"
                    : "border-sky bg-surface text-ink-faint"
              }`}
            >
              {status === "done" ? <Check size={12} aria-hidden="true" /> : index + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-medium ${
                  status === "off" ? "text-ink-faint" : "text-navy"
                }`}
              >
                {step.label}
              </p>
              <p className="font-serif text-xs text-ink-dim">{step.detail}</p>
            </div>
          </li>
        );
      })}

      {isDisputed ? (
        <li className="mt-1 flex items-center gap-2 rounded-panel bg-state-pending/10 px-3 py-2.5 font-serif text-sm text-state-pending">
          <Scale size={13} aria-hidden="true" className="shrink-0" />
          Disputed: funds frozen until a 2-of-3 party vote resolves it
        </li>
      ) : null}
      {isRefunded ? (
        <li className="mt-1 flex items-center gap-2 rounded-panel bg-sky/40 px-3 py-2.5 font-serif text-sm text-ink-dim">
          <Undo2 size={13} aria-hidden="true" className="shrink-0" />
          Refunded: escrow value returned to the importer
        </li>
      ) : null}
    </ol>
  );
}
