// One vocabulary for escrow state, shared by StatusPill, Timeline and the pages.
// The contract enum is the source of truth; the legacy 5-label list that
// Overview used disagreed with it (state 1 read "Verified" there and
// "Inspected" in the detail page), so both now read from here.
export const CHAIN_STATES = [
  "Created",
  "Inspected",
  "Shipped",
  "ArrivedCleared",
  "TimelockActive",
  "Disputed",
  "Completed",
  "Refunded"
];

export function stateFromIndex(index) {
  return CHAIN_STATES[Number(index)] || "Created";
}

// Semantic tone per state. Only the three semantic hues plus neutral;
// teal is the accent and is never a status. See docs/07_DESIGN_SYSTEM.md §2.3.
export const STATE_TONE = {
  Created: "pending",
  Pending: "pending",
  Inspected: "pending",
  Shipped: "pending",
  TimelockActive: "pending",
  ArrivedCleared: "attested",
  Verified: "attested",
  Completed: "attested",
  Refunded: "neutral",
  Disputed: "disputed"
};

// Human labels: the contract enum names are not what a trader reads.
export const STATE_LABEL = {
  Created: "Funds locked",
  Inspected: "Inspected",
  Shipped: "In transit",
  ArrivedCleared: "Cleared",
  TimelockActive: "Timelock",
  Completed: "Settled",
  Refunded: "Refunded",
  Disputed: "Disputed",
  Pending: "Pending",
  Verified: "Verified"
};

// Where each state sits on the three-step lifecycle rail.
const STEP_OF = {
  Created: 0,
  Pending: 0,
  Inspected: 0,
  Shipped: 0,
  ArrivedCleared: 1,
  Verified: 1,
  TimelockActive: 1,
  Completed: 2
};

export function lifecycleStep(state) {
  return STEP_OF[state] ?? -1;
}

export const isTerminal = (state) => state === "Completed" || state === "Refunded";

// Display id: chain ids are small integers and read well zero-padded;
// mock ids are timestamps and should be shown as-is.
export function formatEscrowId(id) {
  const s = String(id);
  return /^\d{1,4}$/.test(s) ? s.padStart(4, "0") : s;
}
