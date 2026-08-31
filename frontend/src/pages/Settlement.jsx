import MarketingShell, { PageHeader, Section, DarkTermRow } from "../components/MarketingShell.jsx";
import StateMachine from "../components/StateMachine.jsx";

// Sourced from docs/01_CONTRACT_SPEC.md §1, §5, §6 and docs/04_DISPUTE_BOND_COST_STRUCTURE.md §3.

const MILESTONES = [
  {
    n: "01",
    state: "Inspected",
    role: "ROLE_QUALITY_AUDITOR",
    held: "Origin surveyor, for example Sucofindo",
    feed: "VGM feed, port gate-in",
    gate: "vgm_match == true && gate_in_status == \"confirmed\"",
    proof: "Inspection certificate, SHA-256 pinned to IPFS",
    d: "The container is weighed at the gate and the declared mass has to agree with the verified mass. A surveyor then signs that the goods match the contract."
  },
  {
    n: "02",
    state: "Shipped",
    role: "ROLE_LOGISTICS",
    held: "Shipping line or freight forwarder",
    feed: "AIS feed, vessel position",
    gate: "departure_status == \"departed\"",
    proof: "Bill of lading, SHA-256 pinned to IPFS",
    d: "The vessel has to have actually left the port of loading. A satellite position feed says so before the carrier's own proof is accepted."
  },
  {
    n: "03",
    state: "ArrivedCleared",
    role: "ROLE_CUSTOMS",
    held: "Customs broker or destination surveyor",
    feed: "CEISA feed, PEB status",
    gate: "customs_status == \"approved\"",
    proof: "Customs clearance, SHA-256 pinned to IPFS",
    d: "Indonesian customs has to show the export declaration approved. Only then can the broker submit the final milestone."
  }
];

const TIMING = [
  ["Challenge window, per milestone", "6 hours"],
  ["Milestones before release", "3"],
  ["Final timelock", "24 hours"],
  ["Fastest realistic settlement", "~42 hours"],
  ["Global deadline", "set per escrow"],
  ["Confirmation depth", "gateway enforced"]
];

const COSTS = [
  ["createEscrow, with approve", "$0.05", "Sponsored paymaster"],
  ["submitMilestoneProof, x3", "$0.09", "Backend, verifier EOA"],
  ["raiseDispute", "$0.05", "Sponsored paymaster"],
  ["resolveDispute", "$0.03", "Arbiter EOA"],
  ["releasePayment", "$0.05", "Sponsored paymaster, permissionless"]
];

const OUTCOMES = [
  {
    t: "The dispute is upheld",
    d: "The bond comes back to whoever raised it. If a verifier is found to have signed something untrue, half their posted bond is slashed. Seventy percent of that goes to the injured party, thirty to the treasury.",
    tone: "ok"
  },
  {
    t: "The dispute is frivolous",
    d: "The bond is forfeited in full to the exporter, because the exporter did nothing wrong and absorbed the delay. No verifier is slashed in this case.",
    tone: "warn"
  },
  {
    t: "Nobody does anything",
    d: "Once the global deadline passes, the importer can claim a refund unilaterally. This is the safety valve, and it does not need anyone's cooperation.",
    tone: "fail"
  }
];

const TONE_RING = {
  ok: "border-state-attested/40",
  warn: "border-state-pending/40",
  fail: "border-state-disputed/40"
};

