import { ArrowRight } from "lucide-react";
import PortPlate from "../components/PortPlate.jsx";
import MarketingShell from "../components/MarketingShell.jsx";

const TERMS = [
  { k: "T+0", v: "Settlement on the last milestone, not on a courier" },
  { k: "3", v: "Milestones, each gated by a feed and a signature" },
  { k: "50%", v: "Of a verifier's bond, slashed if they sign falsely" },
  { k: "0", v: "Issuing banks, correspondent fees or paper originals" }
];

const STEPS = [
  {
    n: "01",
    t: "Lock",
    d: "The importer deposits into the escrow and pins the e-BL content hash. Neither party can reach the funds."
  },
  {
    n: "02",
    t: "Attest",
    d: "Three institutions verify weight, departure and customs. Each needs its feed and its signature to agree."
  },
  {
    n: "03",
    t: "Release",
    d: "The contract pays the exporter and transfers the e-BL. No human in the path."
  }
];

export default function Landing({ onNavigate, onEnter }) {
  return (
    <MarketingShell current="landing" onNavigate={onNavigate} onEnter={onEnter}>
      <section>
        <div className="mx-auto max-w-[1180px] px-6 lg:px-14">

          <div className="grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,344px)] lg:gap-16 lg:py-[92px]">
            <div>
              <span className="rise-in mb-6 block text-2xs uppercase tracking-macro text-teal">
                Smart escrow for export&ndash;import settlement
              </span>
              <h1 style={{ animationDelay: "70ms" }} className="rise-in text-[46px] font-medium leading-[0.98] tracking-display text-alabaster sm:text-[64px] lg:text-[76px]">
                Paid the moment
                <br />
                it leaves <span className="text-[#7FA9BC]">the port.</span>
              </h1>
              <p style={{ animationDelay: "140ms" }} className="rise-in mt-7 max-w-[50ch] font-serif text-[19px] font-light leading-[1.62] text-alabaster/90">
                An Aceh coffee cooperative waits weeks for a letter of credit to clear. STERN locks
                the buyer&rsquo;s funds on-chain and releases them the instant weight, departure
                and customs all check out.
              </p>
              <div style={{ animationDelay: "210ms" }} className="rise-in mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onEnter}
                  className="flex cursor-pointer items-center gap-2 rounded-full bg-teal px-6 py-3 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-[#4E7F91]"
                >
                  Open workspace
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("settlement")}
                  className="cursor-pointer rounded-full border border-alabaster/25 px-6 py-3 text-[13px] font-medium text-alabaster transition-colors duration-150 hover:border-alabaster/50"
                >
                  See how settlement works
                </button>
              </div>
            </div>

            <div style={{ animationDelay: "280ms" }} className="rise-in relative aspect-[3/4] overflow-hidden rounded-doc shadow-plate">
              <PortPlate />
              <div style={{ animationDelay: "620ms" }} className="rise-in chrome-dark absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-panel border border-alabaster/15 bg-onyx/60 px-4 py-3 backdrop-blur-md">
                <div className="min-w-0">
                  <div className="truncate text-2xs uppercase text-alabaster/90">
                    Escrow &#8470;0004 &middot; MSKU 418 337 2
                  </div>
                  <div className="mt-0.5 text-[15px] font-medium text-alabaster">
                    Belawan &rarr; Hamburg
                  </div>
                </div>
                <div
                  className="seal grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full"
                  style={{ "--pct": "0.667turn" }}
                  role="img"
                  aria-label="Two of three milestones verified"
                >
                  <span className="grid h-[29px] w-[29px] place-items-center rounded-full bg-[#131313] text-[8.5px] text-alabaster">
                    2/3
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid border-t border-alabaster/25 pb-14 sm:grid-cols-2 lg:grid-cols-4 lg:pb-[90px]">
            {TERMS.map((term) => (
              <div key={term.k} className="border-r border-alabaster/25 px-6 pt-8 first:pl-0 last:border-r-0 last:pr-0 lg:px-8">
                <div className="text-[42px] font-medium leading-none tracking-display text-alabaster">
                  {term.k}
                </div>
                <p className="mt-3 max-w-[23ch] font-serif text-[14.5px] leading-[1.5] text-alabaster/90">
                  {term.v}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-teal py-14 text-white lg:py-[86px]">
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-6 lg:grid-cols-2 lg:gap-[70px] lg:px-14">
          <div>
            <h2 className="text-balance text-[32px] font-medium leading-[1.04] tracking-display lg:text-[50px]">
              The instrument is 400 years old. The delay is the product.
            </h2>
            <p className="mt-5 font-serif text-[18px] font-light leading-[1.6] text-white/80">
              A letter of credit exists because two strangers cannot verify each other. STERN
              replaces the verifier, not the trust: bonded oracles, slashed if they lie.
            </p>
          </div>
          <div className="flex flex-col">
            {STEPS.map((step, index) => (
              <div
                key={step.n}
                className={`flex gap-5 border-t border-white/25 py-5 ${
                  index === STEPS.length - 1 ? "border-b" : ""
                }`}
              >
                <div className="w-[30px] shrink-0 pt-1 text-[11px] tracking-micro text-white/60">
                  {step.n}
                </div>
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.012em]">{step.t}</div>
                  <p className="mt-1 font-serif text-[15px] leading-[1.5] text-white/80">{step.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
