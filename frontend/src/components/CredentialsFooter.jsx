import { ArrowUpRight } from "lucide-react";

// --- TEAM PHOTOS ------------------------------------------------------------
// Drop the files in src/assets/, then uncomment the matching import and set
// `photo` on that person. Anyone without a photo keeps the dashed placeholder,
// so the block reads correctly while it is half filled.
//
// Format: square JPG or WebP, 400×400 or larger, under ~200 KB each. Vite
// fingerprints and inlines the URL at build time, which is why these are
// imports rather than a "/assets/..." string — a plain path would 404 in the
// production build.
//
// import photoContracts from "../assets/team-contracts.jpg";
// import photoGateway from "../assets/team-gateway.jpg";
// import photoFrontend from "../assets/team-frontend.jpg";
// import photoTrade from "../assets/team-trade.jpg";

// Fill `name` before any public deploy. An empty name keeps the slot visibly
// blank rather than letting a half-filled team block pass as real credentials.
const TEAM = [
  { role: "Smart contracts", name: "", photo: null, credential: "Solidity, Hardhat, OpenZeppelin. Owns SternEscrow and IDRTDemo." },
  { role: "Oracle gateway", name: "", photo: null, credential: "Node and Express. Owns the automated gate and the verifier relay." },
  { role: "Frontend and design", name: "", photo: null, credential: "React, Vite, Tailwind. Owns the workspace and this site." },
  { role: "Trade and compliance", name: "", photo: null, credential: "Export documentation, PEB and CEISA workflow, surveyor liaison." }
];

// The warning only makes sense while the slots are actually empty.
const teamIncomplete = TEAM.some((person) => !person.name);

const NAV = [
  { id: "instrument", label: "Instrument" },
  { id: "settlement", label: "Settlement" },
  { id: "oracles", label: "Oracle" }
];

export default function CredentialsFooter({ onNavigate, onEnter }) {
  // Pinned dark. Without chrome-dark, `onyx` resolves to --rgb-page (beige in
  // light mode) while the type still expects a dark ground — the footer
  // rendered as navy-at-35% on beige, i.e. invisible.
  return (
    <footer className="chrome-dark border-t border-alabaster/10 bg-onyx text-alabaster">
      <div className="mx-auto max-w-[1180px] px-6 lg:px-14">
        {/* Team */}
        <div className="border-b border-alabaster/10 py-12 lg:py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-2xs uppercase tracking-macro text-teal">
                Who is behind this
              </p>
              <h2 className="mt-3 text-[26px] font-medium tracking-display lg:text-[32px]">
                Professional credentials
              </h2>
            </div>
            {teamIncomplete ? (
              <p className="max-w-[46ch] rounded-panel bg-state-pending/10 px-4 py-2.5 text-2xs uppercase leading-relaxed text-state-pending">
                Placeholder profiles. Fill the name slots before any public deploy.
              </p>
            ) : null}
          </div>

          <div className="grid gap-px overflow-hidden rounded-doc bg-alabaster/10 sm:grid-cols-2 lg:grid-cols-4">
            {TEAM.map((person) => (
              <div key={person.role} className="flex flex-col gap-3 bg-onyx p-6">
                {/* object-cover so a portrait that is not square crops rather
                    than squashing the face. */}
                {person.photo ? (
                  <img
                    src={person.photo}
                    alt={person.name || person.role}
                    width="44"
                    height="44"
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-alabaster/35 text-sm text-alabaster/60"
                  >
                    ?
                  </span>
                )}
                <div>
                  {person.name ? (
                    <p className="text-[15px] font-medium text-alabaster">{person.name}</p>
                  ) : (
                    <p className="text-sm text-alabaster/60">[ full name ]</p>
                  )}
                  <p className="mt-1.5 text-[15px] font-medium text-alabaster">{person.role}</p>
                </div>
                <p className="mt-auto font-serif text-[14px] leading-relaxed text-alabaster/90">
                  {person.credential}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Base line */}
        <div className="flex flex-wrap items-center justify-between gap-6 py-8">
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <span className="text-[15px] font-semibold tracking-[0.14em]">STERN</span>
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="cursor-pointer text-sm text-alabaster/90 transition-colors duration-150 hover:text-alabaster"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onEnter}
              className="flex cursor-pointer items-center gap-1 text-sm text-teal transition-colors duration-150 hover:text-alabaster"
            >
              Open workspace
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          </div>
          <p className="text-2xs uppercase text-alabaster/90">
            Testnet only &nbsp;·&nbsp; not a licensed payment service
          </p>
        </div>
      </div>
    </footer>
  );
}
