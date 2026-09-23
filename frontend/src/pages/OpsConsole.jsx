import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { closeOpsSession, getOpsSession, openOpsSession, arbitratedBy, resolveDisputeAsArbiter } from "../lib/opsAuth.js";
import TxLink from "../components/TxLink.jsx";
import { loadEscrowRows, sourceIsLive } from "../lib/escrowSource.js";
import { getOracleStatus, getVerifiers } from "../lib/sternApi.js";
import { shortAddress } from "../lib/actors.js";
import { CURRENCY_LABEL } from "../lib/currency.js";

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
    <div className="chrome-dark flex min-h-dvh items-center justify-center bg-onyx p-8">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onExit}
          className="mb-6 flex cursor-pointer items-center gap-1.5 text-sm text-alabaster/70 transition-colors duration-150 hover:text-alabaster"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to STERN
        </button>

        <p className="text-2xs uppercase tracking-macro text-teal">Operations</p>
        <h1 className="mt-3 text-[30px] font-medium leading-tight tracking-display text-alabaster">
          Arbiter &amp; admin console
        </h1>
        <p className="mt-3 font-serif text-sm leading-relaxed text-alabaster/80">
          Institutional keys sign in here, not through Particle. Signature checks stay on plain
          ecrecover, and an arbiter needs a key it is accountable for rather than one recoverable
          by email.
        </p>

        <form onSubmit={submit} className="mt-7">
          <label htmlFor="opskey" className="text-2xs uppercase text-alabaster/70">
            Private key
          </label>
          <input
            id="opskey"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="0x…"
            spellCheck="false"
            autoComplete="off"
            className="mt-2 w-full rounded-panel border border-alabaster/25 bg-alabaster/[0.06] px-3.5 py-2.5 text-sm text-alabaster placeholder:text-alabaster/40 focus:border-teal focus:outline-none"
          />

          {error ? (
            <p role="alert" className="mt-3 rounded-panel border border-state-disputed/45 bg-state-disputed/10 px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-disputed">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !key.trim()}
            className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-alabaster py-3 text-sm font-medium text-onyx transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <KeyRound size={14} aria-hidden="true" />}
            {busy ? "Checking roles on chain…" : "Open console"}
          </button>
        </form>

        {/* Stated plainly rather than buried. An operator should know exactly
            what happens to the key they just typed. */}
        <div className="mt-7 rounded-doc border border-state-pending/40 bg-state-pending/[0.08] p-4">
          <p className="flex items-center gap-1.5 text-2xs uppercase text-state-pending">
            <AlertTriangle size={12} aria-hidden="true" />
            What happens to this key
          </p>
          <ul className="mt-2.5 space-y-1.5 font-serif text-xs leading-relaxed text-alabaster/80">
            <li>Held in memory for this tab only. A reload wipes it.</li>
            <li>Never stored, never put in a URL, never sent to the backend.</li>
            <li>Signing happens locally in your browser.</li>
            <li>
              Testnet only. Treat any key used here as exposed, and never reuse it on mainnet.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function OpsDashboard({ session, onClose, onExit }) {
  const [escrows, setEscrows] = useState([]);
  const [status, setStatus] = useState(null);
  const [verifiers, setVerifiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="stern-workspace-shell min-h-dvh p-5 sm:p-6 lg:p-10">
      <div className="stern-workspace-page mx-auto max-w-[1480px]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xs uppercase text-ink-faint">Operations console</p>
          <h1 className="mt-1.5 text-[28px] font-bold leading-none tracking-display text-navy">
            {session.isAdmin ? "Arbiter & admin" : "Arbiter"}
          </h1>
          <p className="mt-2 font-mono text-xs text-ink-dim">{session.address}</p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onExit}
            className="cursor-pointer rounded-panel border border-sky bg-surface px-5 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/40"
          >
            Back to STERN
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex cursor-pointer items-center gap-2 rounded-panel bg-navy px-5 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal-solid"
          >
            <LogOut size={13} aria-hidden="true" />
            End session
          </button>
        </div>
      </header>

      {session.adminCheckFailed ? (
        <p className="mb-5 rounded-panel border border-state-pending/40 bg-state-pending/10 px-4 py-3 font-serif text-xs leading-relaxed text-state-pending">
          Signed in, but the admin role could not be checked: {session.adminCheckFailed} This is a
          connectivity problem, not a permissions one.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-5 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-4 py-3 font-serif text-xs text-state-disputed">
          {error}
        </p>
      ) : null}

      {!sourceIsLive ? (
        <p className="mb-5 rounded-panel bg-sky/25 px-4 py-3 font-serif text-xs leading-relaxed text-ink-dim">
          No gateway configured, so this console has nothing live to read. Set VITE_ORACLE_API.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="stern-workspace-card rounded-doc bg-surface p-6 shadow-card">
          <h2 className="text-2xs uppercase text-ink-faint">
            Escrows you arbitrate ({mine.length})
          </h2>

          {loading ? (
            <p className="mt-3 flex items-center gap-2 font-serif text-sm text-ink-dim">
              <Loader2 size={14} className="animate-spin text-teal" aria-hidden="true" />
              Reading the registry…
            </p>
          ) : mine.length === 0 ? (
            <p className="mt-3 font-serif text-sm leading-relaxed text-ink-dim">
              This address is not the appointed arbiter on any escrow yet. The arbiter is named when
              an escrow is created, so it can only appear here after the fact.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-sky">
              {mine.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 py-3">
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
                    <p className="font-mono text-2xs uppercase text-ink-faint">{e.state}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Was a notice saying resolution happens elsewhere. An arbiter who has
              just typed their private key into this page has, by definition, the
              authority to decide — sending them to a backend service was the
              console refusing to do the one thing it exists for. */}
          {disputed.length > 0 ? (
            <div className="mt-5 border-t border-sky pt-5">
              <h3 className="text-2xs uppercase text-state-disputed">
                Awaiting your decision ({disputed.length})
              </h3>
              <ul className="mt-3 space-y-4">
                {disputed.map((e) => (
                  <ResolveCard key={e.id} escrow={e} onResolved={() => load()} />
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-5">
          <section className="stern-workspace-card rounded-doc bg-surface p-6 shadow-card">
            <h2 className="text-2xs uppercase text-ink-faint">Your roles</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <Row label="Contract admin" ok={session.isAdmin} />
              <Row label="Arbiter on escrows" ok={mine.length > 0} note={String(mine.length)} />
            </ul>
          </section>

          {status ? (
            <section className="stern-workspace-card rounded-doc bg-surface p-6 shadow-card">
              <h2 className="text-2xs uppercase text-ink-faint">Oracle health</h2>
              <dl className="mt-3 space-y-1.5 text-2xs">
                {status.chainId != null ? <Term label="Chain" value={String(status.chainId)} /> : null}
                {status.contractAddress ? <Term label="Contract" value={shortAddress(status.contractAddress)} /> : null}
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
  const [releaseToExporter, setReleaseToExporter] = useState(false);
  const [reasoningCid, setReasoningCid] = useState("");
  const [slashVerifier, setSlashVerifier] = useState(false);
  const [bondFrivolous, setBondFrivolous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await resolveDisputeAsArbiter(escrow.id, {
        releaseToExporter,
        reasoningCid,
        slashVerifier,
        bondFrivolous
      });
      setDone(res);
      await onResolved?.();
    } catch (err) {
      setError(err?.shortMessage || err?.message || "The resolution could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <li className="rounded-panel border border-state-attested/40 bg-state-attested/10 px-4 py-3">
        <p className="font-serif text-sm text-state-attested">
          Resolved. Funds went to the {releaseToExporter ? "exporter" : "importer"}.
        </p>
        <span className="mt-1 block"><TxLink hash={done.transactionHash} /></span>
      </li>
    );
  }

  return (
    <li className="rounded-panel border border-state-disputed/35 bg-state-disputed/[0.05] px-4 py-4">
      <p className="text-sm font-medium text-navy">{escrow.commodity}</p>
      <p className="font-mono text-2xs text-ink-faint">
        &#8470; {String(escrow.id).padStart(4, "0")} ·{" "}
        {Number(escrow.value).toLocaleString("id-ID")} {CURRENCY_LABEL}
      </p>

      <fieldset className="mt-3.5">
        <legend className="text-2xs uppercase text-ink-faint">Where the escrow value goes</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { v: false, label: "Refund importer" },
            { v: true, label: "Release to exporter" }
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => setReleaseToExporter(opt.v)}
              className={`cursor-pointer rounded-panel border px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                releaseToExporter === opt.v
                  ? "border-navy bg-navy text-beige"
                  : "border-sky bg-surface text-navy hover:border-teal/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 block text-2xs uppercase text-ink-faint">
        Reasoning CID
        <input
          value={reasoningCid}
          onChange={(event) => setReasoningCid(event.target.value)}
          placeholder="bafy… — the contract refuses a decision without one"
          className="mt-1 block w-full rounded-panel border border-sky bg-surface px-3 py-2 font-mono text-xs normal-case text-navy"
        />
      </label>

      <div className="mt-3 space-y-2">
        <label className="flex items-start gap-2 font-serif text-xs leading-relaxed text-ink-dim">
          <input
            type="checkbox"
            checked={slashVerifier}
            disabled={bondFrivolous}
            onChange={(event) => setSlashVerifier(event.target.checked)}
            className="mt-0.5 disabled:opacity-40"
          />
          <span>
            The verifier was wrong — slash 50% of their bond
            <span className="block text-ink-faint">70% to the importer, 30% to the treasury</span>
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
            The challenge was baseless — the 3% bond is forfeited to the exporter
            <span className="block text-ink-faint">Otherwise it returns to whoever raised it</span>
          </span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-3 font-serif text-xs leading-relaxed text-state-disputed">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !reasoningCid.trim()}
        className="mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-panel bg-navy py-2.5 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
        {busy ? "Signing with your key…" : "Sign decision"}
      </button>
    </li>
  );
}

function Row({ label, ok, note }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-navy">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-2xs uppercase ${
          ok ? "bg-state-attested/10 text-state-attested" : "bg-sky/30 text-ink-dim"
        }`}
      >
        {ok ? <ShieldCheck size={10} aria-hidden="true" /> : null}
        {note ?? (ok ? "yes" : "no")}
      </span>
    </li>
  );
}

function Term({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-mono uppercase text-ink-faint">{label}</dt>
      <dd className="font-mono text-navy">{value}</dd>
    </div>
  );
}
