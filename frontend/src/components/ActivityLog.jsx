import { Loader2 } from "lucide-react";
import { AddressLink } from "./TxLink.jsx";
import TxLink from "./TxLink.jsx";
import { useLanguage } from "../lib/language.jsx";

// Live rows name the actor by address; the mock names it by role. A full
// 42-character address rendered inline pushed this panel 88px past its own
// width, and the section clips with overflow-hidden — so the log simply
// appeared cut off, with no scrollbar to explain why.
const IS_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function TruncationNote({ before }) {
  const { t } = useLanguage();
  if (before == null) return null;
  return (
    <p className="mt-2.5 border-t border-sky/50 pt-2.5 font-serif text-xs leading-relaxed text-ink-faint">
      {t("Earlier events are not shown: this RPC keeps only recent history and has discarded blocks before #{block}. Point", { block: before })} <code className="font-mono">RPC_URL</code> {t("at a node that retains more to see the full log.")}
    </p>
  );
}

/**
 * "Updating activity…", inline.
 *
 * The event history is a log scan over a wide block range on the gateway, so it
 * is fetched after the escrow's state rather than with it. That means this
 * panel can legitimately be a few seconds behind the rest of the page, and it
 * has to say so HERE — a page-level overlay for a side panel is what made a
 * refresh feel like a history rescan, because it was waiting for one.
 */
function UpdatingNote() {
  const { t } = useLanguage();
  return (
    <p className="mt-2.5 flex items-center gap-1.5 text-2xs text-ink-faint">
      <Loader2 size={11} className="animate-spin text-teal" aria-hidden="true" />
      {t("Updating activity…")}
    </p>
  );
}

export default function ActivityLog({ entries, error, truncatedBefore, pending = false }) {
  const { t, language } = useLanguage();
  // "Nothing happened" and "the read failed" look identical to a reader and are
  // completely different to whoever has to fix it.
  if (error) {
    return (
      <p role="alert" className="font-serif text-sm leading-relaxed text-state-disputed">
        {t("The activity log could not be read from the chain.")}
        <span className="mt-1 block text-xs text-ink-dim">{error}</span>
      </p>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <>
        {/* Two different sentences, because they mean opposite things: the log
            is still being read, or it was read and is empty. Saying "nothing
            recorded yet" while a scan is in flight is simply wrong. */}
        <p className="font-serif text-sm text-ink-dim">
          {t(pending ? "Reading the event log from the chain…" : "No activity recorded yet.")}
        </p>
        {pending ? null : <TruncationNote before={truncatedBefore} />}
      </>
    );
  }

  return (
    <>
    <ol className="space-y-0">
      {[...entries].reverse().map((entry, index) => {
        const actorIsAddress = IS_ADDRESS.test(String(entry.actor || ""));
        return (
          <li
            key={`${entry.transactionHash || entry.time}-${index}`}
            className="flex gap-3 border-b border-sky/50 py-2.5 text-sm last:border-b-0"
          >
            <span className="w-14 shrink-0 pt-0.5 text-2xs text-ink-faint">
              {new Date(entry.time).toLocaleTimeString(language === "id" ? "id-ID" : "en-US", { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-navy">{t(entry.event)}</span>
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
    {pending ? <UpdatingNote /> : <TruncationNote before={truncatedBefore} />}
    </>
  );
}
