import { useEffect, useState } from "react";
import { AtSign, Check, Loader2, Pencil } from "lucide-react";
import { apiConfigured, claimHandle, directoryForAddress } from "../lib/sternApi.js";

/**
 * Registers the handle that points at this wallet, so a counterparty can find
 * it without being sent 42 hex characters over WhatsApp.
 *
 * The other half of CounterpartyLookup: that one reads the book, this one is
 * how an address gets into it. Deliberately small and in the sidebar rather
 * than a settings page — it is a one-time action, and it belongs next to the
 * address it names.
 *
 * It claims nothing about identity. A handle is self-chosen and free, so the
 * copy says only that this is how others find your wallet, never that it
 * proves who you are.
 */
export default function HandleCard({ address }) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!apiConfigured || !address) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const res = await directoryForAddress(address, { signal: controller.signal });
        if (!cancelled) setEntry(res.entry || null);
      } catch {
        // A directory the gateway cannot answer for is not worth an error in
        // the sidebar: the form still takes a pasted address.
        if (!cancelled) setEntry(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [address]);

  if (!apiConfigured || !address) return null;

  function startEditing() {
    setHandle(entry?.handle || "");
    setDisplayName(entry?.displayName || "");
    setError("");
    setEditing(true);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const next = await claimHandle({
        smartAccountAddress: address,
        handle: handle.trim().replace(/^@/, ""),
        displayName: displayName.trim()
      });
      setEntry(next);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-3 rounded-panel border border-sky bg-beige/60 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 text-2xs uppercase text-ink-faint">
        <span className="flex items-center gap-1.5">
          <AtSign size={11} aria-hidden="true" />
          Your handle
        </span>
        {loading ? <Loader2 size={11} className="animate-spin text-teal" aria-hidden="true" /> : null}
        {saved ? <Check size={11} className="text-state-attested" aria-hidden="true" /> : null}
      </div>

      {editing ? (
        <form onSubmit={submit} className="mt-2">
          <label className="flex items-center gap-1 rounded-panel border border-sky bg-surface px-2 py-1.5 focus-within:border-teal/50">
            <span className="text-2xs text-ink-faint">@</span>
            <span className="sr-only">Handle</span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              placeholder="gayocoffee"
              spellCheck="false"
              autoComplete="off"
              autoFocus
              className="w-full bg-transparent font-mono text-2xs text-navy outline-none placeholder:text-ink-faint"
            />
          </label>
          <label className="mt-1.5 block rounded-panel border border-sky bg-surface px-2 py-1.5 focus-within:border-teal/50">
            <span className="sr-only">Company name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Company name (optional)"
              autoComplete="off"
              className="w-full bg-transparent text-2xs text-navy outline-none placeholder:text-ink-faint"
            />
          </label>

          {error ? (
            <p role="alert" className="mt-1.5 font-serif text-2xs leading-relaxed text-state-disputed">
              {error}
            </p>
          ) : null}

          <div className="mt-2 flex gap-1.5">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 cursor-pointer rounded-full border border-teal/50 bg-teal/10 py-1.5 text-2xs font-medium uppercase text-teal transition-colors duration-150 hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 cursor-pointer rounded-full border border-sky py-1.5 text-2xs uppercase text-ink-dim transition-colors duration-150 hover:border-teal/50 hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : entry ? (
        <>
          <p className="mt-1 flex items-center gap-1.5 font-mono text-sm font-semibold text-navy">
            @{entry.handle}
            <button
              type="button"
              onClick={startEditing}
              aria-label="Change your handle"
              className="cursor-pointer text-ink-faint transition-colors duration-150 hover:text-navy"
            >
              <Pencil size={11} aria-hidden="true" />
            </button>
          </p>
          {entry.displayName ? (
            <p className="truncate text-2xs text-ink-dim">{entry.displayName}</p>
          ) : null}
          <p className="mt-1.5 font-serif text-2xs leading-relaxed text-ink-dim">
            Counterparties can find this wallet by handle instead of typing the address.
          </p>
        </>
      ) : loading ? null : (
        <>
          <p className="mt-1 font-serif text-2xs leading-relaxed text-ink-dim">
            Claim a handle so counterparties can find this wallet without typing the address.
          </p>
          <button
            type="button"
            onClick={startEditing}
            className="mt-2 w-full cursor-pointer rounded-full border border-teal/50 bg-teal/10 py-1.5 text-2xs font-medium uppercase text-teal transition-colors duration-150 hover:bg-teal/20"
          >
            Claim a handle
          </button>
        </>
      )}
    </div>
  );
}
