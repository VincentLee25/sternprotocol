// Display identities for the oracle consortium (order matches the deploy
// script: Hardhat accounts #1, #4, #5). The contract only knows addresses;
// these names are the demo story for who runs each verifier.
export const CONSORTIUM = [
  { index: 0, name: "Sucofindo", descr: "PSI surveyor" },
  { index: 1, name: "SGS", descr: "Independent inspector" },
  { index: 2, name: "Port Authority", descr: "Port & customs data" }
];

export const ORACLE_QUORUM = 2;

export function defaultConsortium() {
  return CONSORTIUM.map((member) => ({
    ...member,
    bond: 1,
    slashes: 0,
    attested: false,
    slashed: false
  }));
}
