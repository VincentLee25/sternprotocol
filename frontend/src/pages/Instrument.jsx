import MarketingShell, { PageHeader, Section, DarkTermRow } from "../components/MarketingShell.jsx";

// Content is drawn from docs/01_CONTRACT_SPEC.md and docs/04_DISPUTE_BOND_COST_STRUCTURE.md.
// Anything not traceable to those files is marked in the "What this is not" block.

const COMPARISON = [
  {
    k: "Who verifies",
    lc: "An issuing bank and an advising bank, by reading paper.",
    stern: "Three role-holding institutions, each signing one milestone on-chain."
  },
  {
    k: "What is actually checked",
    lc: "That the document set matches the wording of the credit.",
    stern: "An independent data feed AND a signed institutional proof. Both, or the milestone does not pass."
  },
  {
    k: "Where the money sits",
    lc: "With the buyer's bank, against a credit line the buyer had to qualify for.",
    stern: "In the SternEscrow contract, in IDRT-demo, reachable by neither party."
  },
  {
    k: "What triggers payment",
    lc: "The bank accepting the documents as compliant.",
    stern: "Three milestones, three challenge windows, then one timelock expiring."
  },
  {
    k: "Time after shipment",
    lc: "Driven by courier speed and manual review.",
    stern: "A 6-hour challenge window per milestone, then a 24-hour timelock."
  },
  {
    k: "Cost basis",
    lc: "A percentage of contract value, plus correspondent bank fees.",
    stern: "Gas per operation. Roughly $0.03 to $0.05 on Polygon."
  },
  {
    k: "If a verifier lies",
    lc: "You argue with a bank, then you go to arbitration.",
    stern: "Their posted bond is slashed 50%. Of that, 70% goes to the injured party."
  },
  {
    k: "If nothing happens at all",
    lc: "The credit expires on its own terms.",
    stern: "Past globalDeadline the importer can claim a refund unilaterally."
  }
];

const ARTICLES = [
  {
    n: "Article I",
    t: "Parties and terms",
    d: "Fixed at creation and never mutable afterwards.",
    rows: [
      ["Importer", "address"],
      ["Exporter", "address"],
      ["Arbiter", "address"],
      ["Contract value", "IDRT-demo, 2 dp"],
      ["Commodity", "string"],
      ["Container reference", "string"],
      ["Document CID", "SHA-256 on IPFS"],
      ["Global deadline", "unix seconds"]
    ]
  },
  {
    n: "Article II",
    t: "Conditions precedent",
    d: "Each needs an automated gate and a role gate to pass together.",
    rows: [
      ["Inspected", "VGM feed"],
      ["Shipped", "AIS feed"],
      ["Arrived and cleared", "CEISA feed"],
      ["Challenge window", "6 hours each"],
      ["Timelock", "24 hours"]
    ]
  },
  {
    n: "Article III",
    t: "Remedies",
    d: "What either side can reach for when the shipment does not behave.",
    rows: [
      ["Dispute bond", "3% of value"],
      ["Verifier slash", "50% of bond"],
      ["Injured party share", "70%"],
      ["Treasury share", "30%"],
      ["Frivolous dispute", "bond to exporter"],
      ["Auto-revoke", "after 3 slashes"]
    ]
  }
];

const LIMITS = [
  {
    t: "It runs on a testnet",
    d: "Polygon Amoy, chain 80002. IDRT-demo is a demo ERC-20 with no redeemable value. Nothing here moves real money yet."
  },
  {
    t: "The automated gate is trusted, not trustless",
    d: "Feed data is validated in the oracle gateway, not inside the contract. That is a deliberate Phase 0 tradeoff, recorded in the spec, with on-chain feeds on the roadmap."
  },
  {
    t: "The arbiter is a person",
    d: "Dispute resolution ends in a human decision with a written reasoning CID. STERN shortens the path to that decision. It does not remove it."
  },
  {
    t: "It is not a licensed payment service",
    d: "STERN is settlement infrastructure for a documented trade, not a money transmitter, and it does not replace an issuing bank's credit function."
  }
];

export default function Instrument({ onNavigate, onEnter }) {
  return (
    <MarketingShell current="instrument" onNavigate={onNavigate} onEnter={onEnter}>
      <PageHeader
        eyebrow="The instrument"
        title="A letter of credit, minus the letter."
        lede="A letter of credit exists for one reason: an exporter in Aceh and a buyer in Hamburg have no way to verify each other, so both rent a bank's willingness to vouch. STERN keeps the structure of that instrument and replaces the vouching with evidence."
      />

      <Section
        eyebrow="Side by side"
        title="The same obligations, settled differently."
        intro="Every row below is a thing a letter of credit already does. None of them disappear under STERN. What changes is who performs them, and how long it takes."
      >
        <div className="overflow-hidden rounded-doc border border-alabaster/10">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)] gap-px bg-alabaster/10 lg:grid">
            <div className="bg-onyx px-5 py-3 font-mono text-2xs uppercase text-alabaster/60">
              Dimension
            </div>
            <div className="bg-onyx px-5 py-3 font-mono text-2xs uppercase text-alabaster/60">
              Letter of credit
            </div>
            <div className="bg-onyx px-5 py-3 font-mono text-2xs uppercase text-teal-light">STERN</div>
          </div>
          <div className="grid gap-px bg-alabaster/10">
            {COMPARISON.map((row) => (
              <div
                key={row.k}
                className="grid gap-px bg-alabaster/10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)]"
              >
                <div className="bg-onyx px-5 py-4 text-[15px] font-medium text-alabaster">
                  {row.k}
                </div>
                <div className="bg-onyx px-5 py-4 font-serif text-[15px] leading-relaxed text-alabaster/[0.68]">
                  {row.lc}
                </div>
                <div className="bg-onyx px-5 py-4 font-serif text-[15px] leading-relaxed text-alabaster/85">
                  {row.stern}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Anatomy"
        title="What an escrow actually contains."
        intro="The workspace renders every escrow as a deed, because that is structurally what it is. These are the fields the contract stores."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {ARTICLES.map((article) => (
            <div key={article.n} className="rounded-doc border border-alabaster/10 p-6">
              <p className="font-mono text-2xs uppercase text-teal-light">{article.n}</p>
              <h3 className="mt-3 text-[20px] font-medium tracking-[-0.02em]">{article.t}</h3>
              <p className="mt-2 font-serif text-[15px] leading-relaxed text-alabaster/[0.68]">
                {article.d}
              </p>
              <div className="mt-4 border-t border-alabaster/10 pt-1">
                {article.rows.map(([label, value]) => (
                  <DarkTermRow key={label} label={label} value={value} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Honest limits"
        title="What this is not."
        intro="Four things worth saying out loud, because a settlement instrument that oversells itself is not one anybody should use."
      >
        <div className="grid gap-px overflow-hidden rounded-doc bg-alabaster/10 sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <div key={limit.t} className="bg-onyx p-6">
              <h3 className="text-[17px] font-medium text-alabaster">{limit.t}</h3>
              <p className="mt-2.5 font-serif text-[15px] leading-relaxed text-alabaster/[0.68]">
                {limit.d}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </MarketingShell>
  );
}
