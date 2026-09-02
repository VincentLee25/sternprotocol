export default function ActivityLog({ entries }) {
  if (!entries || entries.length === 0) {
    return <p className="font-serif text-sm text-ink-dim">No activity recorded yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {[...entries].reverse().map((entry, index) => (
        <li
          key={`${entry.time}-${index}`}
          className="flex gap-3 border-b border-sky/50 py-2.5 text-sm last:border-b-0"
        >
          <span className="w-14 shrink-0 pt-0.5 text-2xs text-ink-faint">
            {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="min-w-0">
            <span className="capitalize text-teal">{entry.actor}</span>{" "}
            <span className="text-navy">{entry.event}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
