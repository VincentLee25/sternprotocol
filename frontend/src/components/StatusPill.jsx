import { STATE_TONE, STATE_LABEL } from "../lib/escrowState.js";

// Semantic tier only. Teal is the accent and is never a status; these hues
// exist purely to encode escrow state.
//
// Status remains readable without colour because every indicator includes its
// written state. The small semantic dot keeps table rows scannable without
// turning every state into a decorative capsule.
const TONE_STYLES = {
  pending: { cls: "text-state-pending", dot: "bg-state-pending" },
  attested: { cls: "text-state-attested", dot: "bg-state-attested" },
  disputed: { cls: "text-state-disputed", dot: "bg-state-disputed" },
  neutral: { cls: "text-ink-dim", dot: "bg-ink-faint" }
};

export default function StatusPill({ state, size = "md", children }) {
  const { cls, dot } = TONE_STYLES[STATE_TONE[state]] || TONE_STYLES.pending;
  const label = children || STATE_LABEL[state] || state;

  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${cls} ${
        size === "sm" ? "text-2xs" : "text-[12.5px]"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}
