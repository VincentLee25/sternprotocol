import { STATE_TONE, STATE_LABEL } from "../lib/escrowState.js";

// Semantic tier only. Teal is the accent and is never a status; these hues
// exist purely to encode escrow state. See docs/07_DESIGN_SYSTEM.md §2.3.
const TONE_STYLES = {
  pending: "text-state-pending bg-state-pending/10",
  attested: "text-state-attested bg-state-attested/10",
  disputed: "text-state-disputed bg-state-disputed/10",
  neutral: "text-ink-dim bg-sky/40"
};

export default function StatusPill({ state, children }) {
  const style = TONE_STYLES[STATE_TONE[state]] || TONE_STYLES.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-2xs font-medium uppercase ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children || STATE_LABEL[state] || state}
    </span>
  );
}
