import { Loader2 } from "lucide-react";

/*
 * The STERN control set. Every page reaches for these rather than re-deriving a
 * button or a card out of utility classes, which is what let nine screens drift
 * into nine slightly different treatments.
 *
 * Rules encoded here, from DESIGN.md:
 *   - controls are 12px radius and never capsule-shaped (pills are for status
 *     and filters only)
 *   - button and nav labels never wrap
 *   - primary actions are maritime teal, and the label states actor and effect
 *   - a disabled control keeps its shape, not its weight
 */

/* --------------------------------- button --------------------------------- */

const BUTTON_TONES = {
  // Solid teal. White on #176B73 is 6.2:1, and that fill is constant across
  // themes so the label never has to be re-tuned.
  primary: "bg-teal-solid text-white shadow-card hover:brightness-110",
  // White surface with a slate hairline. The workhorse.
  secondary: "border border-sky bg-surface text-navy hover:border-teal/50 hover:bg-surface-soft",
  // No chrome until hover. For tertiary actions inside dense panels.
  ghost: "text-ink-dim hover:bg-surface-soft hover:text-navy",
  // Reserved for actions that move money against the pressing party.
  danger: "bg-state-disputed text-white hover:brightness-110",
  // Consequential but not destructive: opening a dispute, starting a timelock.
  caution:
    "border border-state-pending/45 bg-state-pending/10 text-state-pending hover:bg-state-pending/[0.18]",
  positive:
    "border border-state-attested/45 bg-state-attested/10 text-state-attested hover:bg-state-attested/[0.18]"
};

const BUTTON_SIZES = {
  sm: "h-9 gap-1.5 px-3.5 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-sm"
};

export function Button({
  tone = "secondary",
  size = "md",
  busy = false,
  icon: Icon,
  className = "",
  children,
  type = "button",
  disabled,
  full,
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-panel font-medium transition-[background-color,border-color,color,filter,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 ${
        BUTTON_SIZES[size]
      } ${BUTTON_TONES[tone]} ${full ? "w-full" : ""} ${className}`}
      {...rest}
    >
      {busy ? (
        <Loader2 size={15} className="shrink-0 animate-spin" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={15} className="shrink-0" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

/* ---------------------------------- card ---------------------------------- */

/**
 * The one operational surface. DESIGN.md is explicit that not every section
 * belongs in a card, so this is deliberately plain: no gradient, no nested
 * border, one shadow step.
 */
export function Card({ as: Tag = "section", className = "", inset = true, children, ...rest }) {
  return (
    <Tag
      className={`rounded-doc bg-surface shadow-card ${inset ? "p-5 lg:p-6" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Card heading. Sentence case by default: DESIGN.md retires the wall of
 * uppercase micro-labels the older screens put above every section.
 */
export function CardTitle({ children, hint, action, className = "" }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${className}`}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug text-navy">{children}</h2>
        {hint ? <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------ status + tags ------------------------------ */

const TAG_TONES = {
  neutral: "border-sky bg-surface-soft text-ink-dim",
  teal: "border-teal/35 bg-teal/10 text-teal",
  attested: "border-state-attested/35 bg-state-attested/10 text-state-attested",
  pending: "border-state-pending/35 bg-state-pending/10 text-state-pending",
  disputed: "border-state-disputed/35 bg-state-disputed/10 text-state-disputed"
};

/**
 * Compact metadata chip. Capsule shape is allowed here (DESIGN.md permits it
 * for status and filters), and the dot is decoration on top of a text label,
 * never the only carrier of meaning.
 */
export function Tag({
  tone = "neutral",
  dot = false,
  icon: Icon,
  children,
  className = "",
  ...rest
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-2xs font-medium ${TAG_TONES[tone]} ${className}`}
      {...rest}
    >
      {dot ? (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      ) : null}
      {Icon ? <Icon size={11} className="shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* -------------------------------- feedback -------------------------------- */

const NOTICE_TONES = {
  info: "border-sky bg-surface-soft text-ink-dim",
  teal: "border-teal/35 bg-teal/[0.07] text-navy",
  attested: "border-state-attested/40 bg-state-attested/[0.08] text-state-attested",
  pending: "border-state-pending/40 bg-state-pending/[0.08] text-state-pending",
  disputed: "border-state-disputed/40 bg-state-disputed/[0.08] text-state-disputed"
};

/**
 * Inline feedback. DESIGN.md: a material error is shown next to the operation
 * that failed rather than hidden behind a toast, so this is the shape every
 * failure in the app renders into.
 */
export function Notice({ tone = "info", icon: Icon, children, className = "", ...rest }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-panel border px-3.5 py-2.5 text-[13px] leading-relaxed ${NOTICE_TONES[tone]} ${className}`}
      {...rest}
    >
      {Icon ? <Icon size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Loading, empty and error states share one silhouette so lists never jump. */
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      {Icon ? (
        <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-soft text-ink-faint">
          <Icon size={18} aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-[15px] font-semibold text-navy">{title}</p>
      {children ? (
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-dim">{children}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- metrics -------------------------------- */

/**
 * One KPI. Flat by design: DESIGN.md warns against turning every number into a
 * separate colourful card, so the tone only ever tints the value, never the box.
 */
export function Metric({ label, value, unit, tone = "default", children, className = "" }) {
  const valueTone =
    tone === "disputed"
      ? "text-state-disputed"
      : tone === "pending"
        ? "text-state-pending"
        : tone === "attested"
          ? "text-state-attested"
          : "text-navy";

  return (
    <div className={`rounded-doc bg-surface p-5 shadow-card ${className}`}>
      <p className="text-[13px] font-medium text-ink-dim">{label}</p>
      <p className={`mt-2 text-[28px] font-bold leading-none tabular-nums ${valueTone}`}>
        {value}
        {unit ? (
          <span className="ml-1.5 align-baseline text-[13px] font-medium text-ink-faint">
            {unit}
          </span>
        ) : null}
      </p>
      {children}
    </div>
  );
}

/* --------------------------------- tables --------------------------------- */

export function Th({ children, className = "", ...rest }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap py-3 pr-4 text-2xs font-semibold uppercase tracking-micro text-ink-faint ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

/** Label/value row with a dot leader. The document idiom, kept from v1. */
export function TermRow({ label, value, tone, truncate, className = "" }) {
  return (
    <div className={`flex items-baseline gap-2.5 py-2.5 ${className}`}>
      <span className="whitespace-nowrap text-[14px] text-ink-dim">{label}</span>
      <span className="leader h-1 min-w-[16px] flex-1 -translate-y-[3px]" aria-hidden="true" />
      <span
        className={`text-[13px] font-medium tabular-nums ${
          truncate ? "min-w-0 truncate" : "whitespace-nowrap"
        } ${
          tone === "pending"
            ? "text-state-pending"
            : tone === "attested"
              ? "text-state-attested"
              : tone === "disputed"
                ? "text-state-disputed"
                : "text-navy"
        }`}
        title={truncate && typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
