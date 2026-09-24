import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function Disclosure({ title, summary, children, className = "", contentClassName = "", plain = false, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) contentRef.current.inert = !open;
  }, [open]);

  return (
    <section className={`${plain ? "" : "rounded-panel bg-surface-soft/55"} ${className}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm font-medium text-navy transition-colors duration-200 hover:bg-sky/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal ${plain ? "rounded-lg py-3 px-2" : "rounded-panel px-4 py-3"}`}>
        <span className="min-w-0"><span className="block">{title}</span>{summary ? <span className="mt-0.5 block text-xs font-normal text-ink-dim">{summary}</span> : null}</span>
        <ChevronDown size={16} className={`shrink-0 text-teal transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div ref={contentRef} className={`stern-disclosure-reveal ${open ? "is-open" : ""}`} aria-hidden={!open}>
        <div className="stern-disclosure-inner">
          <div className={`stern-disclosure-content ${plain ? "px-2 pb-4" : "px-4 pb-4 pt-1"} ${contentClassName}`}>{children}</div>
        </div>
      </div>
    </section>
  );
}
