import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, RefreshCcw, ShieldAlert, X } from "lucide-react";
import { getEvidence, simulateFault, apiConfigured } from "../lib/sternApi.js";
import { disputeOpportunity, faultOptions, activeFault, milestoneRows, verificationChecks } from "../lib/evidence.js";
import { previewDispute, raiseDisputeAsUser } from "../lib/disputeFlow.js";

// Renders GET /oracle/evidence/:id: the committed on-chain proofs, the current
// source verdict, and where the two now disagree.
//
// No verification logic lives here. The gateway has already done the comparison
// (docs/FRONTEND_HANDOFF_UPDATED.md closing note); this only renders its answer.
export default function EvidencePanel({ escrowId, smartAccountClient, onStateChanged }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const load = useCallback(
    async (signal) => {
      setError("");
      try {
        setEvidence(await getEvidence(escrowId, { signal }));
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [escrowId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const opportunity = disputeOpportunity(evidence);
  const rows = milestoneRows(evidence);
  const checks = verificationChecks(evidence);
  const faults = faultOptions(evidence);
  const currentFault = activeFault(evidence);

  // A dispute becomes possible only after a fault makes a committed proof
  // disagree with its source, so re-read evidence rather than patching state.
  async function onFaultChange(event) {
    const fault = event.target.value;
    setBusy("fault");
    setError("");
    try {
      await simulateFault(escrowId, fault);
      await load();
      onStateChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onPreview() {
    if (!opportunity.milestone) return;
    setBusy("preview");
    setError("");
    try {
      setPreview(await previewDispute(escrowId, opportunity.milestone));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onRaise() {
    setBusy("dispute");
    setError("");
    try {
      const res = await raiseDisputeAsUser(smartAccountClient, escrowId, opportunity.milestone);
      setResult(res);
      setPreview(null);
      await load();
      onStateChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (!apiConfigured) {
    return (
      <Panel>
        <Head title="Evidence" />
        <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
          No gateway configured. Set <code className="font-mono text-xs">VITE_ORACLE_API</code> in
          <code className="font-mono text-xs"> .env</code> — the backend runs on
          <code className="font-mono text-xs"> http://localhost:4000</code>.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <Head title="Evidence &amp; verification" />
        <button
          type="button"
          onClick={() => load()}
          disabled={Boolean(busy)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-sky px-3 py-1.5 text-2xs font-medium uppercase text-navy transition-colors duration-150 hover:border-teal/50 disabled:opacity-50"
        >
          <RefreshCcw size={11} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 font-serif text-sm text-ink-dim">
          <Loader2 size={14} className="animate-spin text-teal" aria-hidden="true" />
          Reading evidence…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-disputed">
          {error}
        </p>
      ) : null}

      {evidence ? (
        <>
          {/* Committed proof vs current source, per milestone. */}
          <ol className="mt-4 space-y-2">
            {rows.map((row) => (
              <li
                key={row.key}
                className={`rounded-panel border px-3.5 py-3 ${
                  row.discrepancy ? "border-state-disputed/45 bg-state-disputed/[0.07]" : "border-sky bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy">{row.label}</p>
                    <p className="font-serif text-xs text-ink-dim">{row.oracle}</p>
                  </div>
                  <Badge row={row} />
                </div>

                {row.proofCid ? (
                  <dl className="mt-2.5 space-y-1 border-t border-sky/60 pt-2.5 text-2xs">
                    <Row label="Proof CID" value={row.proofCid} mono truncate />
                    {row.verifier ? <Row label="Verifier" value={row.verifier} mono truncate /> : null}
                    {row.challengeDeadline ? (
                      <Row label="Challenge until" value={new Date(row.challengeDeadline).toLocaleString("id-ID")} />
                    ) : null}
                  </dl>
                ) : null}

                {row.discrepancy ? (
                  <p className="mt-2.5 flex items-start gap-1.5 font-serif text-xs leading-relaxed text-state-disputed">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    This proof is committed on chain, but the source it was based on no longer agrees.
                  </p>
                ) : null}
              </li>
            ))}
          </ol>

          {/* Named checks behind those verdicts. */}
          {checks.length ? (
            <div className="mt-4">
              <p className="font-mono text-2xs uppercase text-ink-faint">Current source checks</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {checks.map((c) => (
                  <li
                    key={c.key}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs uppercase ${
                      c.passed
                        ? "bg-state-attested/10 text-state-attested"
                        : "bg-state-disputed/10 text-state-disputed"
                    }`}
                  >
                    {c.passed ? <Check size={10} aria-hidden="true" /> : <X size={10} aria-hidden="true" />}
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The CTA appears only when the gateway says a dispute is actually
              possible. A discrepancy whose challenge window has closed is shown
              as a note instead, so the timeline does not look broken. */}
          {opportunity.actionable ? (
            <div className="mt-4 rounded-panel border border-state-pending/45 bg-state-pending/[0.08] p-3.5">
              <p className="flex items-center gap-1.5 font-mono text-2xs uppercase text-state-pending">
                <ShieldAlert size={12} aria-hidden="true" />
                Dispute available — {opportunity.milestoneLabel}
              </p>
              <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">{opportunity.reason}</p>

              {preview ? (
                <div className="mt-3 rounded-panel bg-surface px-3 py-2.5">
                  <dl className="space-y-1 text-2xs">
                    <Row label="Bond required" value={`${Number(preview.bond).toLocaleString("id-ID")} ${preview.currency}`} />
                    <Row label="Window closes" value={new Date(preview.challengeDeadline).toLocaleString("id-ID")} />
                  </dl>
                  <p className="mt-2 font-serif text-xs leading-relaxed text-ink-dim">
                    You sign both the bond approval and the dispute in one confirmation. The backend
                    never signs this for you.
                  </p>
                  <button
                    type="button"
                    onClick={onRaise}
                    disabled={busy === "dispute"}
                    className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-navy py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:opacity-50"
                  >
                    {busy === "dispute" ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                    {busy === "dispute" ? "Signing…" : "Lock bond & raise dispute"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={busy === "preview"}
                  className="mt-2.5 w-full cursor-pointer rounded-full border border-state-pending/50 py-2 text-xs font-medium text-state-pending transition-colors duration-150 hover:bg-state-pending/10 disabled:opacity-50"
                >
                  {busy === "preview" ? "Checking…" : "Review dispute"}
                </button>
              )}
            </div>
          ) : opportunity.windowClosed ? (
            <p className="mt-4 flex items-start gap-1.5 rounded-panel bg-sky/25 px-3.5 py-2.5 font-serif text-xs leading-relaxed text-ink-dim">
              <Clock size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              {opportunity.reason}
            </p>
          ) : null}

          {result ? (
            <p className="mt-3 rounded-panel border border-state-attested/40 bg-state-attested/10 px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-attested">
              Dispute raised on {result.milestone}, {Number(result.bond).toLocaleString("id-ID")} bond locked.
              <span className="mt-1 block break-all font-mono text-2xs">{result.transactionHash}</span>
            </p>
          ) : null}

          {/* Demo-only. It rewrites the mock source; it does NOT write a bad
              proof on chain (handoff §7, "Critical rule"). */}
          {faults.length ? (
            <div className="mt-4 border-t border-sky pt-3.5">
              <label htmlFor="fault" className="font-mono text-2xs uppercase text-ink-faint">
                Fault simulation — demo only
              </label>
              <select
                id="fault"
                value={currentFault}
                onChange={onFaultChange}
                disabled={busy === "fault"}
                className="mt-1.5 w-full rounded-panel border border-sky bg-surface px-3 py-2 text-xs text-navy disabled:opacity-50"
              >
                {faults.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
                Changes the mock source data in memory. It never writes a false proof on chain — a
                discrepancy only appears where a proof was already committed.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}

function Panel({ children }) {
  return <section className="rounded-doc bg-surface p-6 shadow-card">{children}</section>;
}

function Head({ title }) {
  return <h2 className="font-mono text-2xs uppercase text-ink-faint">{title}</h2>;
}

function Row({ label, value, mono, truncate }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 font-mono uppercase text-ink-faint">{label}</dt>
      <dd className={`min-w-0 text-right text-navy ${mono ? "font-mono" : "font-serif"} ${truncate ? "truncate" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function Badge({ row }) {
  if (row.discrepancy) {
    return <Chip tone="disputed">Discrepancy</Chip>;
  }
  if (row.submitted) {
    return <Chip tone="attested">Committed</Chip>;
  }
  return <Chip tone="muted">{row.sourcePasses ? "Ready" : "Not verified"}</Chip>;
}

function Chip({ tone, children }) {
  const cls = {
    disputed: "bg-state-disputed/10 text-state-disputed",
    attested: "bg-state-attested/10 text-state-attested",
    muted: "bg-sky/30 text-ink-dim"
  }[tone];
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-2xs uppercase ${cls}`}>{children}</span>
  );
}
