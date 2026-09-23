import { STATE_TONE, STATE_LABEL } from "../lib/escrowState.js";
import { useLanguage } from "../lib/language.jsx";

// Semantic tier only. Teal is the accent and is never a status; these hues
// exist purely to encode escrow state.
//
const TONE_STYLES = {
  pending: "text-state-pending",
  attested: "text-state-attested",
  disputed: "text-state-disputed",
  neutral: "text-ink-dim"
};

export default function StatusPill({ state, size = "md", children }) {
  const { t } = useLanguage();
  const cls = TONE_STYLES[STATE_TONE[state]] || TONE_STYLES.pending;
  const label = children || t(STATE_LABEL[state] || state);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap font-medium ${cls} ${
        size === "sm" ? "text-2xs" : "text-[12.5px]"
      }`}
    >
      {label}
    </span>
  );
}
