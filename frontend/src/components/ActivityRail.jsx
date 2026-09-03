import { useEffect, useState } from "react";
import { CircleDot, FileCheck2, Gavel, PlusCircle, Wallet } from "lucide-react";
import { listActivity } from "../lib/mockRegistry.js";
import { sourceIsLive } from "../lib/escrowSource.js";

const ICONS = {
  escrow_created: PlusCircle,
  milestone_verified: FileCheck2,
  dispute_raised: Gavel,
  payment_released: Wallet
};

const TONES = {
  escrow_created: "text-teal bg-teal/10",
  milestone_verified: "text-state-attested bg-state-attested/10",
  dispute_raised: "text-state-disputed bg-state-disputed/10",
  payment_released: "text-state-attested bg-state-attested/10"
};

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
export default function ActivityRail({ onOpen, escrows }) {
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

  const groups = rows.reduce((acc, row) => {
    const key = dayLabel(row.time);
    (acc[key] = acc[key] || []).push(row);
    return acc;
  }, {});

  return (
    <aside className="rounded-doc bg-surface shadow-card">
      <div className="flex items-center justify-between border-b border-sky px-5 py-3.5">
        <h2 className="text-2xs uppercase text-ink-faint">Activity</h2>
        <span className="text-2xs uppercase text-ink-faint">{rows.length}</span>
      </div>

      <div className="max-h-[560px] overflow-y-auto px-5 pb-5">
        {rows.length === 0 ? (
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
                    <li key={`${entry.time}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onOpen?.(entry.escrowId)}
                        className="flex w-full cursor-pointer gap-3 rounded-panel p-2 text-left transition-colors duration-150 hover:bg-beige"
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
                            <span>{entry.actor}</span>
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
