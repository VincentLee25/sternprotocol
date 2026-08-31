import MarketingShell, { PageHeader, Section, DarkTermRow } from "../components/MarketingShell.jsx";

// Sourced from docs/01_CONTRACT_SPEC.md §2, §5.2, §6, §8 and
// docs/04_DISPUTE_BOND_COST_STRUCTURE.md §1, §2. Trust assumptions are quoted, not softened.

const VERIFIERS = [
  {
    role: "ROLE_QUALITY_AUDITOR",
    who: "Origin surveyor",
    example: "Sucofindo",
    milestone: "Inspected",
    feed: "VGM, port gate-in",
    why: "Already the party an Indonesian exporter pays for pre-shipment inspection. STERN gives that certificate an on-chain consequence."
  },
  {
    role: "ROLE_LOGISTICS",
    who: "Shipping line or forwarder",
    example: "Carrier of record",
    milestone: "Shipped",
    feed: "AIS, vessel departure",
    why: "The carrier already issues the bill of lading. Here that issuance is checked against a satellite feed before it counts."
  },
  {
    role: "ROLE_CUSTOMS",
    who: "Customs broker",
    example: "Destination surveyor",
    milestone: "ArrivedCleared",
    feed: "CEISA, PEB status",
    why: "Customs approval is already the gate that releases goods. STERN makes it the gate that releases money too."
  }
];

const LIFECYCLE = [
  { n: "01", t: "Post a bond", d: "An institution stakes once, after the role is granted. Not per escrow." },
  { n: "02", t: "Receive the role", d: "Granted per institution wallet by the admin multisig, never per shipment." },
  { n: "03", t: "Submit proofs", d: "Only for its own milestone, and only when the automated gate already agrees." },
  { n: "04", t: "Face the window", d: "Six hours in which either counterparty can raise a dispute against that proof." },
  { n: "05", t: "Get slashed, or not", d: "If the arbiter finds the proof untrue, half the bond goes. Three times and the role is revoked." }
];

const ASSUMPTIONS = [
  {
    t: "The automated gate is validated off-chain",
    d: "The oracle gateway checks feed data and then relays the proof. The contract does not read the feed itself. This was a deliberate Phase 0 choice for delivery speed, recorded in the spec as a known trust assumption, with on-chain feeds such as Chainlink Functions on the roadmap."
  },
  {
    t: "Verifier wallets are plain EOAs",
    d: "Institutional verifiers sign with externally owned accounts managed by the backend, not smart accounts in a browser. That keeps the relay simple and keeps institutions off a consumer wallet flow they would not adopt."
  },
  {
    t: "Role grants need a multisig",
    d: "DEFAULT_ADMIN_ROLE is specified as a 2-of-3 Safe, not a single key. Until that Safe exists, whoever holds the admin key can add a verifier, and that is a real exposure, not a theoretical one."
  },
  {
    t: "One institution, many escrows",
    d: "Roles are granted per wallet, so a slashed verifier affects every shipment it has ever signed for. The three-strike auto-revoke exists precisely because that blast radius is wide."
  }
];

