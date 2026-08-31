// Metadata for the three sequential milestones defined in
// docs/01_CONTRACT_SPEC.md §4 — Created -> Inspected -> Shipped ->
// ArrivedCleared -> TimelockActive -> Completed.
export const MILESTONES = [
  {
    key: "inspected",
    index: 1,
    label: "Inspected",
    role: "ROLE_QUALITY_AUDITOR",
    institution: "Sucofindo",
    gate: "VGM match + gate-in confirmed",
    fromState: "Created",
    toState: "Inspected"
  },
  {
    key: "shipped",
    index: 2,
    label: "Shipped",
    role: "ROLE_LOGISTICS",
    institution: "Shipping line",
    gate: "AIS departure confirmed",
    fromState: "Inspected",
    toState: "Shipped"
  },
  {
    key: "arrivedCleared",
    index: 3,
    label: "Arrived & cleared",
    role: "ROLE_CUSTOMS",
    institution: "Customs broker",
    gate: "CEISA customs approved",
    fromState: "Shipped",
    toState: "ArrivedCleared"
  }
];

export const STATE_ORDER = [
  "Created",
  "Inspected",
  "Shipped",
  "ArrivedCleared",
  "TimelockActive",
  "Completed"
];

export const STATE_LABELS = {
  Created: "Created",
  Inspected: "Inspected",
  Shipped: "Shipped",
  ArrivedCleared: "Arrived & cleared",
  TimelockActive: "Timelock active",
  Completed: "Completed",
  Disputed: "Disputed",
  Refunded: "Refunded"
};

export function milestoneForState(state) {
  return MILESTONES.find((m) => m.toState === state) || null;
}

export function nextMilestone(state) {
  return MILESTONES.find((m) => m.fromState === state) || null;
}
