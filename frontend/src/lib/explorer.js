// Links out to the block explorer, so a claim made in this UI can be checked
// against the chain by someone who does not trust this UI.
//
// That is the whole point. A page that says "milestone verified" is a sentence
// this app wrote about itself; a transaction hash on PolygonScan is a fact
// anybody can read without us. For a product whose entire argument is "you do
// not have to take our word for it", showing a hash as plain grey text and
// stopping there gives away the argument.
import { CHAIN_ID } from "./particle.js";
import { sourceIsLive } from "./escrowSource.js";

const EXPLORERS = {
  80002: "https://amoy.polygonscan.com",
  137: "https://polygonscan.com"
};

export const EXPLORER_BASE = EXPLORERS[CHAIN_ID] || "";
export const explorerName = CHAIN_ID === 137 ? "PolygonScan" : "PolygonScan (Amoy)";

const CHAIN_NAMES = { 80002: "Polygon Amoy", 137: "Polygon", 31337: "Local chain" };
export const CHAIN_LABEL = `${CHAIN_NAMES[CHAIN_ID] || "Chain"} · ${CHAIN_ID}`;

// A 32-byte hash, with or without the 0x. The mock ledger mints plausible
// look-alikes, so shape alone is never enough — see linkable() below.
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Whether a hash may be turned into a link.
 *
 * Two guards, and both matter. Without a configured explorer there is nowhere
 * to point. And on the mock path every hash comes from fakeTxHash(): correctly
 * shaped, entirely invented. Linking one would send a visitor to an explorer
 * page reading "transaction not found" — which is a worse outcome than no link,
 * because it looks like the chain lost our transaction rather than like there
 * never was one.
 */
export function linkable(hash) {
  return Boolean(EXPLORER_BASE && sourceIsLive && typeof hash === "string" && TX_HASH.test(hash));
}

export function txUrl(hash) {
  return linkable(hash) ? `${EXPLORER_BASE}/tx/${hash}` : null;
}

export function addressUrl(address) {
  if (!EXPLORER_BASE || typeof address !== "string" || !ADDRESS.test(address)) return null;
  return `${EXPLORER_BASE}/address/${address}`;
}

/**
 * A committed milestone proof carries no transaction hash — getMilestoneProof
 * returns the verifier, the CID, the block and the deadline, and nothing else.
 * The block is what is left to point at, and it is enough: the proof is in it,
 * and the verifier address beside it is the wallet that put it there.
 */
export function blockUrl(blockNumber) {
  if (!EXPLORER_BASE || !sourceIsLive || blockNumber == null) return null;
  const n = Number(blockNumber);
  return Number.isFinite(n) && n >= 0 ? `${EXPLORER_BASE}/block/${n}` : null;
}

/** 0x1234…cdef — long enough to compare against the explorer, short enough to sit inline. */
export function shortHash(hash, lead = 10, tail = 8) {
  if (typeof hash !== "string" || hash.length <= lead + tail + 1) return hash || "";
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}
