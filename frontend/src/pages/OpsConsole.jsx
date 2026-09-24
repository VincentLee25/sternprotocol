import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import {
  closeOpsSession,
  getOpsSession,
  openOpsSession,
  arbitratedBy,
  signOpsMessage,
  resolveDisputeAsArbiter,
  resolveDisputeSplitAsArbiter,
  settleByAgreementAsArbiter
} from "../lib/opsAuth.js";
import ClausePanel from "../components/ClausePanel.jsx";
import TxLink from "../components/TxLink.jsx";
import { loadEscrowRows, sourceIsLive } from "../lib/escrowSource.js";
import {
  API_BASE,
  getNegotiation,
  getOpsClauseReviewChallenge,
  getOracleStatus,
  getVerifiers,
  reviewOpsClause,
  verifyDisputeAgreement
} from "../lib/sternApi.js";
// Named on screen when nothing matches, because "which chain am I actually
// looking at" is the question an empty list raises and the one it never
// answered. VITE_CONTRACT_ADDRESS (this page's signer) and the gateway's own
// CONTRACT_ADDRESS can disagree, and that disagreement looks exactly like a
// permissions problem.
import { ESCROW_ADDRESS as OPS_CONTRACT } from "../lib/sternContract.js";
import { shortAddress } from "../lib/actors.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { useLanguage } from "../lib/language.jsx";
import LanguageToggle from "../components/LanguageToggle.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";

// A separate surface for the arbiter and the contract admin. Deliberately not
// part of the workspace: those two hold institutional keys and sign in with
// them, so mixing the two would put a private-key field in front of ordinary
// users who must never see one.
export default function OpsConsole({ onExit }) {
  const [session, setSession] = useState(() => getOpsSession());

  if (!session) return <OpsLogin onOpen={setSession} onExit={onExit} />;
  return <OpsDashboard session={session} onClose={() => { closeOpsSession(); setSession(null); }} onExit={onExit} />;
}

