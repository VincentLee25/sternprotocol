import CredentialsFooter from "./CredentialsFooter.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import sternLogo from "../assets/stern-logo.png";

const NAV = [
  { id: "instrument", label: "Instrument" },
  { id: "settlement", label: "Settlement" },
  { id: "oracles", label: "Oracle" }
];

export default function MarketingShell({ current, onNavigate, onEnter, children }) {
  return (
    <div className="min-h-full bg-onyx text-alabaster">
      <div className="mx-auto max-w-[1180px] px-6 lg:px-14">
        <nav className="flex items-center justify-between gap-6 border-b border-alabaster/10 py-5">
          <button
            type="button"
            onClick={() => onNavigate("landing")}
            className="cursor-pointer"
            aria-label="STERN home"
          >
            <img src={sternLogo} alt="STERN" className="h-6 w-auto invert dark:invert-0" />
          </button>
          <div className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={current === item.id ? "page" : undefined}
                className={`cursor-pointer rounded-full px-4 py-2 transition-colors duration-150 ${
                  current === item.id
                    ? "bg-teal/15 text-teal"
                    : "text-alabaster/80 hover:bg-alabaster/10 hover:text-alabaster"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={onEnter}
              className="cursor-pointer rounded-full bg-alabaster px-5 py-2.5 text-[13px] font-medium text-onyx transition-colors duration-150 hover:bg-white"
            >
              Open workspace
            </button>
          </div>
        </nav>
      </div>

      {children}

      <CredentialsFooter onNavigate={onNavigate} onEnter={onEnter} />
    </div>
  );
}

/* ---- shared page furniture, so the three content pages stay consistent ---- */

export function PageHeader({ eyebrow, title, lede }) {
  return (
    <header className="mx-auto max-w-[1180px] px-6 py-12 lg:px-14 lg:py-[76px]">
      <p className="text-2xs uppercase tracking-macro text-teal">{eyebrow}</p>
      <h1 className="mt-6 max-w-[18ch] text-balance text-[38px] font-medium leading-[1.04] tracking-display lg:text-[60px]">
        {title}
      </h1>
      <p className="mt-6 max-w-[62ch] font-serif text-[19px] font-light leading-[1.62] text-alabaster/90">
        {lede}
      </p>
    </header>
  );
}

export function Section({ eyebrow, title, intro, children, tone, wide }) {
  return (
    <section
      className={`border-t border-alabaster/10 ${tone === "teal" ? "bg-teal-solid text-white" : ""}`}
    >
      <div className="mx-auto max-w-[1180px] px-6 py-12 lg:px-14 lg:py-[72px]">
        {eyebrow ? (
          <p
            className={`text-2xs uppercase tracking-macro ${
              tone === "teal" ? "text-white/85" : "text-alabaster/90"
            }`}
          >
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <h2
            className={`mt-4 text-balance text-[28px] font-medium leading-[1.08] tracking-display lg:text-[40px] ${
              wide ? "max-w-[34ch]" : "max-w-[22ch]"
            }`}
          >
            {title}
          </h2>
        ) : null}
        {intro ? (
          <p
            className={`mt-5 max-w-[64ch] font-serif text-[17px] font-light leading-[1.6] ${
              tone === "teal" ? "text-white/90" : "text-alabaster/90"
            }`}
          >
            {intro}
          </p>
        ) : null}
        <div className={title || intro || eyebrow ? "mt-10" : ""}>{children}</div>
      </div>
    </section>
  );
}

// The dot-leader row from the app's instrument document, inverted for dark ground.
export function DarkTermRow({ label, value, tone }) {
  return (
    <div className="flex items-baseline gap-2.5 py-3">
      <span className="whitespace-nowrap font-serif text-[16px] text-alabaster/90">{label}</span>
      <span
        aria-hidden="true"
        className="h-1 min-w-[24px] flex-1 -translate-y-[3px] bg-[radial-gradient(circle,rgba(229,228,226,0.28)_1.1px,transparent_1.2px)] bg-[length:6px_4px] bg-left-bottom bg-repeat-x"
      />
      <span
        className={`min-w-0 text-right text-xs font-medium tabular-nums ${
          tone === "warn" ? "text-state-pending" : tone === "ok" ? "text-state-attested" : "text-alabaster"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
