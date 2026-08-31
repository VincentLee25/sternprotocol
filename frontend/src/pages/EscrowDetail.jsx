import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Loader2, Scale, Undo2, Upload } from "lucide-react";
import StatusPill from "../components/StatusPill.jsx";
import Timeline from "../components/Timeline.jsx";
import ActivityLog from "../components/ActivityLog.jsx";
import { inputClass } from "../components/Field.jsx";
import { actorById, shortAddress } from "../lib/actors.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { formatEscrowId } from "../lib/escrowState.js";
import { MILESTONES, nextMilestone } from "../lib/milestones.js";
import {
  getEscrow,
  getActivity,
  uploadMilestoneProof,
  submitMilestoneProof,
  initiateTimelock,
  releasePayment,
  claimRefund,
  previewDisputeBond,
  raiseDispute,
  getDispute,
  resolveDispute
} from "../lib/mockRegistry.js";

function formatCountdown(ms) {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const PERMISSIONS = {
  importer: { dispute: true, refund: true },
  exporter: { dispute: true, refund: false },
  arbiter: { dispute: false, refund: false, resolve: true }
};

const panel = "rounded-doc bg-white p-6 shadow-card";
const label2xs = "font-mono text-2xs uppercase text-ink-faint";

export default function EscrowDetail({ escrowId, role, onBack }) {
  const [escrow, setEscrow] = useState(null);
  const [activity, setActivity] = useState([]);
  const [dispute, setDispute] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [proofFile, setProofFile] = useState(null);
  const [gatePass, setGatePass] = useState(true);
  const [disputeMilestone, setDisputeMilestone] = useState("none");
  const [disputePreview, setDisputePreview] = useState(null);
  const [resolution, setResolution] = useState({ releaseToExporter: true, reasoningCid: "", slashVerifier: false, bondFrivolous: false });

  const actor = actorById(role);
  const permissions = PERMISSIONS[role] || { dispute: false, refund: false };

  const load = useCallback(async () => {
    const [e, a] = await Promise.all([getEscrow(escrowId), getActivity(escrowId)]);
    setEscrow(e);
    setActivity(a.activity);
    if (e.dispute.open) setDispute(await getDispute(escrowId));
    else setDispute(null);
  }, [escrowId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadDisputePreview(milestone) {
    setDisputeMilestone(milestone);
    const preview = await previewDisputeBond(escrowId, milestone);
    setDisputePreview(preview);
  }

  useEffect(() => {
    if (!escrow || escrow.state === "Disputed" || escrow.state === "Completed" || escrow.state === "Refunded") return;
    const disputable = escrow.state === "TimelockActive"
      ? "none"
      : [...MILESTONES].reverse().find((m) => escrow.milestones[m.key].submitted)?.key;
    if (disputable) loadDisputePreview(disputable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrow?.state]);

  function fail(text) {
    setMessage({ tone: "fail", text });
  }
  function ok(text) {
    setMessage({ tone: "ok", text });
  }

  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (error) {
      fail(error.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(meta) {
    if (!proofFile) {
      fail("Attach a proof document first.");
      return;
    }
    const { cid } = await uploadMilestoneProof(proofFile);
    const result = await submitMilestoneProof(escrowId, {
      milestone: meta.key,
      proofCid: cid,
      verifierAddress: actor.address,
      automatedCheckPassed: gatePass,
      automatedCheckReason: gatePass ? undefined : "Simulated automated-feed mismatch (demo toggle)."
    });
    if (result.status === "rejected") {
      fail(`Automated gate rejected: ${result.automatedCheck.reason}`);
      return;
    }
    setProofFile(null);
    ok(`${meta.label} verified by ${actor.label} — challenge window open until ${new Date(result.challengeDeadline).toLocaleString("id-ID")}.`);
  }

  async function onInitiateTimelock() {
    const result = await initiateTimelock(escrowId);
    ok(`Timelock started — release eligible at ${new Date(result.releaseAt).toLocaleString("id-ID")}.`);
  }

  async function onRelease() {
    await releasePayment(escrowId);
    ok(`${Number(escrow.value).toLocaleString("id-ID")} ${CURRENCY_LABEL} released to exporter.`);
  }

  async function onRefund() {
    await claimRefund(escrowId, actor.address);
    ok("Refund claimed — global deadline had passed.");
  }

  async function onRaiseDispute() {
    if (!disputePreview) {
      fail("Pick which milestone you're disputing first.");
      return;
    }
    await raiseDispute(escrowId, { raisedBy: actor.address, contestedMilestone: disputeMilestone, bondAmount: disputePreview.disputeBondAmount });
    setDisputePreview(null);
    ok(`Dispute raised — ${disputePreview.disputeBondAmount} IDRT-demo bond locked.`);
  }

  async function onResolveDispute() {
    if (!resolution.reasoningCid.trim()) {
      fail("A reasoning document reference is required to resolve a dispute.");
      return;
    }
    await resolveDispute(escrowId, resolution);
    ok(`Dispute resolved — ${resolution.releaseToExporter ? "released to exporter" : "refunded to importer"}.`);
  }

  const terminal = escrow?.state === "Completed" || escrow?.state === "Refunded";
  const deadlinePassed = escrow?.globalDeadline ? now > new Date(escrow.globalDeadline).getTime() : false;
  const upcoming = escrow ? nextMilestone(escrow.state) : null;
  const canActAsUpcomingVerifier = upcoming && actor.milestone === upcoming.key;

  const timelockReleaseAt = escrow?.timelock.releaseAt ? new Date(escrow.timelock.releaseAt).getTime() : null;
  const timelockEligible = escrow?.state === "TimelockActive" && timelockReleaseAt !== null && now >= timelockReleaseAt;

  const finalMilestoneChallenge = escrow?.milestones.arrivedCleared.challengeDeadline
    ? new Date(escrow.milestones.arrivedCleared.challengeDeadline).getTime()
    : null;
  const canInitiateTimelock = escrow?.state === "ArrivedCleared" && finalMilestoneChallenge !== null && now >= finalMilestoneChallenge;

  const messageTone = useMemo(
    () => ({ ok: "border-state-attested/40 bg-state-attested/10 text-state-attested", fail: "border-state-disputed/40 bg-state-disputed/10 text-state-disputed" })[message?.tone] || "",
    [message]
  );

  if (!escrow) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 size={20} className="animate-spin text-teal" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-sm text-teal transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to escrows
      </button>

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-sky pb-5">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-medium text-navy">Escrow &#8470;&thinsp;{formatEscrowId(escrow.escrowId)}</h1>
          <StatusPill state={escrow.state} />
        </div>
        <div className="text-right">
          <p className={label2xs}>Locked value</p>
          <p className="font-mono text-base font-medium text-navy">
            {Number(escrow.value).toLocaleString("id-ID")} {CURRENCY_LABEL}
          </p>
        </div>
      </header>

      <div className="mb-6 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Commodity" value={escrow.commodity} />
        <Meta label="Container" value={escrow.containerRef} mono />
        <Meta label="Document CID" value={escrow.documentCid} mono truncate />
        <Meta
          label="Global deadline"
          value={`${new Date(escrow.globalDeadline).toLocaleString("id-ID")}${deadlinePassed && !terminal ? " · passed" : ""}`}
          warn={deadlinePassed && !terminal}
        />
      </div>

      {message ? <div role="status" className={`mb-6 rounded-panel border px-4 py-3 font-serif text-sm ${messageTone}`}>{message.text}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[240px_1fr_300px]">
        {/* Lifecycle */}
        <section>
          <p className={`mb-2.5 ${label2xs}`}>Lifecycle</p>
          <div className={panel}>
            <Timeline state={escrow.state} />
          </div>
        </section>

        {/* Milestones */}
        <section>
          <p className={`mb-2.5 ${label2xs}`}>Milestone verification</p>
          <div className="space-y-4">
            {MILESTONES.map((meta) => {
              const proof = escrow.milestones[meta.key];
              const isUpcoming = upcoming?.key === meta.key;
              const challengeMs = proof.challengeDeadline ? new Date(proof.challengeDeadline).getTime() - now : null;

              return (
                <div key={meta.key} className={panel}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-2xs ${
                          proof.submitted
                            ? "border-state-attested bg-state-attested text-white"
                            : isUpcoming
                              ? "border-state-pending bg-state-pending text-white"
                              : "border-sky bg-white text-ink-dim"
                        }`}
                      >
                        {proof.submitted ? <Check size={13} aria-hidden="true" /> : meta.index}
                      </span>
                      <div>
                        <p className="text-[15px] font-medium tracking-[-0.015em] text-navy">{meta.label}</p>
                        <p className="font-serif text-xs text-ink-dim">{meta.institution} &middot; {meta.gate}</p>
                      </div>
                    </div>
                    <span className={`font-mono text-2xs uppercase ${proof.submitted ? "text-state-attested" : isUpcoming ? "text-state-pending" : "text-ink-faint"}`}>
                      {proof.submitted ? "verified" : isUpcoming ? "up next" : "pending"}
                    </span>
                  </div>

                  {proof.submitted ? (
                    <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-panel bg-beige px-3.5 py-3 text-xs text-ink-dim">
                      <span>Verifier: <span className="text-navy">{proof.verifierName}</span></span>
                      <span>Proof CID: <span className="font-mono text-navy">{proof.proofCid.slice(0, 16)}…</span></span>
                      <span className="col-span-2 flex items-center gap-1.5">
                        <Clock size={11} aria-hidden="true" />
                        {challengeMs > 0 ? `Challenge window closes in ${formatCountdown(challengeMs)}` : "Challenge window closed"}
                      </span>
                    </div>
                  ) : isUpcoming && canActAsUpcomingVerifier ? (
                    <div className="mt-3.5 space-y-2.5 rounded-panel border border-teal/30 bg-teal/[0.06] p-3.5">
                      <p className="font-serif text-xs text-teal">Signing as {actor.label} — submit this milestone&rsquo;s proof.</p>
                      <label className="flex cursor-pointer items-center gap-2 rounded-panel border border-dashed border-teal/50 bg-white px-3 py-2 text-xs text-ink-dim hover:border-teal">
                        <Upload size={13} aria-hidden="true" />
                        {proofFile ? proofFile.name : "Attach inspection proof (PDF, photo, certificate)"}
                        <input type="file" className="sr-only" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                      </label>
                      <label className="flex items-center gap-2 font-serif text-xs text-ink-dim">
                        <input type="checkbox" checked={gatePass} onChange={(e) => setGatePass(e.target.checked)} />
                        Automated data feed matches ({meta.gate}) — uncheck to simulate a gate rejection
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => submitVerification(meta))}
                        className="w-full cursor-pointer rounded-full bg-teal py-2 text-xs font-medium text-white transition-colors duration-150 hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Submit verification
                      </button>
                    </div>
                  ) : isUpcoming ? (
                    <p className="mt-3.5 font-serif text-xs leading-relaxed text-ink-dim">
                      Waiting on {meta.institution} — switch actor in the sidebar to preview their view.
                    </p>
                  ) : null}
                </div>
              );
            })}

            {escrow.state === "ArrivedCleared" ? (
              <div className={panel}>
                <p className="font-serif text-sm text-ink-dim">
                  All three milestones verified. Timelock can start once the final challenge window closes.
                </p>
                <button
                  type="button"
                  disabled={busy || !canInitiateTimelock}
                  onClick={() => run(onInitiateTimelock)}
                  className="mt-3 w-full cursor-pointer rounded-full border border-teal/50 py-2 text-xs font-medium text-teal transition-colors duration-150 hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {canInitiateTimelock ? "Start 24h timelock" : "Waiting for challenge window to close"}
                </button>
              </div>
            ) : null}

            {escrow.state === "TimelockActive" ? (
              <div className={`${panel} border border-state-pending/30`}>
                <p className="flex items-center gap-1.5 text-sm font-medium text-state-pending">
                  <Clock size={14} aria-hidden="true" />
                  {timelockEligible ? "Timelock elapsed — release is eligible" : `Release eligible in ${formatCountdown(timelockReleaseAt - now)}`}
                </p>
                <p className="mt-1 font-serif text-xs text-ink-dim">Permissionless — anyone can trigger release once the timelock elapses.</p>
                <button
                  type="button"
                  disabled={busy || !timelockEligible}
                  onClick={() => run(onRelease)}
                  className="mt-3 w-full cursor-pointer rounded-full bg-navy py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Release payment
                </button>
              </div>
            ) : null}
          </div>

          <div className={`mt-5 ${panel}`}>
            <p className={label2xs}>Activity</p>
            <div className="mt-3">
              <ActivityLog entries={activity} />
            </div>
          </div>
        </section>

        {/* Actions */}
        <section>
          <p className={`mb-2.5 ${label2xs}`}>Actions &middot; {actor.label}</p>
          <div className={`space-y-2.5 ${panel}`}>
            <button
              type="button"
              disabled={busy || terminal || !permissions.refund || !deadlinePassed}
              title={!permissions.refund ? "Only the importer can claim a refund" : !deadlinePassed ? "Available after the global deadline passes" : undefined}
              onClick={() => run(onRefund)}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-sky py-2.5 text-xs font-medium text-ink-dim transition-colors duration-150 hover:text-navy disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Undo2 size={13} aria-hidden="true" />
              Claim refund
            </button>

            {!terminal && escrow.state !== "Disputed" && permissions.dispute ? (
              <div className="rounded-panel border border-state-pending/30 bg-state-pending/[0.06] p-3.5">
                <p className="flex items-center gap-1.5 font-mono text-2xs uppercase text-state-pending">
                  <Scale size={12} aria-hidden="true" />
                  Raise dispute
                </p>
                <select
                  value={disputeMilestone}
                  onChange={(e) => loadDisputePreview(e.target.value)}
                  className={`${inputClass(false)} mt-2 text-xs`}
                >
                  {escrow.state === "TimelockActive" ? <option value="none">General (timelock stage)</option> : null}
                  {MILESTONES.filter((m) => escrow.milestones[m.key].submitted).map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
                {disputePreview ? (
                  <p className="mt-2 font-serif text-xs text-ink-dim">
                    Bond required: <span className="font-mono text-navy">{Number(disputePreview.disputeBondAmount).toLocaleString("id-ID")} {CURRENCY_LABEL}</span>
                    {!disputePreview.windowStillOpen ? <span className="block text-state-disputed">Challenge window for this milestone has closed.</span> : null}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={busy || !disputePreview || (disputePreview && !disputePreview.windowStillOpen)}
                  onClick={() => run(onRaiseDispute)}
                  className="mt-2.5 w-full cursor-pointer rounded-full border border-state-pending/50 py-1.5 text-xs font-medium text-state-pending transition-colors duration-150 hover:bg-state-pending/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Lock bond &amp; raise dispute
                </button>
              </div>
            ) : null}
          </div>

          {escrow.state === "Disputed" && dispute ? (
            <div className={`mt-5 ${panel} border border-state-disputed/30`}>
              <p className="flex items-center gap-1.5 font-mono text-2xs uppercase text-state-disputed">
                <Scale size={12} aria-hidden="true" />
                Dispute open
              </p>
              <div className="mt-2.5 space-y-1 font-serif text-xs text-ink-dim">
                <p>Raised by <span className="font-mono text-navy">{shortAddress(dispute.raisedBy)}</span></p>
                <p>Contested: <span className="text-navy">{dispute.contestedMilestone}</span></p>
                <p>Bond locked: <span className="font-mono text-navy">{Number(dispute.bondAmount).toLocaleString("id-ID")} {CURRENCY_LABEL}</span></p>
              </div>

              {permissions.resolve ? (
                <div className="mt-3.5 space-y-2.5 border-t border-state-disputed/20 pt-3.5">
                  <p className="text-xs font-medium text-navy">Arbiter decision</p>
                  <div className="flex gap-2 text-xs">
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-sky py-1.5 has-[:checked]:border-state-attested has-[:checked]:bg-state-attested/10 has-[:checked]:text-state-attested">
                      <input type="radio" name="resolution" className="sr-only" checked={resolution.releaseToExporter} onChange={() => setResolution((r) => ({ ...r, releaseToExporter: true }))} />
                      Release to exporter
                    </label>
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-sky py-1.5 has-[:checked]:border-state-disputed has-[:checked]:bg-state-disputed/10 has-[:checked]:text-state-disputed">
                      <input type="radio" name="resolution" className="sr-only" checked={!resolution.releaseToExporter} onChange={() => setResolution((r) => ({ ...r, releaseToExporter: false }))} />
                      Refund importer
                    </label>
                  </div>
                  <input
                    value={resolution.reasoningCid}
                    onChange={(e) => setResolution((r) => ({ ...r, reasoningCid: e.target.value }))}
                    placeholder="Reasoning document CID"
                    className={`${inputClass(false)} text-xs`}
                  />
                  <label className="flex items-center gap-1.5 font-serif text-xs text-ink-dim">
                    <input type="checkbox" checked={resolution.slashVerifier} onChange={(e) => setResolution((r) => ({ ...r, slashVerifier: e.target.checked }))} />
                    Slash the disputed milestone&rsquo;s verifier (fraud proven)
                  </label>
                  <label className="flex items-center gap-1.5 font-serif text-xs text-ink-dim">
                    <input type="checkbox" checked={resolution.bondFrivolous} onChange={(e) => setResolution((r) => ({ ...r, bondFrivolous: e.target.checked }))} />
                    Dispute was frivolous (buyer bond forfeited)
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(onResolveDispute)}
                    className="w-full cursor-pointer rounded-full bg-navy py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Resolve dispute
                  </button>
                </div>
              ) : (
                <p className="mt-2.5 font-serif text-xs text-ink-dim">Waiting for the arbiter to resolve.</p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Meta({ label, value, mono, truncate, warn }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-2xs uppercase text-ink-faint">{label}</p>
      <p
        className={`mt-0.5 ${mono ? "font-mono text-xs" : "font-serif text-sm"} ${warn ? "text-state-disputed" : "text-ink-dim"} ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