function OpsLogin({ onOpen, onExit }) {
  const { t } = useLanguage();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const opened = await openOpsSession(key);
      setKey("");
      onOpen(opened);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stern-workspace-shell stern-ops stern-ops-login flex min-h-dvh items-center justify-center p-5 sm:p-8">
      <div className="stern-ops-access w-full max-w-[560px] p-6 sm:p-9">
        <div className="mb-10 flex items-center justify-between gap-4"><span className="stern-ops-wordmark">STERN</span><div className="flex gap-2"><LanguageToggle compact /><ThemeToggle /></div></div>
        <button
          type="button"
          onClick={onExit}
          className="stern-ops-back mb-8"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {t("Back to STERN")}
        </button>

        <p className="stern-ops-kicker">{t("Operations")}</p>
        <h1 className="stern-ops-access-title">{t("Arbiter console")}</h1>
        <p className="stern-ops-access-copy">{t("Open the escrows appointed to your institutional key, review interpretive clauses, and sign an accountable decision.")}</p>

        <form onSubmit={submit} className="mt-7">
          <label htmlFor="opskey" className="stern-ops-field-label">
            {t("Private key")}
          </label>
          <input
            id="opskey"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="0x…"
            spellCheck="false"
            autoComplete="off"
            className="stern-ops-key-input"
          />

          {error ? (
            <p role="alert" className="stern-ops-alert stern-ops-alert-error mt-4">
              {t(error)}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="stern-ops-primary-action mt-5 w-full"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
            {t(busy ? "Checking roles on chain…" : "Open console")}
          </button>
        </form>

        {/* Stated plainly rather than buried. An operator should know exactly
            what happens to the key they just typed. */}
        <div className="stern-ops-access-note mt-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
            <AlertTriangle size={12} aria-hidden="true" />
            {t("What happens to this key")}
          </p>
          <ul className="mt-2.5 space-y-1.5 text-sm leading-relaxed text-ink-dim">
            <li>{t("Held in memory for this tab only. A reload wipes it.")}</li>
            <li>{t("Never stored, never put in a URL, never sent to the backend.")}</li>
            <li>{t("Signing happens locally in your browser.")}</li>
            <li>
              {t("Testnet only. Treat any key used here as exposed, and never reuse it on mainnet.")}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function OpsDashboard({ session, onClose, onExit }) {
  const { t } = useLanguage();
  const [escrows, setEscrows] = useState([]);
  const [status, setStatus] = useState(null);
  const [verifiers, setVerifiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEscrow, setSelectedEscrow] = useState(null);

  const load = useCallback(async (signal) => {
    setError("");
    try {
      const [rows, oracle, vfs] = await Promise.all([
        loadEscrowRows({ signal }),
        getOracleStatus({ signal }).catch(() => null),
        getVerifiers({ signal }).catch(() => null)
      ]);
      setEscrows(rows);
      setStatus(oracle);
      setVerifiers(vfs?.verifiers || vfs || []);
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const mine = arbitratedBy(escrows, session.address);
  const disputed = mine.filter((e) => e.state === "Disputed" || e.disputeOpen);

  if (selectedEscrow) {
    return (
      <OpsEscrowDetail
        escrow={selectedEscrow}
        session={session}
        onBack={() => setSelectedEscrow(null)}
        onReviewRecorded={() => load()}
      />
    );
  }

  return (
    <div className="stern-workspace-shell stern-ops min-h-dvh p-5 sm:p-6 lg:p-10">
      <div className="stern-workspace-page mx-auto max-w-[1320px]">
      <header className="stern-ops-masthead mb-8">
        <div>
          <p className="stern-ops-kicker">{t("Operations console")}</p>
          <h1 className="stern-ops-title">
            {t(session.isAdmin ? "Arbiter & admin" : "Arbiter")}
          </h1>
          <p className="stern-ops-identity">{session.address}</p>
        </div>
        <div className="stern-ops-actions">
          <LanguageToggle compact />
          <ThemeToggle />
          <button
            type="button"
            onClick={onExit}
            className="stern-ops-quiet-action"
          >
            {t("Back to STERN")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="stern-ops-primary-action"
          >
            <LogOut size={13} aria-hidden="true" />
            {t("End session")}
          </button>
        </div>
      </header>

      {session.adminCheckFailed ? (
        <p className="stern-ops-alert stern-ops-alert-warning mb-5">
          {t("Signed in, but the admin role could not be checked:")} {session.adminCheckFailed} {t("This is a connectivity problem, not a permissions one.")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="stern-ops-alert stern-ops-alert-error mb-5">
          {error}
        </p>
      ) : null}

      {!sourceIsLive ? (
        <p className="stern-ops-alert stern-ops-alert-info mb-5">
          {t("No gateway configured, so this console has nothing live to read. Set VITE_ORACLE_API.")}
        </p>
      ) : null}

      <div className="stern-ops-layout">
        <section className="stern-ops-ledger">
          <div className="stern-ops-section-heading"><div><p className="stern-ops-kicker">{t("Appointed cases")}</p><h2>{t("Escrows you arbitrate")}</h2></div><span className="stern-ops-count">{mine.length}</span></div>

          {loading ? (
            <p className="mt-3 flex items-center gap-2 font-serif text-sm text-ink-dim">
              <Loader2 size={14} className="animate-spin text-teal" aria-hidden="true" />
              {t("Reading the registry…")}
            </p>
          ) : mine.length === 0 ? (
            /* Two very different situations used to print the same sentence —
               "not the arbiter on any escrow" — and the panel had not checked
               that. It only knew the filter came back empty, which is equally
               true when the registry itself is empty or is a different
               deployment than the one the escrow was created on. Saying which
               is what makes this answerable. */
            escrows.length === 0 ? (
              <div className="mt-3">
                <p className="font-serif text-sm leading-relaxed text-ink-dim">
                  {t("The registry read back no escrows at all, so there is nothing here to be the arbiter of — this is not a statement about your address.")}
                </p>
                <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
                  {t("Either no escrow has been created on the contract this gateway points at, or that is a different deployment from the one you created yours on.")}
                </p>
                <dl className="mt-3 grid gap-1 border-t border-sky pt-3 text-2xs">
                  <Term label={t("Gateway")} value={API_BASE || t("not configured")} />
                  <Term label={t("Contract this page signs against")} value={OPS_CONTRACT || t("not set")} />
                </dl>
              </div>
            ) : (
              <div className="mt-3">
                <p className="font-serif text-sm leading-relaxed text-ink-dim">
                  {t("Read {count} escrows from the registry, and none of them names this address as arbiter. The arbiter is fixed when an escrow is created and cannot be changed afterwards.", { count: escrows.length })}
                </p>
                <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
                  {t("The arbiters named on those escrows are:")}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {[...new Set(escrows.map((e) => e.arbiter).filter(Boolean))].map((arbiter) => (
                    <li key={arbiter} className="truncate font-mono text-2xs text-ink-faint">
                      {arbiter}
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid gap-1 border-t border-sky pt-3 text-2xs">
                  <Term label={t("Gateway")} value={API_BASE || t("not configured")} />
                  <Term label={t("You signed in as")} value={session.address} />
                </dl>
              </div>
            )
          ) : (
            <ul className="stern-ops-case-list">
              {mine.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedEscrow(e)}
                    aria-label={`${t("Open escrow")} ${e.id}`}
                    className="stern-ops-case-row"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-navy">{e.commodity}</p>
                      <p className="font-mono text-2xs text-ink-faint">
                        &#8470; {String(e.id).padStart(4, "0")} · {e.containerRef}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs tabular-nums text-navy">
                        {Number(e.value).toLocaleString("id-ID")} {CURRENCY_LABEL}
                      </p>
                      <p className="font-mono text-2xs uppercase text-ink-faint">{t(e.state)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Was a notice saying resolution happens elsewhere. An arbiter who has
              just typed their private key into this page has, by definition, the
              authority to decide — sending them to a backend service was the
              console refusing to do the one thing it exists for. */}
          {disputed.length > 0 ? (
            <div className="stern-ops-decisions">
              <div className="stern-ops-section-heading"><div><p className="stern-ops-kicker text-state-disputed">{t("Action required")}</p><h3>{t("Awaiting your decision")}</h3></div><span className="stern-ops-count stern-ops-count-alert">{disputed.length}</span></div>
              <ul className="mt-4 space-y-3">
                {disputed.map((e) => (
                  <ResolveCard key={e.id} escrow={e} onResolved={() => load()} />
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="stern-ops-rail">
          <section className="stern-ops-rail-section">
            <p className="stern-ops-kicker">{t("Authority")}</p>
            <h2>{t("Your roles")}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <Row label={t("Contract admin")} ok={session.isAdmin} />
              <Row label={t("Arbiter on escrows")} ok={mine.length > 0} note={String(mine.length)} />
            </ul>
          </section>

          {status ? (
            <section className="stern-ops-rail-section stern-ops-rail-health">
              <p className="stern-ops-kicker">{t("Live service")}</p>
              <h2>{t("Oracle health")}</h2>
              <dl className="mt-3 space-y-1.5 text-2xs">
                {status.chainId != null ? <Term label={t("Chain")} value={String(status.chainId)} /> : null}
                {status.contractAddress ? <Term label={t("Contract")} value={shortAddress(status.contractAddress)} /> : null}
              </dl>
              {verifiers.length ? (
                <ul className="mt-3 space-y-2 border-t border-sky pt-3">
                  {verifiers.map((v) => (
                    <li key={v.address || v.role} className="text-2xs">
                      <p className="font-mono uppercase text-ink-faint">{v.role || v.name}</p>
                      <p className="font-mono text-navy">{shortAddress(v.address)}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
      </div>
    </div>
  );
}

// Detail stays inside the distinct Ops surface. It intentionally does not use
// the company workspace's Particle session: this operator has already proved
// control of the institutional arbiter key when opening the Ops console.
function OpsEscrowDetail({ escrow, session, onBack, onReviewRecorded }) {
  const { t } = useLanguage();
  const [error, setError] = useState("");

  const recordReview = useCallback(async ({ escrowId, clauseId, verdict, reasoning }) => {
    setError("");
    try {
      const challenge = await getOpsClauseReviewChallenge(escrowId, clauseId);
      const signature = await signOpsMessage(challenge.message);
      await reviewOpsClause(escrowId, clauseId, {
        verdict,
        reasoning,
        challengeId: challenge.challengeId,
        signature
      });
      onReviewRecorded?.();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [onReviewRecorded]);

  return (
    <div className="stern-workspace-shell stern-ops min-h-dvh p-5 sm:p-6 lg:p-10">
      <div className="stern-workspace-page mx-auto max-w-[1180px]">
        <header className="stern-ops-masthead mb-8">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="stern-ops-back"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t("Back to arbiter escrows")}
            </button>
            <p className="stern-ops-kicker mt-6">{t("Arbiter review")}</p>
            <h1 className="stern-ops-title">
              {escrow.commodity}
            </h1>
            <p className="stern-ops-identity">
              &#8470; {String(escrow.id).padStart(4, "0")} · {escrow.containerRef}
            </p>
          </div>
          <div className="stern-ops-actions">
            <LanguageToggle compact />
            <ThemeToggle />
          </div>
        </header>

        {error ? (
          <p role="alert" className="stern-ops-alert stern-ops-alert-error mb-5">
            {error}
          </p>
        ) : null}

        <div className="stern-ops-detail-layout">
          <div className="space-y-5">
            <section className="stern-ops-trade-record">
              <div className="stern-ops-section-heading"><div><p className="stern-ops-kicker">{t("Trade record")}</p><h2>{t("Review context")}</h2></div></div>
              <dl className="stern-ops-record-grid">
                <Term label={t("Escrow state")} value={t(escrow.state)} />
                <Term label={t("Escrow value")} value={`${Number(escrow.value).toLocaleString("id-ID")} ${CURRENCY_LABEL}`} />
                <Term label={t("Container")} value={escrow.containerRef || t("not stated")} />
                <Term label={t("Arbiter")} value={shortAddress(escrow.arbiter)} />
              </dl>
            </section>

            <ClausePanel
              escrowId={escrow.id}
              walletAddress={session.address}
              onReview={recordReview}
              onStateChanged={onReviewRecorded}
            />
          </div>

          <aside className="stern-ops-authority">
            <p className="stern-ops-kicker">{t("Review authority")}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-dim">
              {t("This Ops session can review only clauses that name this arbiter address. Your verdict and written reason are recorded against the pinned instrument.")}
            </p>
            <p className="stern-ops-identity mt-5">{session.address}</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * One disputed escrow, and the arbiter's decision on it.
 *
 * Two questions, deliberately separated, because the contract separates them and
 * conflating them is how an arbiter gets it wrong:
 *
 *   1. Where does the escrow value go — exporter, or back to the importer?
 *   2. What happens to the 3% bond the challenger staked?
 *
 * A challenger who was right gets the bond back whichever way the value went.
 * The bond is only forfeited when the challenge itself was baseless, which is a
 * separate finding from who was owed the goods.
 */
function ResolveCard({ escrow, onResolved }) {
  const { t } = useLanguage();
  const [releaseToExporter, setReleaseToExporter] = useState(false);
  const [splitBps, setSplitBps] = useState(null);
  const [reasoningCid, setReasoningCid] = useState("");
  const [slashVerifier, setSlashVerifier] = useState(false);
  const [bondFrivolous, setBondFrivolous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  // What the two parties agreed between themselves, if they did. The arbiter
  // should see it before imposing a decision — that is the whole point of
  // letting them negotiate.
  const [agreement, setAgreement] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getNegotiation(escrow.id, { signal: controller.signal })
      .then((thread) => setAgreement(thread?.agreement || null))
      // A gateway without the negotiation routes, or none configured at all, is
      // not an error here: this card's own job is the binary decision.
      .catch(() => {});
    return () => controller.abort();
  }, [escrow.id]);

  async function executeAgreement() {
    setBusy(true);
    setError("");
    try {
      // Recheck both signatures and the live escrow value on the gateway just
      // before the institutional arbiter signs. Never trust displayed amounts.
      const verified = await verifyDisputeAgreement(escrow.id, agreement.proposalId);
      const res =
        (verified.outcome === "split" || String(escrow.id).startsWith("v3:"))
          ? await settleByAgreementAsArbiter(escrow.id, {
              amountToExporter: verified.amountToExporter,
              agreementCid: verified.agreementCid
            })
          : await resolveDisputeAsArbiter(escrow.id, {
              // The parties' own document is the reasoning. Nothing the arbiter
              // writes here would be more authoritative than what both of them
              // already signed.
              releaseToExporter: verified.outcome === "release_to_exporter",
              reasoningCid: verified.agreementCid,
              slashVerifier: false,
              bondFrivolous: false
            });
      setDone({ ...res, agreed: true });
      await onResolved?.();
    } catch (err) {
      setError(err?.shortMessage || err?.message || "The agreement could not be executed.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const total = BigInt(escrow.contractValue || 0);
      const share = splitBps == null ? 0n : total * BigInt(splitBps) / 10000n;
      if (splitBps != null && (share <= 0n || share >= total)) {
        throw new Error("Choose a split between 0.01% and 99.99% of the escrow value.");
      }
      const res = splitBps != null
        ? await resolveDisputeSplitAsArbiter(escrow.id, share, reasoningCid)
        : await resolveDisputeAsArbiter(escrow.id, {
            releaseToExporter, reasoningCid, slashVerifier, bondFrivolous
          });
      setDone(res);
      await onResolved?.();
    } catch (err) {
      setError(t(err?.shortMessage || err?.message || "The resolution could not be submitted."));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <li className="stern-ops-resolution stern-ops-resolution-done">
        <p className="font-serif text-sm text-state-attested">
          {done.agreed
            ? t("Settled on the agreement the parties reached themselves.")
            : splitBps != null ? t("Resolved with a split set by the arbiter.")
              : t("Resolved. Funds went to the {party}.", { party: t(releaseToExporter ? "exporter" : "importer") })}
        </p>
        <span className="mt-1 block"><TxLink hash={done.transactionHash} /></span>
      </li>
    );
  }

  return (
    <li className="stern-ops-resolution">
      <p className="text-sm font-medium text-navy">{escrow.commodity}</p>
      <p className="font-mono text-2xs text-ink-faint">
        &#8470; {String(escrow.id).padStart(4, "0")} ·{" "}
        {Number(escrow.value).toLocaleString("id-ID")} {CURRENCY_LABEL}
      </p>

      {/* The parties' own settlement, offered first.
          An arbiter who imposes a binary outcome over an agreement both sides
          already signed has overruled them for no reason, so this sits above
          the decision rather than beside it. A split the deployed contract
          cannot execute says so instead of offering a button that reverts. */}
      {agreement ? (
        <div className="stern-ops-agreement mt-4">
          <p className="font-mono text-2xs uppercase text-teal">
            {t("The parties agreed")} · {new Date(agreement.agreedAt).toLocaleString("id-ID")}
          </p>
          <p className="mt-1 font-serif text-xs leading-relaxed text-navy">
            {agreement.outcome === "split"
              ? t("Split — {amount} {currency} to the exporter, the rest back to the importer.", {
                  amount: (
                    Number(agreement.amountToExporter) / 10 ** Number(escrow.decimals ?? 2)
                  ).toLocaleString("id-ID"),
                  currency: CURRENCY_LABEL
                })
              : t(
                  agreement.outcome === "release_to_exporter"
                    ? "Release the full value to the exporter."
                    : "Refund the full value to the importer."
                )}
          </p>
          <p className="mt-1 font-serif text-xs leading-relaxed text-ink-dim">{agreement.note}</p>
          <p className="mt-1 truncate font-mono text-2xs text-ink-faint" title={agreement.cid || ""}>
            {agreement.cid || t("not pinned — no document to settle against")}
          </p>
          {agreement.executable && agreement.cid ? (
            <button
              type="button"
              onClick={executeAgreement}
              disabled={busy}
              className="stern-ops-primary-action mt-3 w-full"
            >
              {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
              {t(busy ? "Signing with your key…" : "Execute their agreement")}
            </button>
          ) : (
            <p className="mt-2 font-serif text-xs leading-relaxed text-state-pending">
              {agreement.blockedReason ||
                t("This agreement has no pinned document, so it cannot be settled against one.")}
            </p>
          )}
        </div>
      ) : null}

      <fieldset className="mt-3.5">
        <legend className="text-2xs uppercase text-ink-faint">
          {t(agreement ? "Or decide it yourself" : "Where the escrow value goes")}
        </legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { v: false, label: "Refund importer" },
            { v: true, label: "Release to exporter" }
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => { setReleaseToExporter(opt.v); setSplitBps(null); }}
              className={`stern-ops-decision-option ${
                splitBps == null && releaseToExporter === opt.v
                  ? "is-active"
                  : ""
              }`}
            >
              {t(opt.label)}
            </button>
          ))}
          {String(escrow.id).startsWith("v3:") ? (
            <button type="button" onClick={() => { setSplitBps(7000); setSlashVerifier(false); setBondFrivolous(false); }}
              className={`stern-ops-decision-option col-span-2 ${splitBps != null ? "is-active" : ""}`}>
              {t("Split based on evidence")}
            </button>
          ) : null}
        </div>
        {splitBps != null ? (
          <label className="mt-3 block text-xs text-navy">
            {t("Exporter share (%)")}
            <input type="number" min="0.01" max="99.99" step="0.01" value={(splitBps / 100).toFixed(2)}
              onChange={event => setSplitBps(Math.round(Number(event.target.value) * 100))}
              className="stern-ops-key-input mt-1" />
          </label>
        ) : null}
      </fieldset>

      <label className="mt-3 block text-2xs uppercase text-ink-faint">
        {t("Reasoning CID")}
        <input
          value={reasoningCid}
          onChange={(event) => setReasoningCid(event.target.value)}
          placeholder={t("bafy… — the contract refuses a decision without one")}
          className="stern-ops-key-input mt-1 font-mono text-xs normal-case"
        />
      </label>

      {splitBps == null ? <div className="mt-3 space-y-2">
        <label className="flex items-start gap-2 font-serif text-xs leading-relaxed text-ink-dim">
          <input
            type="checkbox"
            checked={slashVerifier}
            disabled={bondFrivolous}
            onChange={(event) => setSlashVerifier(event.target.checked)}
            className="mt-0.5 disabled:opacity-40"
          />
          <span>
            {t("The verifier was wrong — slash 50% of their bond")}
            <span className="block text-ink-faint">{t("70% to the importer, 30% to the treasury")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 font-serif text-xs leading-relaxed text-ink-dim">
          <input
            type="checkbox"
            checked={bondFrivolous}
            disabled={slashVerifier}
            onChange={(event) => setBondFrivolous(event.target.checked)}
            className="mt-0.5 disabled:opacity-40"
          />
          <span>
            {t("The challenge was baseless — the 3% bond is forfeited to the exporter")}
            <span className="block text-ink-faint">{t("Otherwise it returns to whoever raised it")}</span>
          </span>
        </label>
      </div> : null}

      {error ? (
        <p role="alert" className="mt-3 font-serif text-xs leading-relaxed text-state-disputed">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !reasoningCid.trim()}
        className="stern-ops-primary-action mt-4 w-full"
      >
        {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
        {t(busy ? "Signing with your key…" : "Sign decision")}
      </button>
    </li>
  );
}

function Row({ label, ok, note }) {
  const { t } = useLanguage();
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-navy">{label}</span>
      <span className={`stern-ops-role-state ${ok ? "is-active" : ""}`}>
        {ok ? <ShieldCheck size={10} aria-hidden="true" /> : null}
        {note ?? t(ok ? "yes" : "no")}
      </span>
    </li>
  );
}

function Term({ label, value }) {
  return (
    <div className="stern-ops-term">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
