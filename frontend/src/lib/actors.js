// Address formatting.
//
// This file used to export an ACTORS table backing a sidebar role switcher.
// That model is gone: a session is one wallet, and which party you are is a
// fact about each escrow rather than something you pick. See lib/roles.js.
export function shortAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
