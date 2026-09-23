import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function Disclosure({ title, summary, children, className = "", contentClassName = "", plain = false }) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`${plain ? "border-t border-sky/60" : "rounded-panel border border-sky/70 bg-white"} ${className}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm font-medium text-navy transition-colors hover:bg-sky/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal ${plain ? "py-2" : "px-4 py-3"}`}>
        <span className="min-w-0"><span className="block">{title}</span>{summary ? <span className="mt-0.5 block text-xs font-normal text-ink-dim">{summary}</span> : null}</span>
        <ChevronDown size={16} className={`shrink-0 text-teal transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? <div className={`stern-disclosure-content ${plain ? "pb-2" : "border-t border-sky/60 px-4 py-4"} ${contentClassName}`}>{children}</div> : null}
    </section>
  );
}
