import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import AppShell from "../components/AppShell.jsx";
import { Button, Card, CardTitle, Notice, Tag, TermRow } from "../components/ui.jsx";
import { closeOpsSession, getOpsSession, openOpsSession, arbitratedBy } from "../lib/opsAuth.js";
import { loadEscrowRows, sourceIsLive } from "../lib/escrowSource.js";
import { getOracleStatus, getVerifiers } from "../lib/sternApi.js";
import { shortAddress } from "../lib/actors.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { formatEscrowId } from "../lib/escrowState.js";

// A restricted surface for the arbiter and the contract admin. It is a separate
// route with its own session, because those two hold institutional keys and sign
// in with them — mixing the two would put a private-key field in front of
// ordinary users who must never see one.
//
// It is not, however, a separate product. Once the session is open the console
// renders inside the same AppShell as every other authenticated page, with an
// "Elevated session" marker in the header. The sign-in gate stays full-screen
// and pinned to the dark chrome so that the one screen where a key is typed is
// unmistakably not the workspace.
export default function OpsConsole({ shellProps, onExit }) {
  const [session, setSession] = useState(() => getOpsSession());

  if (!session) return <OpsLogin onOpen={setSession} onExit={onExit} />;
  return (
    <OpsDashboard
      session={session}
      shellProps={shellProps}
      onClose={() => {
        closeOpsSession();
        setSession(null);
      }}
      onExit={onExit}
    />
  );
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
    <div className="chrome-dark flex min-h-dvh items-center justify-center bg-onyx p-6 lg:p-8">
      <div className="w-full max-w-md">
        <Button icon={ArrowLeft} tone="ghost" size="sm" onClick={onExit} className="-ml-3.5 mb-6">
          Back to STERN
        </Button>

        <p className="text-2xs font-semibold uppercase tracking-micro text-teal">Operations</p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight text-alabaster">
          Arbiter and admin console
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-dim">
          Institutional keys sign in here, not through Particle. Signature checks stay on plain
          ecrecover, and an arbiter needs a key it is accountable for rather than one recoverable
          by email.
        </p>

        <form onSubmit={submit} className="mt-7">
          <label htmlFor="opskey" className="mb-1.5 block text-[13px] font-medium text-alabaster">
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
            className="w-full rounded-panel border border-sky bg-surface px-3.5 py-2.5 font-mono text-sm text-alabaster placeholder:text-ink-faint focus:border-teal focus:outline-none"
          />

          {error ? (
            <Notice tone="disputed" role="alert" className="mt-3">
              {error}
            </Notice>
          ) : null}

          <Button
            type="submit"
            tone="primary"
            size="lg"
            full
            busy={busy}
            disabled={busy || !key.trim()}
            icon={KeyRound}
            className="mt-5"
          >
            {busy ? "Checking roles on chain…" : "Open console"}
          </Button>
        </form>

        {/* Stated plainly rather than buried. An operator should know exactly
            what happens to the key they just typed. */}
        <div className="mt-7 rounded-doc border border-state-pending/40 bg-state-pending/[0.08] p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-state-pending">
            <AlertTriangle size={14} aria-hidden="true" />
            What happens to this key
          </p>
          <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-ink-dim">
            <li>Held in memory for this tab only. A reload wipes it.</li>
            <li>Never stored, never put in a URL, never sent to the backend.</li>
            <li>Signing happens locally in your browser.</li>
            <li>Testnet only. Treat any key used here as exposed, and never reuse it on mainnet.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function OpsDashboard({ session, shellProps, onClose, onExit }) {
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
    <AppShell
      {...shellProps}
      elevated
      breadcrumb={[{ label: "Environment" }, { label: "Operations console" }]}
      title={session.isAdmin ? "Arbiter and admin" : "Arbiter"}
      subtitle={session.address}
      actions={
        <>
          <Button onClick={onExit}>Back to workspace</Button>
          <Button tone="primary" icon={LogOut} onClick={onClose}>
            End session
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {session.adminCheckFailed ? (
          <Notice tone="pending">
            Signed in, but the admin role could not be checked: {session.adminCheckFailed} This is a
            connectivity problem, not a permissions one.
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="disputed" role="alert">
            {error}
          </Notice>
        ) : null}

        {!sourceIsLive ? (
          <Notice>
            No gateway configured, so this console has nothing live to read. Set{" "}
            <code className="font-mono text-[12px]">VITE_ORACLE_API</code>.
          </Notice>
        ) : null}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardTitle
              hint="The arbiter is named when an escrow is created, so it can only appear here after the fact."
              action={<Tag tone="neutral">{mine.length} assigned</Tag>}
            >
              Escrows you arbitrate
            </CardTitle>

            {loading ? (
              <p className="flex items-center gap-2 text-[14px] text-ink-dim">
                <Loader2 size={14} className="animate-spin text-teal" aria-hidden="true" />
                Reading the registry…
              </p>
            ) : mine.length === 0 ? (
              <p className="text-[14px] leading-relaxed text-ink-dim">
                This address is not the appointed arbiter on any escrow yet.
              </p>
            ) : (
              <ul className="divide-y divide-sky/70">
                {mine.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-navy">{e.commodity}</p>
                      <p className="truncate font-mono text-2xs text-ink-faint">
                        &#8470; {formatEscrowId(e.id)} · {e.containerRef}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-medium tabular-nums text-navy">
                        {Number(e.value).toLocaleString("id-ID")} {CURRENCY_LABEL}
                      </p>
                      <p className="text-2xs text-ink-faint">{e.state}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {disputed.length > 0 ? (
              <Notice tone="disputed" className="mt-4">
                {disputed.length} escrow{disputed.length > 1 ? "s" : ""} awaiting your resolution.
                Resolution is submitted by the backend arbiter service — this console shows the
                state, it does not sign the resolution for you.
              </Notice>
            ) : null}
          </Card>

          <aside className="flex flex-col gap-5">
            <Card>
              <CardTitle>Your roles</CardTitle>
              <ul className="divide-y divide-sky/70">
                <RoleRow label="Contract admin" ok={session.isAdmin} />
                <RoleRow
                  label="Arbiter on escrows"
                  ok={mine.length > 0}
                  note={String(mine.length)}
                />
              </ul>
            </Card>

            {status ? (
              <Card>
                <CardTitle>Oracle health</CardTitle>
                <div className="divide-y divide-sky/70">
                  {status.chainId != null ? (
                    <TermRow label="Chain" value={String(status.chainId)} />
                  ) : null}
                  {status.contractAddress ? (
                    <TermRow label="Contract" value={shortAddress(status.contractAddress)} />
                  ) : null}
                </div>
                {verifiers.length ? (
                  <ul className="mt-3 space-y-2 border-t border-sky pt-3">
                    {verifiers.map((v) => (
                      <li key={v.address || v.role}>
                        <p className="text-2xs text-ink-faint">
                          {String(v.role || v.name || "").replace(/_/g, " ")}
                        </p>
                        <p className="font-mono text-[12px] text-navy">{shortAddress(v.address)}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function RoleRow({ label, ok, note }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[14px] text-navy">{label}</span>
      <Tag tone={ok ? "attested" : "neutral"} icon={ok ? ShieldCheck : undefined}>
        {note ?? (ok ? "Granted" : "Not granted")}
      </Tag>
    </li>
  );
}
