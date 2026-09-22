import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, PenLine, RefreshCcw, ShieldAlert, X } from "lucide-react";
import { getEvidence, simulateFault, verifyMilestones, apiConfigured, eblDocumentUrl } from "../lib/sternApi.js";
import { disputeOpportunity, disputeRehearsal, eblSummary, faultOptions, activeFault, milestoneRows, sourceEvidence, verificationChecks, verifyResultRows } from "../lib/evidence.js";
import { eblCheckRows, eblFieldRows, shortCid } from "../lib/ebl.js";
import { previewDispute, raiseDisputeAsUser } from "../lib/disputeFlow.js";
import TxLink, { AddressLink, BlockLink } from "./TxLink.jsx";

// Renders GET /oracle/evidence/:id: the committed on-chain proofs, the current
// source verdict, and where the two now disagree.
//
// No verification logic lives here. The gateway has already done the comparison
// (docs/FRONTEND_HANDOFF_UPDATED.md closing note); this only renders its answer.
export default function EvidencePanel({ escrowId, smartAccountClient, onStateChanged, onBusyChange }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [verifyRun, setVerifyRun] = useState(null);
  // Ticks while a dispute window is counting down. Without it the CTA sat there
  // offering an action whose deadline had already passed, and the only thing
  // that noticed was prepareDispute refusing on the click.
  const [tick, setTick] = useState(() => Math.floor(Date.now() / 1000));

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
  const secondsLeft =
    opportunity.challengeDeadlineUnix != null ? opportunity.challengeDeadlineUnix - tick : null;
  // Trust the gateway's answer, but stop trusting it once its own deadline has
  // passed. The local clock is only used to withdraw the offer, never to make
  // one — the contract still has the final say.
  const stillOpen = opportunity.actionable && (secondsLeft == null || secondsLeft > 0);

  // Which milestone a rehearsal should contest, and the fault that will make
  // it disagree. Recomputed against `tick` so the countdown it carries is live.
  const rehearsal = disputeRehearsal(evidence, tick);

  // Re-read once the window lapses, so the panel states the gateway's verdict
  // rather than this browser's guess about it.
  //
  // The tick runs whenever ANY committed proof still has a window, not only
  // when a dispute is already available. Before, the countdown started only
  // after a discrepancy existed — which is exactly too late on a deployment
  // with a short window, because the seconds an operator needs to see are the
  // ones before they switch the fault on.
  const anyWindowOpen = rehearsal.possible;
  useEffect(() => {
    if (!anyWindowOpen && !opportunity.actionable) return;
    const id = setInterval(() => setTick(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [anyWindowOpen, opportunity.actionable]);

  useEffect(() => {
    if (opportunity.actionable && secondsLeft != null && secondsLeft <= 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft != null && secondsLeft <= 0]);

  const rows = milestoneRows(evidence);
  const checks = verificationChecks(evidence);
  const failing = sourceEvidence(evidence).filter((s) => !s.passed);
  const faults = faultOptions(evidence);
  const currentFault = activeFault(evidence);
  const ebl = eblSummary(evidence);
  // A fault switched on before anything is committed guarantees a refusal: the
  // gateway will not write a proof its own sources reject. That is correct, but
  // it looks like a failure, and the order is easy to get backwards — so say it
  // before the button is pressed rather than after.
  const faultBeforeAnyProof = currentFault !== "none" && !rows.some((r) => r.submitted);

  // A dispute becomes possible only after a fault makes a committed proof
  // disagree with its source, so re-read evidence rather than patching state.
  async function applyFault(fault) {
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

  function onFaultChange(event) {
    return applyFault(event.target.value);
  }

  // Stages a contestable discrepancy in one press: it already knows which
  // milestone has an open window and which source that milestone was based on,
  // so neither has to be worked out under a running clock.
  function onRehearse() {
    if (!rehearsal.possible) return;
    return applyFault(rehearsal.fault);
  }

  // Asks the gateway to verify and commit. The browser never signs a proof —
  // the verifier keys stay on the gateway, and this only triggers the work.
  async function onVerify() {
    setBusy("verify");
    // Raises the page-wide overlay. A spinner inside this button was the only
    // signal that anything was happening, through a run that sends up to three
    // transactions and can take most of a minute.
    onBusyChange?.(true);
    setError("");
    setVerifyRun(null);
    try {
      const res = await verifyMilestones(escrowId);
      setVerifyRun(verifyResultRows(res));
      // Order matters: the evidence panel re-reads itself, then the page re-reads
      // the escrow. Both are needed — this panel knows about proofs, the page
      // knows about state, timelock and activity, and a verification changes all
      // of them. Awaiting the second is what makes the result visible without a
      // manual page reload.
      await load();
      await onStateChanged?.();
    } catch (err) {
      // A 404 here means the gateway simply has not shipped the route yet.
      // Saying "could not verify" would send someone hunting through their
      // sources for a problem that is not there.
      setError(
        err?.status === 404
          ? "This gateway has no POST /oracle/verify/:id yet. Until the backend ships it, milestones are submitted by the verifier service directly."
          : err.message
      );
    } finally {
      setBusy("");
      onBusyChange?.(false);
    }
  }

  // Both halves of the page, not just this panel — see the button.
  async function onRefreshAll() {
    setBusy("refresh");
    try {
      await load();
      await onStateChanged?.();
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
        {/* This re-read only its own evidence, so the state, timeline and
            timelock on the page around it stayed stale — pressing it looked
            like nothing happened, because nothing visible did. It now refreshes
            the page's escrow too, and says when it is working. */}
        <button
          type="button"
          onClick={onRefreshAll}
          disabled={Boolean(busy)}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-sky px-3 py-1.5 text-2xs font-medium uppercase text-navy transition-colors duration-150 hover:border-teal/50 disabled:opacity-50"
        >
          <RefreshCcw
            size={11}
            className={busy === "refresh" ? "animate-spin" : ""}
            aria-hidden="true"
          />
          {busy === "refresh" ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {/* Triggers the gateway's own verification. Note what this button is NOT:
          it does not sign, and it cannot make a failing source pass. The
          gateway runs the same automated check either way and refuses to commit
          a proof that fails it — pressing this while a fault is on is supposed
          to come back refused. */}
      <div className="mt-4 border-b border-sky pb-4">
        <button
          type="button"
          onClick={onVerify}
          disabled={Boolean(busy)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-navy py-2.5 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "verify" ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <PenLine size={13} aria-hidden="true" />
          )}
          {busy === "verify" ? "Submitting to chain…" : "Verify milestones"}
        </button>
        <p className="mt-2 font-serif text-xs leading-relaxed text-ink-dim">
          {busy === "verify"
            ? "Each proof is a transaction, and the contract holds a challenge window between them. This can take a while."
            : "The verifier institutions sign these, on the gateway. This asks them to; it does not sign anything here."}
        </p>

        {faultBeforeAnyProof && busy !== "verify" ? (
          <p className="mt-2 rounded-panel border border-state-pending/40 bg-state-pending/[0.08] px-3 py-2.5 font-serif text-xs leading-relaxed text-state-pending">
            The <span className="font-mono">{currentFault}</span> fault is on and nothing is
            committed yet, so this will be refused. Reset the fault, verify, then switch it back on
            — a discrepancy needs a proof to disagree with.
          </p>
        ) : null}

        {verifyRun ? (
          <ul className="mt-3 space-y-1.5">
            {verifyRun.map((r) => (
              <li key={r.key} className="flex items-baseline justify-between gap-3 text-2xs">
                <span className="min-w-0">
                  <span className="text-navy">{r.label}</span>
                  <span className="ml-1.5 font-serif text-ink-faint">{r.oracle}</span>
                  {r.detail ? (
                    <span className="mt-0.5 block font-serif text-ink-dim">{r.detail}</span>
                  ) : null}
                  {/* "submitted" is this app describing itself. The hash beside
                      it is the part a sceptic can check without us. */}
                  {r.transactionHash ? (
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <TxLink hash={r.transactionHash} />
                      {r.verifier ? <AddressLink address={r.verifier} label="signer" /> : null}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 font-mono uppercase ${
                    {
                      ok: "bg-state-attested/10 text-state-attested",
                      wait: "bg-state-pending/10 text-state-pending",
                      fail: "bg-state-disputed/10 text-state-disputed",
                      muted: "bg-sky/30 text-ink-dim"
                    }[r.tone]
                  }`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
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
                    {/* The verifier address is the one thing here worth checking
                        elsewhere: it is what proves a real, funded, role-holding
                        wallet signed this proof rather than the app drawing a
                        green tick for itself. */}
                    {row.verifier ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="uppercase text-ink-faint">Verifier</dt>
                        <dd className="min-w-0 text-right"><AddressLink address={row.verifier} /></dd>
                      </div>
                    ) : null}
                    {row.blockNumber != null ? (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="uppercase text-ink-faint">Block</dt>
                        <dd className="min-w-0 text-right">
                          <BlockLink blockNumber={row.blockNumber} />
                        </dd>
                      </div>
                    ) : null}
                    {row.challengeDeadline ? (
                      <Row label="Challenge until" value={new Date(row.challengeDeadline).toLocaleString("id-ID")} />
                    ) : null}
                    {/* The countdown, on every committed proof rather than
                        only on one that is already contestable. On a short
                        challenge window this is the number that decides
                        whether there is time to act at all, and it used to
                        appear only once it was too late to use. */}
                    {row.challengeDeadlineUnix ? (
                      <Row
                        label="Window"
                        value={
                          row.challengeDeadlineUnix - tick > 0
                            ? `${countdown(row.challengeDeadlineUnix - tick)} left`
                            : "closed"
                        }
                      />
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

          {/* Staging a dispute, in one press.
              Doing it by hand means holding three things at once — which
              milestone has a proof, which fault that milestone's source
              answers to, and how many seconds are left — and on a short
              window the third runs out while you work out the first two. The
              only feedback was the dispute CTA never appearing. */}
          {faults.length ? (
            <div
              className={`mt-4 rounded-panel border px-3.5 py-3 ${
                rehearsal.possible
                  ? "border-teal/40 bg-teal/[0.06]"
                  : "border-sky bg-sky/20"
              }`}
            >
              <p className="font-mono text-2xs uppercase text-ink-faint">Rehearse a dispute — demo only</p>

              {rehearsal.possible ? (
                <>
                  <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
                    {rehearsal.alreadyDiscrepant ? (
                      <>
                        <span className="text-navy">{rehearsal.milestoneLabel}</span> already disagrees with{" "}
                        {rehearsal.sourceLabel}. Open the dispute below before its window shuts.
                      </>
                    ) : (
                      <>
                        This will make <span className="text-navy">{rehearsal.milestoneLabel}</span> disagree with{" "}
                        {rehearsal.sourceLabel}, which is what a dispute contests. It does not write anything on
                        chain.
                      </>
                    )}
                  </p>
                  <p className="mt-1.5 font-mono text-2xs uppercase text-state-pending">
                    {countdown(rehearsal.secondsLeft)} left on that window
                  </p>
                  {!rehearsal.alreadyDiscrepant ? (
                    <button
                      type="button"
                      onClick={onRehearse}
                      disabled={Boolean(busy)}
                      className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-teal/50 bg-teal/10 py-2 text-xs font-medium text-teal transition-colors duration-150 hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === "fault" ? (
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ShieldAlert size={12} aria-hidden="true" />
                      )}
                      {busy === "fault"
                        ? "Applying…"
                        : `Make ${rehearsal.milestoneLabel} disagree`}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">{rehearsal.reason}</p>
              )}
            </div>
          ) : null}

          {/* The e-BL, separately from the four data feeds.
              The other sources are readings — a weight, a departure status.
              This one is a document, and the interesting part is that anyone
              can fetch it from the address on chain and get the same bytes. */}
          {ebl ? <EblCard ebl={ebl} /> : null}

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

          {/* Only the failing sources get the long form. A chip is enough for a
              source that agrees; when one disagrees, "expected departed, got
              not_departed" is the thing an operator actually needs to read. */}
          {failing.length ? (
            <ul className="mt-3 space-y-2">
              {failing.map((s) => (
                <li key={s.key} className="rounded-panel border border-state-disputed/40 bg-state-disputed/[0.06] px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-mono text-2xs uppercase text-state-disputed">{s.source}</p>
                    <p className="font-serif text-2xs text-ink-dim">{s.oracle?.replace(/_/g, " ")}</p>
                  </div>
                  {/* The shipment this reading is about, from the bill of
                      lading. It goes first because it is what makes the two
                      lines below mean anything. */}
                  {s.subject ? (
                    <p className="mt-1 break-words font-serif text-2xs leading-relaxed text-navy">{s.subject}</p>
                  ) : null}
                  <dl className="mt-1.5 space-y-0.5 text-2xs">
                    <Row label="Field" value={s.field} mono />
                    <Row label="Expected" value={s.expected} mono />
                    <Row label="Actual" value={s.actual} mono />
                  </dl>
                  {s.basis ? (
                    <p className="mt-1.5 font-serif text-2xs leading-relaxed text-ink-faint">
                      Expected value taken from the {s.basis}.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* The CTA appears only when the gateway says a dispute is actually
              possible. A discrepancy whose challenge window has closed is shown
              as a note instead, so the timeline does not look broken. */}
          {stillOpen ? (
            <div className="mt-4 rounded-panel border border-state-pending/45 bg-state-pending/[0.08] p-3.5">
              <p className="flex items-center gap-1.5 font-mono text-2xs uppercase text-state-pending">
                <ShieldAlert size={12} aria-hidden="true" />
                Dispute available — {opportunity.milestoneLabel}
              </p>
              <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">{opportunity.reason}</p>
              {secondsLeft != null ? (
                <p className="mt-1.5 font-mono text-2xs uppercase text-state-pending">
                  {secondsLeft > 60
                    ? `${Math.floor(secondsLeft / 60)}m ${secondsLeft % 60}s left`
                    : `${secondsLeft}s left`}
                </p>
              ) : null}

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
          ) : opportunity.hasDiscrepancy ? (
            // The gateway's sentence stops at "the window has closed", which
            // leaves the consequence unsaid — and the consequence is the whole
            // point of a challenge window. Without this second line the panel
            // reads as though a disputed proof is somehow still in limbo, and
            // settling anyway looks like a bug rather than the design.
            <div className="mt-4 rounded-panel bg-sky/25 px-3.5 py-2.5">
              <p className="flex items-start gap-1.5 font-serif text-xs leading-relaxed text-ink-dim">
                <Clock size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                {opportunity.reason}
              </p>
              <p className="mt-1.5 pl-[18px] font-serif text-xs leading-relaxed text-ink-dim">
                The proof now stands, and settlement proceeds on it. Nothing here blocks release —
                a proof is contested inside its window or not at all.
              </p>
            </div>
          ) : null}

          {result ? (
            <p className="mt-3 rounded-panel border border-state-attested/40 bg-state-attested/10 px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-attested">
              Dispute raised on {result.milestone}, {Number(result.bond).toLocaleString("id-ID")} bond locked.
              <span className="mt-1 block"><TxLink hash={result.transactionHash} /></span>
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

/**
 * The bill of lading this escrow was created against, retrieved from the CID
 * the contract stores.
 *
 * The claim being made here is narrow and checkable: these bytes came back
 * from that address, they hash to that address, and this is what they say. A
 * sceptic can repeat the whole thing with any IPFS gateway and the CID printed
 * on chain.
 */
function EblCard({ ebl }) {
  if (!ebl.configured) {
    return (
      <div className="mt-4 rounded-panel border border-state-pending/40 bg-state-pending/[0.07] px-3.5 py-2.5">
        <p className="font-mono text-2xs uppercase text-state-pending">e-BL document</p>
        <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
          {ebl.note ||
            "This gateway has no IPFS pinning service configured, so the e-BL check is a placeholder rather than a document verification."}
        </p>
      </div>
    );
  }

  const url = ebl.cid ? eblDocumentUrl(ebl.cid) : null;
  const checkRows = eblCheckRows(ebl);
  const fieldRows = eblFieldRows(ebl);
  const tone = ebl.valid ? "attested" : "disputed";

  return (
    <div
      className={`mt-4 rounded-panel border px-3.5 py-3 ${
        ebl.valid ? "border-state-attested/40 bg-state-attested/[0.05]" : "border-state-disputed/45 bg-state-disputed/[0.06]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-2xs uppercase text-ink-faint">e-BL document on IPFS</p>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-2xs uppercase ${
            tone === "attested"
              ? "bg-state-attested/10 text-state-attested"
              : "bg-state-disputed/10 text-state-disputed"
          }`}
        >
          {ebl.simulatedFault ? "Simulated fail" : ebl.valid ? "Verified" : "Unverified"}
        </span>
      </div>

      {ebl.cid ? (
        <p className="mt-2 break-all font-mono text-2xs text-navy" title={ebl.cid}>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" className="text-teal hover:text-navy">
              {ebl.cid}
            </a>
          ) : (
            shortCid(ebl.cid)
          )}
        </p>
      ) : null}

      <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">{ebl.reason}</p>

      {checkRows.length ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {checkRows.map((row) => (
            <li
              key={row.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs uppercase ${
                row.passed
                  ? "bg-state-attested/10 text-state-attested"
                  : "bg-state-disputed/10 text-state-disputed"
              }`}
            >
              {row.passed ? <Check size={10} aria-hidden="true" /> : <X size={10} aria-hidden="true" />}
              {row.label}
            </li>
          ))}
        </ul>
      ) : null}

      {fieldRows.length ? (
        <dl className="mt-2.5 space-y-1 border-t border-sky/60 pt-2.5 text-2xs">
          {fieldRows.map((row) => (
            <div key={row.key} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 font-mono uppercase text-ink-faint">{row.label}</dt>
              <dd className="min-w-0 text-right font-serif text-navy">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {ebl.retrievedFrom ? (
        <p className="mt-2 font-serif text-2xs leading-relaxed text-ink-faint">
          Retrieved from {ebl.retrievedFrom}
          {ebl.pages ? `, ${ebl.pages} page${ebl.pages === 1 ? "" : "s"}` : ""}
          {ebl.size ? `, ${ebl.size.toLocaleString("id-ID")} bytes` : ""}.
        </p>
      ) : null}
    </div>
  );
}

/** "2m 14s" rather than "134", which nobody reads as a duration under pressure. */
function countdown(seconds) {
  if (seconds == null || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
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
