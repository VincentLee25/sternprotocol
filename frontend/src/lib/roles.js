// Your role is a fact about the escrow, not a setting.
//
// The sidebar used to carry a role switcher, which was a demo device: it let one
// session pretend to be the importer, the exporter, the arbiter or any verifier.
// Real sessions are one wallet, and that wallet either is or is not a party to a
// given escrow. So the role is derived per escrow by comparing addresses, and
// the same wallet can legitimately be the importer on one and the exporter on
// another.
//
// Verifiers and the arbiter never sign in here at all: they are institutional
// EOAs (docs/03_PARTICLE_INTEGRATION.md §2) and live on the ops surface.

export const ROLE = {
  IMPORTER: "importer",
  EXPORTER: "exporter",
  ARBITER: "arbiter",
  OBSERVER: "observer"
};

export const ROLE_LABEL = {
  [ROLE.IMPORTER]: "Importer",
  [ROLE.EXPORTER]: "Exporter",
  [ROLE.ARBITER]: "Arbiter",
  [ROLE.OBSERVER]: "Observer"
};

const eq = (a, b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());

/**
 * Which party the signed-in wallet is on this escrow.
 * Returns OBSERVER when it is none of them — the escrow is readable but no
 * action belongs to this wallet.
 */
export function roleOnEscrow(escrow, address) {
  if (!escrow || !address) return ROLE.OBSERVER;
  if (eq(escrow.importer, address)) return ROLE.IMPORTER;
  if (eq(escrow.exporter, address)) return ROLE.EXPORTER;
  if (eq(escrow.arbiter, address)) return ROLE.ARBITER;
  return ROLE.OBSERVER;
}

/**
 * What this wallet may do on this escrow, given its role and the escrow's state.
 * Mirrors the contract's own requires so the UI does not offer an action that
 * would revert — the contract remains the authority either way.
 */
export function permissionsFor(escrow, address) {
  const role = roleOnEscrow(escrow, address);
  const state = escrow?.state;

  return {
    role,
    label: ROLE_LABEL[role],
    isParty: role !== ROLE.OBSERVER,
    // Only the importer's funds are at stake, so only the importer refunds.
    canClaimRefund: role === ROLE.IMPORTER && ["Created", "Inspected", "Shipped"].includes(state),
    // Release is permissionless in the contract once the timelock clears, but
    // showing it to a stranger is noise.
    canRelease: role !== ROLE.OBSERVER && state === "TimelockActive",
    canInitiateTimelock: role !== ROLE.OBSERVER && state === "ArrivedCleared",
    // Either side can contest a milestone they believe was signed falsely.
    canRaiseDispute: [ROLE.IMPORTER, ROLE.EXPORTER].includes(role) && !escrow?.disputeOpen,
    // Resolution belongs to the arbiter, and the arbiter works from the ops
    // surface rather than this one.
    canResolve: false
  };
}

/** Escrows this wallet is a party to, for the list view. */
export function partitionByRole(escrows = [], address) {
  const mine = [];
  const others = [];
  for (const escrow of escrows) {
    (roleOnEscrow(escrow, address) === ROLE.OBSERVER ? others : mine).push(escrow);
  }
  return { mine, others };
}
