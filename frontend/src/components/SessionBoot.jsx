import PortPlate from "./PortPlate.jsx";

// Shown while Particle restores a session or derives the Smart Account address.
//
// It deliberately reuses Login's exact geometry — same split, same scrim, same
// left-aligned max-w-sm column at the same vertical position — so moving from
// the sign-in button to this screen reads as one panel updating rather than the
// page emptying out and a spinner appearing somewhere else.
export default function SessionBoot({ label, detail }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-onyx lg:block">
        <div className="absolute inset-0">
          <PortPlate />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-onyx/95 via-onyx/70 to-transparent"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="text-lg font-semibold tracking-[0.14em] text-alabaster">STERN</span>
          <p className="font-mono text-2xs uppercase text-alabaster/60">
            Polygon Amoy testnet &middot; Fase 0 preview
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-beige p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-lg font-semibold tracking-[0.14em] text-navy">STERN</span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal border-t-transparent"
              aria-hidden="true"
            />
            <h2 className="text-[22px] font-medium tracking-display text-navy" role="status">
              {label}
            </h2>
          </div>

          {detail ? (
            <p className="mt-1.5 font-serif text-sm leading-relaxed text-ink-dim">{detail}</p>
          ) : null}

          <p className="mt-6 font-mono text-2xs uppercase text-ink-faint">
            Powered by Particle Network
          </p>
        </div>
      </div>
    </div>
  );
}