export default function Oracles({ onNavigate, onEnter }) {
  return (
    <MarketingShell current="oracles" onNavigate={onNavigate} onEnter={onEnter}>
      <PageHeader
        eyebrow="Oracles"
        title="Institutions with something to lose."
        lede="An oracle that cannot be punished is just an opinion with extra steps. Every verifier in STERN posts a bond before it can sign anything, and that bond is what an importer is actually relying on."
      />

      <Section
        eyebrow="Who signs what"
        title="Three roles, three milestones, no overlap."
        intro="None of these are new intermediaries. Each one is a party the trade already pays. What changes is that their signature now moves money instead of just accompanying it."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {VERIFIERS.map((v) => (
            <div key={v.role} className="flex flex-col rounded-doc border border-alabaster/10 p-6">
              <p className="font-mono text-2xs text-teal-light">{v.role}</p>
              <h3 className="mt-3 text-[20px] font-medium tracking-[-0.02em]">{v.who}</h3>
              <p className="mt-3 font-serif text-[15px] leading-relaxed text-alabaster/[0.7]">
                {v.why}
              </p>
              <div className="mt-5 border-t border-alabaster/10 pt-1">
                <DarkTermRow label="Example holder" value={v.example} />
                <DarkTermRow label="Signs milestone" value={v.milestone} />
                <DarkTermRow label="Checked against" value={v.feed} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Bond lifecycle"
        title="What a verifier goes through."
        intro="The stake comes first. An institution cannot submit a single proof until it has money at risk."
      >
        <div className="grid gap-px overflow-hidden rounded-doc bg-alabaster/10 sm:grid-cols-2 lg:grid-cols-5">
          {LIFECYCLE.map((step) => (
            <div key={step.n} className="bg-onyx p-5">
              <p className="font-mono text-2xs text-teal-light">{step.n}</p>
              <h3 className="mt-2.5 text-[16px] font-medium">{step.t}</h3>
              <p className="mt-2 font-serif text-[14px] leading-relaxed text-alabaster/[0.68]">
                {step.d}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Slashing"
        title="Where a dishonest verifier's money goes."
        intro="Slashing is not a fine paid to the protocol. Most of it is compensation, and it goes to the party that carried the risk of the false claim."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="rounded-doc border border-alabaster/10 p-6">
            <p className="font-mono text-2xs uppercase text-alabaster/60">Posted verifier bond</p>

            <div className="mt-4 flex h-12 overflow-hidden rounded-panel">
              <div className="flex w-1/2 items-center justify-center bg-state-disputed/25 font-mono text-2xs uppercase text-state-disputed-light">
                slashed 50%
              </div>
              <div className="flex w-1/2 items-center justify-center bg-alabaster/[0.07] font-mono text-2xs uppercase text-alabaster/65">
                stays staked
              </div>
            </div>

            {/* connector: shows row two is a split OF the slashed half, not a second bar */}
            <div className="flex" aria-hidden="true">
              <div className="w-1/2 px-[12%]">
                <div className="h-3 border-x border-b border-alabaster/35" />
              </div>
              <div className="w-1/2" />
            </div>

            <div className="flex gap-1.5">
              <div className="flex w-1/2 gap-1.5">
                <div className="flex h-14 w-[70%] flex-col items-center justify-center rounded-panel bg-state-attested/20 text-state-attested-light">
                  <span className="font-mono text-[15px] font-medium leading-none">70%</span>
                  <span className="mt-1 font-mono text-[8.5px] uppercase tracking-micro">injured party</span>
                </div>
                <div className="flex h-14 w-[30%] flex-col items-center justify-center rounded-panel bg-teal/25 text-[#8FC0D2]">
                  <span className="font-mono text-[15px] font-medium leading-none">30%</span>
                  <span className="mt-1 font-mono text-[8.5px] uppercase tracking-micro">treasury</span>
                </div>
              </div>
              <div className="w-1/2" aria-hidden="true" />
            </div>

            <p className="mt-3 font-mono text-2xs uppercase text-alabaster/60">
              Split of the slashed half only
            </p>

            <p className="mt-5 font-serif text-[15px] leading-relaxed text-alabaster/[0.7]">
              The importer is the injured party in every milestone case, because the importer is the
              one whose funds sat locked on the strength of a claim that turned out to be false.
            </p>
            <p className="mt-4 font-serif text-[15px] leading-relaxed text-alabaster/[0.7]">
              The other half stays staked. One wrong call does not remove an institution from the
              register, because a surveyor who is occasionally wrong is still more useful than no
              surveyor. It takes three before the role is revoked automatically.
            </p>
          </div>

          <div className="rounded-doc border border-alabaster/10 p-6">
            <p className="font-mono text-2xs uppercase text-alabaster/60">Parameters</p>
            <div className="mt-4 border-t border-alabaster/10 pt-1">
              <DarkTermRow label="Dispute bond" value="3% of value" />
              <DarkTermRow label="Verifier slash" value="50% of bond" tone="warn" />
              <DarkTermRow label="To injured party" value="70%" tone="ok" />
              <DarkTermRow label="To treasury" value="30%" />
              <DarkTermRow label="Frivolous dispute" value="100% to exporter" />
              <DarkTermRow label="Auto-revoke at" value="3 slashes" tone="warn" />
            </div>
            <p className="mt-5 font-serif text-[15px] leading-relaxed text-alabaster/[0.7]">
              A frivolous dispute never slashes a verifier. The two pools are separate on purpose:
              punishing a buyer for objecting badly is not the same thing as punishing an institution
              for signing falsely.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Trust assumptions"
        title="What you are still trusting."
        intro="Four of them, stated plainly. A protocol that claims to have removed all trust has usually just moved it somewhere you cannot see."
      >
        <div className="grid gap-px overflow-hidden rounded-doc bg-alabaster/10 sm:grid-cols-2">
          {ASSUMPTIONS.map((a) => (
            <div key={a.t} className="bg-onyx p-6">
              <h3 className="text-[17px] font-medium">{a.t}</h3>
              <p className="mt-2.5 font-serif text-[15px] leading-relaxed text-alabaster/[0.68]">
                {a.d}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </MarketingShell>
  );
}
