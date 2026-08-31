// The escrow state machine exactly as docs/01_CONTRACT_SPEC.md §1 defines it.
// Happy path on the rail; dispute drawn as the one branch that leaves it.
const STATES = [
  { t: "Created", s: "funds locked" },
  { t: "Inspected", s: "VGM gate" },
  { t: "Shipped", s: "AIS gate" },
  { t: "ArrivedCleared", s: "CEISA gate" },
  { t: "TimelockActive", s: "24h countdown" },
  { t: "Completed", s: "exporter paid" }
];

const EDGES = ["inspection gate", "shipping gate", "customs gate", "challenge 6h", "timelock 24h"];

const W = 140;
const STEP = 208;
const X0 = 6;
const Y = 44;
const H = 52;

export default function StateMachine() {
  return (
    <svg
      viewBox="0 0 1192 300"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Escrow state machine: Created, Inspected, Shipped, ArrivedCleared, TimelockActive, Completed, with a dispute branch resolving to Completed or Refunded"
      className="block h-auto w-full min-w-[820px]"
    >
      <defs>
        <marker id="sm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill="#8FA3B4" />
        </marker>
      </defs>

      {/* edges along the rail */}
      {EDGES.map((label, i) => {
        const from = X0 + i * STEP + W;
        const to = X0 + (i + 1) * STEP;
        return (
          <g key={label}>
            <line
              x1={from + 4}
              y1={Y + H / 2}
              x2={to - 8}
              y2={Y + H / 2}
              stroke="#8FA3B4"
              strokeWidth="1.5"
              markerEnd="url(#sm-arrow)"
            />
            <text
              x={(from + to) / 2}
              y={Y - 12}
              textAnchor="middle"
              fill="#93A6B6"
              fontFamily="JetBrains Mono, monospace"
              fontSize="9"
              letterSpacing="0.08em"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* the six happy-path states */}
      {STATES.map((state, i) => {
        const x = X0 + i * STEP;
        const last = i === STATES.length - 1;
        return (
          <g key={state.t}>
            <rect
              x={x}
              y={Y}
              width={W}
              height={H}
              rx="10"
              fill={last ? "rgba(63,122,99,0.14)" : "#141A22"}
              stroke={last ? "#3F7A63" : "rgba(229,228,226,0.2)"}
              strokeWidth="1.2"
            />
            <text
              x={x + W / 2}
              y={Y + 22}
              textAnchor="middle"
              fill={last ? "#63A98A" : "#E5E4E2"}
              fontFamily="Figtree, sans-serif"
              fontSize="13.5"
              fontWeight="500"
            >
              {state.t}
            </text>
            <text
              x={x + W / 2}
              y={Y + 38}
              textAnchor="middle"
              fill="#93A6B6"
              fontFamily="JetBrains Mono, monospace"
              fontSize="8.5"
              letterSpacing="0.08em"
            >
              {state.s}
            </text>
          </g>
        );
      })}

      {/* dispute branch leaves the rail */}
      <line x1="507" y1="100" x2="507" y2="198" stroke="#B8802E" strokeWidth="1.5" strokeDasharray="4 4" markerEnd="url(#sm-arrow)" />
      <text x="523" y="140" fill="#B8802E" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
        raiseDispute()
      </text>
      <text x="523" y="156" fill="#93A6B6" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
        any state before Completed
      </text>

      <rect x="422" y="206" width="170" height="52" rx="10" fill="rgba(184,128,46,0.12)" stroke="#B8802E" strokeWidth="1.2" />
      <text x="507" y="228" textAnchor="middle" fill="#D6A657" fontFamily="Figtree, sans-serif" fontSize="13.5" fontWeight="500">
        Disputed
      </text>
      <text x="507" y="244" textAnchor="middle" fill="#93A6B6" fontFamily="JetBrains Mono, monospace" fontSize="8.5" letterSpacing="0.08em">
        bond 3% locked
      </text>

      {/* arbiter fork */}
      <path d="M592 232 H622 V213 H652" fill="none" stroke="#8FA3B4" strokeWidth="1.5" markerEnd="url(#sm-arrow)" />
      <path d="M592 232 H622 V257 H652" fill="none" stroke="#8FA3B4" strokeWidth="1.5" markerEnd="url(#sm-arrow)" />
      <text x="640" y="188" fill="#93A6B6" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
        resolveDispute() &middot; arbiter decides
      </text>

      <rect x="660" y="196" width="190" height="34" rx="8" fill="rgba(63,122,99,0.14)" stroke="#3F7A63" strokeWidth="1.2" />
      <text x="755" y="218" textAnchor="middle" fill="#63A98A" fontFamily="Figtree, sans-serif" fontSize="13" fontWeight="500">
        Completed
      </text>

      <rect x="660" y="240" width="190" height="34" rx="8" fill="rgba(168,68,60,0.12)" stroke="#A8443C" strokeWidth="1.2" />
      <text x="755" y="262" textAnchor="middle" fill="#C9736B" fontFamily="Figtree, sans-serif" fontSize="13" fontWeight="500">
        Refunded
      </text>

      <text x="872" y="222" fill="#93A6B6" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
        globalDeadline passed also
      </text>
      <text x="872" y="238" fill="#93A6B6" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing="0.08em">
        refunds, importer only
      </text>
    </svg>
  );
}
