// Demo identities used by the sidebar's role switcher — kept in sync with
// the seeded escrow's parties/verifiers in mockRegistry.js so permission
// checks resolve correctly out of the box.
import { DEMO_PARTIES, VERIFIERS } from "./mockRegistry.js";

export const ACTORS = [
  { id: "importer", label: "Importer", org: "Hamburg Coffee Buyer GmbH", address: DEMO_PARTIES.importer },
  { id: "exporter", label: "Exporter", org: "UMKM Kopi Gayo, Aceh", address: DEMO_PARTIES.exporter },
  { id: "arbiter", label: "Arbiter", org: "Independent dispute arbiter", address: DEMO_PARTIES.arbiter },
  { id: "verifier-inspected", label: VERIFIERS[0].name, org: "Quality auditor", address: VERIFIERS[0].address, milestone: "inspected" },
  { id: "verifier-shipped", label: VERIFIERS[1].name, org: "Logistics / shipping line", address: VERIFIERS[1].address, milestone: "shipped" },
  { id: "verifier-arrivedCleared", label: VERIFIERS[2].name, org: "Customs broker", address: VERIFIERS[2].address, milestone: "arrivedCleared" }
];

export function actorById(id) {
  return ACTORS.find((actor) => actor.id === id) || ACTORS[0];
}

export function shortAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
