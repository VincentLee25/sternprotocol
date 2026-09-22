import { CircleCheck, CircleDot, CircleSlash, Clock } from "lucide-react";
import { STATE_TONE, STATE_LABEL } from "../lib/escrowState.js";

// Semantic tier only. Teal is the accent and is never a status; these hues
// exist purely to encode escrow state.
//
// DESIGN.md: status must not rest on colour alone. Every pill therefore carries
// three signals - a written label, a tone, and a glyph whose shape differs per
// tone (tick / clock / slash) so the states remain distinguishable in
// greyscale and to a red-green colour-blind reader.
const TONE_STYLES = {
  pending: { cls: "border-state-pending/35 bg-state-pending/10 text-state-pending", Icon: Clock },
  attested: {
    cls: "border-state-attested/35 bg-state-attested/10 text-state-attested",
    Icon: CircleCheck
  },
  disputed: {
    cls: "border-state-disputed/35 bg-state-disputed/10 text-state-disputed",
    Icon: CircleSlash
  },
  neutral: { cls: "border-sky bg-surface-soft text-ink-dim", Icon: CircleDot }
};

export default function StatusPill({ state, size = "md", children }) {
  const { cls, Icon } = TONE_STYLES[STATE_TONE[state]] || TONE_STYLES.pending;
  const label = children || STATE_LABEL[state] || state;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold ${cls} ${
        size === "sm" ? "px-2.5 py-0.5 text-2xs" : "px-3 py-1 text-[13px]"
      }`}
    >
      <Icon size={size === "sm" ? 12 : 14} className="shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
