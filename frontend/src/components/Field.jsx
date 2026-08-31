export default function Field({ label, htmlFor, required, error, hint, children }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-mono text-2xs font-medium uppercase text-ink-faint"
      >
        {label}
        {required ? <span className="ml-1 text-state-disputed">*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-2 font-serif text-xs text-state-disputed">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 font-serif text-xs text-ink-dim">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass = (hasError) =>
  `w-full rounded-panel border bg-white px-3.5 py-2.5 text-sm text-navy placeholder:text-ink-faint transition-colors duration-150 focus:outline-none ${
    hasError
      ? "border-state-disputed/60 focus:border-state-disputed"
      : "border-sky hover:border-teal/40 focus:border-teal"
  }`;