export default function Settlement({ onNavigate, onEnter }) {
  return (
    <MarketingShell current="settlement" onNavigate={onNavigate} onEnter={onEnter}>
      <PageHeader
        eyebrow="How settlement works"
        title="Three milestones, two gates each."
        lede="Money does not move because someone approved a document. It moves because a machine-readable feed and a bonded institution independently said the same thing, three times, and nobody objected inside the window."
      />

      <Section
        eyebrow="State machine"
        title="The whole lifecycle, on one rail."
        intro="Every escrow walks left to right. The only way off the rail is a dispute, and the only way back onto it is the arbiter."
      >
        <div className="overflow-x-auto rounded-doc border border-alabaster/10 p-6">
          <StateMachine />
        </div>
      </Section>

      <Section
        eyebrow="The two gates"
        title="A feed alone is not enough. A signature alone is not enough."
        intro="Each transition needs an automated gate and a role gate to pass together. The feed cannot be talked into lying, and the institution cannot act on data that does not exist."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {MILESTONES.map((m) => (
            <div key={m.n} className="flex flex-col rounded-doc border border-alabaster/10 p-6">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xs text-teal-light">{m.n}</span>
                <h3 className="text-[20px] font-medium tracking-[-0.02em]">{m.state}</h3>
              </div>
              <p className="mt-3 font-serif text-[15px] leading-relaxed text-alabaster/[0.7]">
                {m.d}
              </p>
              <div className="mt-5 border-t border-alabaster/10 pt-1">
                <DarkTermRow label="Role" value={m.role} />
                <DarkTermRow label="Held by" value={m.held} />
                <DarkTermRow label="Automated gate" value={m.feed} />
                <DarkTermRow label="Role gate" value={m.proof} />
              </div>
              <pre className="mt-4 overflow-x-auto rounded-panel bg-alabaster/[0.05] px-3.5 py-3 font-mono text-2xs leading-relaxed text-state-attested-light">
                {m.gate}
              </pre>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Timing and cost" title="What the delay is actually made of.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-doc border border-alabaster/10 p-6">
            <p className="font-mono text-2xs uppercase text-alabaster/60">Windows</p>
            <div className="mt-4 border-t border-alabaster/10 pt-1">
              {TIMING.map(([label, value]) => (
                <DarkTermRow key={label} label={label} value={value} />
              ))}
            </div>
            <p className="mt-4 font-serif text-[15px] leading-relaxed text-alabaster/[0.68]">
              Three six-hour challenge windows plus a twenty-four hour timelock is roughly forty-two
              hours of deliberate waiting. That is the cost of letting anyone object before money is
              irreversible, and it is still the fastest part of the whole trade.
            </p>
          </div>

          <div className="overflow-hidden rounded-doc border border-alabaster/10">
            <div className="border-b border-alabaster/10 px-6 py-4 font-mono text-2xs uppercase text-alabaster/60">
              Gas per operation, Polygon
            </div>
            <div className="divide-y divide-alabaster/10">
              {COSTS.map(([op, cost, payer]) => (
                <div key={op} className="flex flex-wrap items-baseline gap-x-4 px-6 py-3.5">
                  <span className="min-w-[190px] flex-1 font-mono text-xs text-alabaster">{op}</span>
                  <span className="font-mono text-xs tabular-nums text-state-attested-light">{cost}</span>
                  <span className="w-full font-serif text-[14px] text-alabaster/[0.66] sm:w-auto sm:min-w-[190px] sm:text-right">
                    {payer}
                  </span>
                </div>
              ))}
            </div>
            <p className="border-t border-alabaster/10 px-6 py-4 font-serif text-[14px] leading-relaxed text-alabaster/[0.66]">
              The importer never pays gas directly. A sponsored paymaster covers their operations, so
              an exporter with no crypto at all can still be a counterparty.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="When it goes wrong"
        title="Three ways this ends badly, and what each one costs."
        intro="Raising a dispute is not free. It locks 3% of the contract value as a bond, which is enough to make a bad-faith objection expensive without pricing a genuinely wronged exporter out of using it."
      >
        <div className="grid gap-5 lg:grid-cols-3">
          {OUTCOMES.map((o) => (
            <div key={o.t} className={`rounded-doc border p-6 ${TONE_RING[o.tone]}`}>
              <h3 className="text-[18px] font-medium tracking-[-0.015em]">{o.t}</h3>
              <p className="mt-3 font-serif text-[15px] leading-relaxed text-alabaster/[0.72]">{o.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 font-serif text-[15px] leading-relaxed text-alabaster/[0.66]">
          The 3% figure sits between the roughly 10% that BANI and Kleros both land on and the 2%
          the contract originally defaulted to. Ten percent prices out the small exporters this is
          built for. Two percent is cheap enough that a large buyer can treat a dispute as a
          convenient way to delay paying.
        </p>
      </Section>
    </MarketingShell>
  );
}
