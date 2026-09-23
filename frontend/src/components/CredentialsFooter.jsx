import sternLogo from "../assets/stern-logo.png";

const links = [
  { id: "instrument", label: "Instrument" },
  { id: "settlement", label: "Settlement" },
  { id: "oracles", label: "Verification" }
];

// Only real destinations belong in the public footer. The old placeholder-team
// block looked unfinished and implied profiles that do not exist yet.
export default function CredentialsFooter({ onNavigate, onEnter }) {
  return (
    <footer className="mt-16 border-t border-sky/70 bg-surface">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-10 sm:grid-cols-[1.3fr_1fr] lg:px-14">
        <div>
          <img src={sternLogo} alt="STERN" className="h-7 w-auto brightness-0" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-dim">
            A simpler way to keep trade checks, documents, and settlement in one clear view.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm font-medium text-ink-dim sm:justify-end">
          {links.map((link) => (
            <button key={link.id} type="button" onClick={() => onNavigate(link.id)} className="cursor-pointer transition-colors duration-200 hover:text-teal">
              {link.label}
            </button>
          ))}
          <button type="button" onClick={onEnter} className="cursor-pointer transition-colors duration-200 hover:text-teal">Access workspace</button>
        </div>
      </div>
      <div className="border-t border-sky/70 px-6 py-4 text-center text-xs text-ink-faint lg:px-14">
        STERN Protocol demo · Testnet environment · Not a payment service
      </div>
    </footer>
  );
}
