import { AddressLink } from "./TxLink.jsx";
import TxLink from "./TxLink.jsx";

// Live rows name the actor by address; the mock names it by role. A full
// 42-character address rendered inline pushed this panel 88px past its own
// width, and the section clips with overflow-hidden — so the log simply
// appeared cut off, with no scrollbar to explain why.
const IS_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function ActivityLog({ entries, error }) {
  // "Nothing happened" and "the read failed" look identical to a reader and are
  // completely different to whoever has to fix it.
  if (error) {
    return (
      <p role="alert" className="font-serif text-sm leading-relaxed text-state-disputed">
        The activity log could not be read from the chain.
        <span className="mt-1 block text-xs text-ink-dim">{error}</span>
      </p>
    );
  }
  if (!entries || entries.length === 0) {
    return <p className="font-serif text-sm text-ink-dim">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {[...entries].reverse().map((entry, index) => {
        const actorIsAddress = IS_ADDRESS.test(String(entry.actor || ""));
        return (
          <li
            key={`${entry.transactionHash || entry.time}-${index}`}
            className="flex gap-3 border-b border-sky/50 py-2.5 text-sm last:border-b-0"
          >
            <span className="w-14 shrink-0 pt-0.5 text-2xs text-ink-faint">
              {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-navy">{entry.event}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {actorIsAddress ? (
                  <AddressLink address={entry.actor} />
                ) : (
                  <span className="text-2xs capitalize text-teal">{entry.actor}</span>
                )}
                {entry.transactionHash ? <TxLink hash={entry.transactionHash} /> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
