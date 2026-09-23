import { useEffect, useState } from "react";
import { CircleDot, FileCheck2, Gavel, PlusCircle, ShieldAlert, Timer, Undo2, Wallet } from "lucide-react";
import { listActivity } from "../lib/mockRegistry.js";
import { sourceIsLive } from "../lib/escrowSource.js";
import TxLink from "./TxLink.jsx";

// The gateway and the mock ledger do not use identical type names for the same
// event — `refunded` against `refund_claimed` — so both spellings are listed
// rather than leaving one of them to fall through to the generic dot.
const ICONS = {
  escrow_created: PlusCircle,
  milestone_verified: FileCheck2,
  timelock_started: Timer,
  dispute_raised: Gavel,
  dispute_resolved: Gavel,
  verifier_slashed: ShieldAlert,
  payment_released: Wallet,
  refunded: Undo2,
  refund_claimed: Undo2
};

const TONES = {
  escrow_created: "text-teal bg-teal/10",
  milestone_verified: "text-state-attested bg-state-attested/10",
  timelock_started: "text-state-pending bg-state-pending/10",
  dispute_raised: "text-state-disputed bg-state-disputed/10",
  dispute_resolved: "text-state-pending bg-state-pending/10",
  verifier_slashed: "text-state-disputed bg-state-disputed/10",
  payment_released: "text-state-attested bg-state-attested/10",
  refunded: "text-state-pending bg-state-pending/10",
  refund_claimed: "text-state-pending bg-state-pending/10"
};

// Live rows name the actor by address; the mock names it by role. A raw 0x…
// address at full length pushes the timestamp off the row.
function actorLabel(actor) {
  return typeof actor === "string" && /^0x[0-9a-fA-F]{40}$/.test(actor)
    ? `${actor.slice(0, 6)}…${actor.slice(-4)}`
    : actor;
}

// "Today" / "Yesterday" / an actual date, so the rail reads as a diary
// rather than a wall of timestamps.
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Activity comes from the escrows the caller already loaded, because the
// gateway exposes events per escrow rather than as one global feed. Reading the
// mock feed while the list is live showed invented events beside a real (and
// possibly empty) registry — the worst of both.
export default function ActivityRail({ onOpen, escrows, compact = false }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (sourceIsLive) {
      const merged = (escrows || [])
        .flatMap((e) =>
          (e.activity || []).map((a) => ({
            ...a,
            escrowId: e.id,
            commodity: e.commodity
          }))
        )
        .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
        .slice(0, 20);
      setRows(merged);
      return;
    }

    let cancelled = false;
    listActivity({ limit: 20 })
      .then((res) => {
        if (!cancelled) setRows(res.activity);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [escrows]);

  // Any escrow failing its log read explains an empty feed better than silence.
  const readError = (escrows || []).find((e) => e.activityError)?.activityError || null;
  const pending = (escrows || []).some((e) => e.activityPending);

  const groups = rows.reduce((acc, row) => {
    const key = dayLabel(row.time);
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});

  return (
    <aside className="stern-workspace-card rounded-doc bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-sky px-5 py-3.5">
        <h2 className="text-2xs uppercase text-ink-faint">Activity</h2>
        <span className="text-2xs uppercase text-ink-faint">{rows.length}</span>
      </div>

      <div className={`${compact ? "max-h-[382px]" : "max-h-[560px]"} overflow-y-auto px-5 pb-5`}>
        {pending && rows.length === 0 ? (
          // The scan runs after the table renders, so this window really is
          // still filling. Saying "nothing has happened yet" during it is a
          // claim, and a wrong one.
          <p className="flex items-center gap-2 py-6 font-serif text-sm text-ink-dim">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-teal border-t-transparent" aria-hidden="true" />
            Reading the chain…
          </p>
        ) : readError && rows.length === 0 ? (
          <p role="alert" className="py-6 font-serif text-sm leading-relaxed text-state-disputed">
            The activity log could not be read from the chain.
            <span className="mt-1 block text-xs text-ink-dim">{readError}</span>
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 font-serif text-sm text-ink-dim">Nothing has happened yet.</p>
        ) : (
          Object.entries(groups).map(([day, entries]) => (
            <section key={day}>
              <h3 className="sticky top-0 bg-surface pb-2 pt-4 text-2xs uppercase text-ink-faint">
                {day}
              </h3>
              <ol className="space-y-3">
                {entries.map((entry, i) => {
                  const Icon = ICONS[entry.type] || CircleDot;
                  return (
                    // The explorer link sits OUTSIDE the button. An <a> nested
                    // inside a <button> is invalid HTML, and browsers resolve it
                    // by swallowing one of the two — usually the link.
                    <li key={`${entry.transactionHash || entry.time}-${i}`} className="rounded-panel transition-colors duration-150 hover:bg-beige">
                      <button
                        type="button"
                        onClick={() => onOpen?.(entry.escrowId)}
                        className="flex w-full cursor-pointer gap-3 p-2 pb-1 text-left"
                      >
                        <span
                          className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                            TONES[entry.type] || "bg-sky/40 text-ink-dim"
                          }`}
                        >
                          <Icon size={13} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] leading-snug text-navy">
                            {entry.text}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs uppercase text-ink-faint">
                            <span>{actorLabel(entry.actor)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {new Date(entry.time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </span>
                          </span>
                          <span className="mt-1.5 inline-block rounded-full bg-beige px-2 py-0.5 text-2xs uppercase text-teal">
                            &#8470;&thinsp;{entry.escrowId} · {entry.commodity}
                          </span>
                        </span>
                      </button>
                      {entry.transactionHash ? (
                        <span className="block pb-2 pl-[52px]">
                          <TxLink hash={entry.transactionHash} />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
