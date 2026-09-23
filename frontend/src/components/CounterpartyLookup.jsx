import { useEffect, useRef, useState } from "react";
import { AtSign, Loader2, Search } from "lucide-react";
import { lookupDirectory, apiConfigured } from "../lib/sternApi.js";
import { Tag } from "./ui.jsx";
import { useLanguage } from "../lib/language.jsx";

/**
 * Finds a counterparty's wallet by handle, so nobody has to paste hex.
 *
 * Deliberately sits ABOVE the address field rather than replacing it. Picking a
 * match fills the address in and leaves it visible and editable, because a
 * handle here is self-chosen and proves nothing about who owns the wallet — the
 * human still confirms the address they are about to send a settlement to. An
 * address book, not an identity system, and the copy says so.
 *
 * Renders nothing when no gateway is configured: the directory lives there, and
 * an input that can only fail is worse than no input.
 */
export default function CounterpartyLookup({ label, onPick }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const boxRef = useRef(null);

  // Debounced, and every in-flight request is abandoned when the query moves
  // on — otherwise a slow answer for "ga" can land after the answer for "gayo"
  // and overwrite it with the wrong list.
  useEffect(() => {
    const term = query.trim().replace(/^@/, "");
    if (term.length < 2) {
      setResults(null);
      setError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const res = await lookupDirectory(term, { signal: controller.signal });
        setResults(res.results || []);
        setNote(res.note || "");
      } catch (err) {
        if (err.name !== "AbortError") {
          setResults(null);
          setError(err.message);
        }
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Close the list on an outside click, so it does not hang over the form.
  useEffect(() => {
    function onDocumentClick(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setResults(null);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  if (!apiConfigured) return null;

  function pick(entry) {
    onPick(entry.smartAccountAddress, entry);
    setQuery("");
    setResults(null);
  }

  return (
    <div ref={boxRef} className="relative mb-2">
      <label className="flex items-center gap-2 rounded-panel border border-sky bg-surface-soft px-3 py-2 focus-within:border-teal/50">
        {busy ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
        ) : (
          <Search size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
        )}
        <span className="sr-only">{t("Find the {party} by handle", { party: t(label) })}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Find the {party} by handle, or paste the address below", { party: t(label) })}
          spellCheck="false"
          autoComplete="off"
          className="w-full bg-transparent text-[13px] text-navy outline-none placeholder:text-ink-faint"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-1 text-2xs text-state-disputed">
          {t(error)}
        </p>
      ) : null}

      {results ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-panel border border-sky bg-surface shadow-card">
          {results.length ? (
            <>
              <ul className="max-h-56 overflow-y-auto">
                {results.map((entry) => (
                  <li key={entry.handle}>
                    <button
                      type="button"
                      onClick={() => pick(entry)}
                      className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-soft"
                    >
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-navy">
                        <AtSign size={11} className="shrink-0 text-teal" aria-hidden="true" />
                        {entry.handle}
                        {entry.displayName ? (
                          <span className="font-normal text-ink-dim">· {entry.displayName}</span>
                        ) : null}
                      </span>
                      {/* The address is shown here as well as in the field
                          below, because this is the moment someone decides. */}
                      <span className="break-all font-mono text-2xs text-ink-faint">
                        {entry.smartAccountAddress}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {note ? (
                <p className="border-t border-sky px-3 py-2 text-2xs leading-relaxed text-ink-faint">{t(note)}</p>
              ) : null}
            </>
          ) : (
            <p className="px-3 py-2.5 text-[13px] text-ink-dim">
              {t("No handle matches that. Paste the address in the field below instead.")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The chip shown under an address field once a handle filled it in, so the
 * form records where the address came from rather than just holding hex.
 */
export function PickedFrom({ entry, onClear }) {
  const { t } = useLanguage();
  if (!entry) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      <Tag tone="teal" icon={AtSign}>
        {entry.handle}
        {entry.displayName ? ` · ${entry.displayName}` : ""}
      </Tag>
      <button
        type="button"
        onClick={onClear}
        className="cursor-pointer text-2xs text-ink-faint underline underline-offset-2 transition-colors duration-150 hover:text-navy"
      >
        {t("clear")}
      </button>
      <span className="text-2xs text-ink-faint">{t("Confirm the address before signing.")}</span>
    </div>
  );
}
