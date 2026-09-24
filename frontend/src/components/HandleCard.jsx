import { useEffect, useState } from "react";
import { AtSign, Check, Loader2, Pencil } from "lucide-react";
import { apiConfigured, claimHandle, directoryForAddress } from "../lib/sternApi.js";
import { useLanguage } from "../lib/language.jsx";

/**
 * Registers the handle that points at this wallet, so a counterparty can find
 * it without being sent 42 hex characters over WhatsApp.
 *
 * The other half of CounterpartyLookup: that one reads the book, this one is
 * how an address gets into it. Deliberately small and in the sidebar rather
 * than a settings page — it is a one-time action, and it belongs next to the
 * address it names.
 *
 * Styled as a sidebar SECTION, not a card: the rest of this rail is flat
 * sections divided by a hairline, with 9px tracked labels and plain-text
 * actions. A tinted rounded panel here read as something bolted on.
 *
 * It claims nothing about identity. A handle is self-chosen and free, so the
 * copy says only that this is how others find your wallet, never that it
 * proves who you are.
 */
export default function HandleCard({ address }) {
  const { t } = useLanguage();
  const ui = {
    title: t("Your handle"), claim: t("Claim a handle"), change: t("Change your handle"),
    namePlaceholder: t("Company name (optional)"), save: t("Save"), saving: t("Saving…"),
    cancel: t("Cancel"), empty: t("Claim a handle so counterparties can find this account without typing the address."),
    held: t("Counterparties can find this account by handle instead of the address.")
  };

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
    setLoading(true);
    setEntry(null);

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

  const field =
    "w-full border-b border-sky/70 bg-transparent py-1 text-[10px] text-navy outline-none transition-colors placeholder:text-ink-faint focus:border-teal";

  return (
    <section aria-label={ui.title} className="border-b border-sky/70 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          <AtSign size={11} aria-hidden="true" />
          {ui.title}
        </div>
        {loading ? <Loader2 size={11} className="animate-spin text-teal" aria-hidden="true" /> : null}
        {saved ? <Check size={11} className="text-teal" aria-hidden="true" /> : null}
      </div>

      {editing ? (
        <form onSubmit={submit} className="mt-2">
          <label className="flex items-center gap-1">
            <span className="text-[10px] text-ink-faint">@</span>
            <span className="sr-only">Handle</span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              placeholder="gayocoffee"
              spellCheck="false"
              autoComplete="off"
              autoFocus
              className={`${field} font-mono`}
            />
          </label>
          <label className="mt-1.5 block">
            <span className="sr-only">{ui.namePlaceholder}</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={ui.namePlaceholder}
              autoComplete="off"
              className={field}
            />
          </label>

          {error ? (
            <p role="alert" className="mt-2 border-l-2 border-state-disputed pl-2 text-[10px] leading-relaxed text-state-disputed">
              {t(error)}
            </p>
          ) : null}

          <div className="mt-2.5 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="cursor-pointer text-[10px] font-semibold text-teal transition-colors hover:text-navy disabled:opacity-50"
            >
              {saving ? ui.saving : ui.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="cursor-pointer text-[10px] font-semibold text-ink-dim transition-colors hover:text-navy"
            >
              {ui.cancel}
            </button>
          </div>
        </form>
      ) : entry ? (
        <>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-base font-semibold text-navy">
            @{entry.handle}
            <button
              type="button"
              onClick={startEditing}
              aria-label={ui.change}
              className="cursor-pointer text-ink-faint transition-colors hover:text-navy"
            >
              <Pencil size={11} aria-hidden="true" />
            </button>
          </p>
          {entry.displayName ? (
            <p className="truncate text-[10px] text-ink-dim">{entry.displayName}</p>
          ) : null}
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">{ui.held}</p>
        </>
      ) : loading ? null : (
        <>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">{ui.empty}</p>
          <button
            type="button"
            onClick={startEditing}
            className="mt-2 cursor-pointer text-[10px] font-semibold text-teal transition-colors hover:text-navy"
          >
            {ui.claim}
          </button>
        </>
      )}
    </section>
  );
}
