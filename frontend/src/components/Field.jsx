export default function Field({ label, htmlFor, required, error, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-navy">
        {label}
        {required ? (
          <span className="ml-1 text-state-disputed" title="Required">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] leading-relaxed text-state-disputed">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">{hint}</p>
      ) : null}
    </div>
  );
}

// 40px control, 12px radius, white ground, slate hairline, teal focus ring -
// the form field DESIGN.md specifies. Focus never uses an ambient glow.
export const inputClass = (hasError) =>
  `w-full rounded-panel border bg-surface px-3.5 py-2.5 text-sm text-navy placeholder:text-ink-faint transition-colors duration-150 focus:outline-none ${
    hasError
      ? "border-state-disputed/60 focus:border-state-disputed"
      : "border-sky hover:border-teal/40 focus:border-teal"
  }`;
