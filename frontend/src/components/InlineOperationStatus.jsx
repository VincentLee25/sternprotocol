import { Loader2 } from "lucide-react";

export default function InlineOperationStatus({ children, className = "" }) {
  return (
    <div role="status" className={`flex items-center gap-2.5 rounded-lg border border-sky/70 bg-sky/20 px-3 py-2 text-xs text-navy ${className}`}>
      <Loader2 size={13} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
