import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  Scale,
  Undo2,
  X
} from "lucide-react";
import ActivityLog from "../components/ActivityLog.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Timeline from "../components/Timeline.jsx";
import EvidencePanel from "../components/EvidencePanel.jsx";
import { inputClass } from "../components/Field.jsx";
import { getBrowserContract } from "../lib/contract.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { CONSORTIUM, defaultConsortium } from "../lib/oracles.js";
import { shortAddress } from "../lib/actors.js";
import { eblDocumentUrl, getTimelock, getVerifiers } from "../lib/sternApi.js";
import { shortCid } from "../lib/ebl.js";
import { ROLE, ROLE_LABEL, roleOnEscrow } from "../lib/roles.js";
import { raiseDisputeAsUser } from "../lib/disputeFlow.js";
import {
  approveExtensionAsUser,
  claimRefundAsUser,
  initiateTimelockAsUser,
  proposeExtensionAsUser,
  readPendingExtension,
  releasePaymentAsUser
} from "../lib/settlementFlow.js";
import { stateFromIndex, formatEscrowId } from "../lib/escrowState.js";
import TxLink, { AddressLink } from "../components/TxLink.jsx";
import Disclosure from "../components/Disclosure.jsx";
import InlineOperationStatus from "../components/InlineOperationStatus.jsx";
import { loadEscrowActivity, loadEscrowDetail } from "../lib/escrowSource.js";
import { useLanguage } from "../lib/language.jsx";

// The contract has THREE milestones (docs/01_CONTRACT_SPEC.md §4), each gated by
// one automated feed plus one role-holder's signed proof. The earlier five-check
// list included two conditions ("e-BL hash valid", "Inspection passed") that the
// contract never had; they were a frontend invention. `milestoneKey` reads the
// real proof from mockRegistry; `field` is the legacy oracle-harness fallback.
const CHECKS = [
  { key: "vgm", milestoneKey: "inspected", field: "vgmMatch", label: "Inspected — VGM match and gate-in", source: "Sucofindo · Port IoT", failDetail: "Container mass mismatch at gate-in" },
  { key: "ais", milestoneKey: "shipped", field: "aisDeparted", label: "Shipped — vessel departed", source: "Shipping line · AIS", failDetail: "Vessel still in port" },
  { key: "ceisa", milestoneKey: "arrivedCleared", field: "ceisaApproved", label: "Arrived and cleared — customs approved", source: "Customs broker · CEISA", failDetail: "Customs clearance still pending" }
];

// "3600 seconds" is not something anyone reads as an hour.
function formatRemaining(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const PERMISSIONS = {
  importer: { release: true, refund: true, dispute: true, vote: false, amend: true },
  exporter: { release: true, refund: false, dispute: true, vote: false, amend: true },
  arbiter: { release: false, refund: false, dispute: true, vote: true, amend: false },

  // A wallet that is not a party to this escrow may read it and nothing more.
  // This entry is load-bearing: with the role switcher gone, "observer" is a
  // real outcome, and falling back to the importer's row would offer every
  // action to a stranger and send them into a transaction the contract must
  // reject.
  observer: { release: false, refund: false, dispute: false, vote: false, amend: false }
};

export default function EscrowDetail({ escrow, walletAddress, isOnChainReady, smartAccountClient, onRefresh, onUpdate, onBack }) {
  const { t } = useLanguage();
  // Which party you are is read off the escrow, not chosen in the sidebar.
  // The same wallet can be the importer here and the exporter on the next one.
  const role = roleOnEscrow(escrow, walletAddress);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [extensionInput, setExtensionInput] = useState("");
  const [chainMeta, setChainMeta] = useState(null);
  const [chainOracles, setChainOracles] = useState(null);
  const [timelock, setTimelock] = useState(null);
  const [walletAccount, setWalletAccount] = useState(null);
  const [reloading, setReloading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const permissions = PERMISSIONS[role] || PERMISSIONS.observer;
  // escrowSource labels live rows "gateway"; only the retired window.ethereum
  // path produced "chain". Testing for "chain" alone meant every real escrow
  // fell through to the mock branch and reported settlements that never
  // happened.
  const isChain = isOnChainReady && (escrow.source === "gateway" || escrow.source === "chain");
  const verification = escrow.verification;
  const deadlinePassed = escrow.deadline ? Date.now() > new Date(escrow.deadline).getTime() : false;
  const consortium = isChain ? chainOracles || [] : escrow.consortium || defaultConsortium();

  const grossValue = Number(escrow.value) || 0;

  useEffect(() => {
    if (!isChain || !escrow.activityPending) return undefined;
    const controller = new AbortController();
    loadEscrowActivity(escrow.id, { signal: controller.signal })
      .then((history) => {
        if (!controller.signal.aborted) onUpdate(escrow.id, (current) => ({ ...current, ...history, activityPending: false }));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [escrow.id, escrow.activityPending, isChain, onUpdate]);

  useEffect(() => {
    setMessage(null);
    setChainOracles(null);
    if (!isChain) return;

    // Read through the gateway, not window.ethereum. A Particle user has no
    // injected provider, so the old path threw here and left the verifier panel
    // empty — the data was always available over HTTP.
    (async () => {
      try {
        const vfs = await getVerifiers();
        const rows = (vfs?.verifiers || []).map((v, index) => ({
          address: v.address,
          name: v.name || CONSORTIUM[index]?.name || `Oracle ${index + 1}`,
          descr: CONSORTIUM[index]?.descr || v.role || "",
          bond: Number(v.bond) / 100,
          // Lifetime, across every escrow this verifier has ever worked on.
          // Kept separate from the status below for exactly that reason.
          slashes: Number(v.slashCount) || 0,
          // The escrow's own proofs say who has actually attested on THIS
          // escrow; a verifier being registered says nothing about that.
          attested: Boolean(
            escrow.milestones?.[["inspected", "shipped", "arrived_cleared"][index]]?.submitted
          ),
          // Three strikes and the contract revokes the role permanently.
          revoked: v.active === false
        }));
        setChainOracles(rows);
      } catch {
        setChainOracles(null);
      }
    })();

    // The list endpoint does not carry the timelock, so the detail page asks for
    // it. Without this the Release button had no idea whether the contract would
    // accept it, and pressing it early came back as a raw
    // "timelock not elapsed" revert.
    if (escrow.state === "TimelockActive") {
      getTimelock(escrow.id)
        .then(setTimelock)
        .catch(() => setTimelock(null));
    } else {
      setTimelock(null);
    }

    // A pending amendment has to be visible to the party who did not propose it
    // — they are the only one who can approve it. This used to load through
    // window.ethereum, so for a Particle user the proposal never appeared and
    // the flow could not complete. Plain RPC read; no wallet involved.
    readPendingExtension(escrow.id)
      .then((pending) => onUpdate(escrow.id, (current) => ({ ...current, pendingExtension: pending ? { ...pending, proposer: null } : null })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrow.id, isChain]);

  useEffect(() => {
    if (!isChain || typeof window === "undefined" || !window.ethereum) return;
    let cancelled = false;

    async function readAccount() {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (!cancelled) setWalletAccount(accounts?.[0] || null);
      } catch {
        if (!cancelled) setWalletAccount(null);
      }
    }

    readAccount();
    const onAccountsChanged = (accounts) => setWalletAccount(accounts?.[0] || null);
    window.ethereum.on?.("accountsChanged", onAccountsChanged);
    return () => {
      cancelled = true;
      window.ethereum.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [isChain]);

  async function loadChainExtension(contract, chainEscrow) {
    try {
      const [pending, proposer] = await Promise.all([
        contract.pendingDeadline(escrow.id),
        contract.extensionProposer(escrow.id)
      ]);
      const pendingMs = Number(pending) * 1000;
      if (!pendingMs) {
        onUpdate(escrow.id, (current) => ({ ...current, pendingExtension: null }));
        return;
      }
      const proposerLower = String(proposer).toLowerCase();
      const label =
        proposerLower === String(chainEscrow.importer).toLowerCase()
          ? "importer"
          : proposerLower === String(chainEscrow.exporter).toLowerCase()
            ? "exporter"
            : shortAddress(proposer);
      onUpdate(escrow.id, (current) => ({
        ...current,
        pendingExtension: {
          proposer: label,
          proposerAddress: proposer,
          newDeadline: new Date(pendingMs).toISOString()
        }
      }));
    } catch {
      // extension views unavailable (old contract) — leave as-is
    }
  }

  async function loadChainOracles(contract) {
    try {
      const milestoneIds = [1, 2, 3];
      const rows = await Promise.all(
        milestoneIds.map(async (milestone, index) => {
          const proof = await contract.getMilestoneProof(escrow.id, milestone);
          const slashes = proof.verifier === ethers.ZeroAddress ? 0n : await contract.verifierSlashCount(proof.verifier);
          const bond = proof.verifier === ethers.ZeroAddress ? 0n : await contract.verifierBonds(proof.verifier);
          return {
            address: proof.verifier,
            name: CONSORTIUM[index]?.name || `Oracle ${index + 1}`,
            descr: CONSORTIUM[index]?.descr || "",
            bond: Number(bond) / 100,
            // Same split as the gateway path above: strikes are lifetime, the
            // status is about this escrow, and only three strikes revokes.
            slashes: Number(slashes),
            attested: proof.submitted,
            revoked: Number(slashes) >= 3
          };
        })
      );
      setChainOracles(rows);
    } catch {
      setChainOracles(null);
    }
  }

  function applyChainEscrow(chainEscrow) {
    const state = stateFromIndex(chainEscrow.state);
    onUpdate(escrow.id, (current) => ({
      ...current,
      state,
      deadline: new Date(Number(chainEscrow.globalDeadline) * 1000).toISOString(),
      value: String(Number(chainEscrow.contractValue) / 100 || current.value)
    }));
    return state;
  }

  async function syncChain() {
    if (!isChain) return null;
    const contract = await getBrowserContract({ requireSigner: false });
    const [chainEscrow, eligible] = await Promise.all([
      contract.getEscrow(escrow.id),
      contract.isReleaseEligible(escrow.id)
    ]);
    const state = applyChainEscrow(chainEscrow);
    setChainMeta((meta) => (meta ? { ...meta, eligible } : meta));
      await Promise.all([loadChainOracles(contract), loadChainExtension(contract, chainEscrow)]);
    return state;
  }

  /**
   * Re-reads THIS escrow from the gateway and puts the fresh row into app state.
   *
   * This is what was missing. Every action called onRefresh, which bumps a
   * refreshKey that only Overview consumes — and Overview is unmounted while the
   * detail page is showing. So nothing reloaded: the state, the milestones and
   * the timelock all stayed as they were until the whole page was reloaded by
   * hand. The Refresh button had the same problem, which is why pressing it
   * appeared to do nothing at all.
   *
   * syncChain() below cannot serve this purpose either: it reads through
   * getBrowserContract(), i.e. window.ethereum, which a Particle user does not
   * have. This goes over HTTP like the rest of the page.
   *
   * Only the fields the gateway is authoritative for are merged. pendingExtension
   * is loaded separately and comes back null here, so copying the whole row
   * would erase a proposal the counterparty still has to approve.
   */
  const reload = useCallback(async () => {
    if (!isChain) return;
    setReloading(true);
    try {
      const fresh = await loadEscrowDetail(escrow.id);
      onUpdate(escrow.id, (current) => ({
        ...current,
        state: fresh.state,
        milestones: fresh.milestones,
        timelock: fresh.timelock,
        releaseEligible: fresh.releaseEligible,
        disputeOpen: fresh.disputeOpen,
        verified: fresh.verified,
        value: fresh.value,
        deadline: fresh.deadline
      }));
      if (fresh.state === "TimelockActive") {
        getTimelock(escrow.id).then(setTimelock).catch(() => {});
      }
    } catch {
      // A failed re-read must not replace the result notice the user is reading;
      // the page simply keeps showing what it had.
    } finally {
      setReloading(false);
    }
    // Keeps the Overview list in step for when they navigate back.
    onRefresh?.();
  }, [escrow.id, isChain, onUpdate, onRefresh]);

  function log(event) {
    onUpdate(escrow.id, (current) => ({
      ...current,
      activity: [...(current.activity || []), { time: new Date().toISOString(), actor: role, event }]
    }));
  }

  function fail(text) {
    setMessage({ tone: "fail", text: t(text) });
  }

  // `hash` renders as a link to the explorer beneath the sentence. The notices
  // used to paste `tx 0x1234abcd…` into the text, which is the least useful
  // form a hash can take: too short to search for, not clickable, and gone the
  // moment the notice is replaced.
  function ok(text, hash) {
    setMessage({ tone: "ok", text: t(text), hash });
  }

  function surfaceTxError(error) {
    const reason = error.reason || error.shortMessage || error.message || "Transaction failed";
    let hint = "";
    if (/nonce|already known|replacement/i.test(reason)) {
      hint = " Hardhat node restarted? Clear MetaMask nonce cache: Settings → Advanced → Clear activity tab data.";
    } else if (/escrow not found/i.test(reason)) {
      hint =
        " This escrow ID does not exist on the connected contract — the node was probably restarted or CONTRACT_ADDRESS points at a different deployment. Redeploy, update both .env files, and create the escrow again.";
    } else if (/already completed/i.test(reason)) {
      hint =
        " Funds were already released to the exporter — release also happens automatically inside the oracle's submit once all checks pass and the confirmation depth is reached.";
    } else if (/conditions not met/i.test(reason)) {
      hint = " All three milestone proofs must be committed on-chain first.";
    } else if (/deadline not passed/i.test(reason)) {
      hint = " Refund only opens after the escrow deadline.";
    } else if (/proposer cannot approve|only importer or exporter|not escrow party|only importer/i.test(reason)) {
      hint =
        " Your Smart Account signs this, and your role is read from the escrow party addresses.";
    }
    const signedAs = isChain && walletAccount ? ` (signed as ${shortAddress(walletAccount)})` : "";
    fail(`${reason}.${hint}${signedAs}`);
  }

  async function run(action) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      surfaceTxError(error);
      // After a failed on-chain action, re-read the contract so the UI shows
      // the true state (e.g. an escrow that auto-released during submit).
      if (isChain) await syncChain().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function startTimelock() {
    if (!isChain) {
      fail("The timelock is a contract state. Connect the gateway to run it for real.");
      return;
    }
    const { transactionHash } = await initiateTimelockAsUser(smartAccountClient, escrow.id);
    await reload();
    ok("Timelock started. Release opens once it elapses.", transactionHash);
    log("started the timelock on-chain");
  }

  async function release() {
    if (isChain) {
      const { transactionHash } = await releasePaymentAsUser(smartAccountClient, escrow.id);
      await reload();
      ok("Funds released to exporter.", transactionHash);
      log("released the settlement on-chain");
      return;
    }

    if (escrow.state !== "Verified") {
      fail("Conditions not met: every milestone must be verified before funds can be released.");
      return;
    }
    onUpdate(escrow.id, (current) => ({ ...current, state: "Completed" }));
    ok("Funds released to exporter instantly — e-BL transferred to importer (mock session).");
    log("released the settlement");
  }

  async function refund() {
    if (isChain) {
      const { transactionHash } = await claimRefundAsUser(smartAccountClient, escrow.id);
      await reload();
      ok("Refund claimed.", transactionHash);
      log("claimed a refund on-chain");
      return;
    }

    if (escrow.state === "Completed" || escrow.state === "Refunded") {
      fail(`Escrow already ${escrow.state.toLowerCase()}.`);
      return;
    }
    if (!deadlinePassed) {
      fail(`Deadline not passed — refund opens after ${new Date(escrow.deadline).toLocaleString()}. The contract enforces the same rule.`);
      return;
    }
    onUpdate(escrow.id, (current) => ({ ...current, state: "Refunded" }));
    ok("Deadline passed — escrow value refunded to the importer (mock session).");
    log("claimed a refund after the deadline");
  }

  async function openDispute() {
    if (isChain) {
      // A dispute against the escrow as a whole — Milestone.None — which the
      // contract accepts in exactly one state:
      //
      //   require(escrow.state == State.TimelockActive, "general dispute only in timelock");
      //
      // Checked here only so the refusal names the reason. The gateway checks it
      // again against live chain state, and that answer is the one that counts.
      if (escrow.state !== "TimelockActive") {
        fail(
          "A general dispute is only possible during the timelock. To contest a specific " +
            "milestone, use the Evidence panel — it names the milestone still inside its " +
            "challenge window and shows the bond before you sign."
        );
        return;
      }

      // Goes through the same path as the Evidence panel's dispute, and for two
      // reasons. It used to call getBrowserContract(), which reads
      // window.ethereum — a user who signed in through Particle has no injected
      // wallet, so it threw before reaching the chain. And raiseDispute pulls a
      // bond with safeTransferFrom, which needs an ERC-20 approval this button
      // never sent: even with a wallet it could only revert. prepareDispute
      // returns both calldatas and they go out as one UserOperation.
      const { transactionHash, bond } = await raiseDisputeAsUser(smartAccountClient, escrow.id, "none");
      await reload();
      ok(`Dispute opened, ${Number(bond).toLocaleString("id-ID")} bond locked. Funds are frozen until the arbiter resolves it.`, transactionHash);
      log("opened a general dispute on-chain");
      return;
    }

    if (escrow.state !== "Pending" && escrow.state !== "Verified") {
      fail(`Cannot dispute an escrow in ${escrow.state} state.`);
      return;
    }
    onUpdate(escrow.id, (current) => ({
      ...current,
      state: "Disputed",
      votes: { importer: null, exporter: null, arbiter: null }
    }));
    ok("Dispute opened — funds frozen until the arbiter resolves it.");
    log("opened a dispute");
  }

  async function vote(releaseToExporter) {
    if (isChain) {
      const contract = await getBrowserContract();
      const tx = await contract.resolveDispute(escrow.id, releaseToExporter, "bafy-dispute-reason-demo", false, false);
      await tx.wait();
      await syncChain();
      ok(`Vote cast: ${releaseToExporter ? "release to exporter" : "refund to importer"}.`);
      log(`voted ${releaseToExporter ? "release" : "refund"} on-chain`);
      return;
    }

    if (escrow.state !== "Disputed") {
      fail("No open dispute to vote on.");
      return;
    }
    if (escrow.votes?.[role] !== null && escrow.votes?.[role] !== undefined) {
      fail(`The ${role} has already voted.`);
      return;
    }

    const votes = { ...escrow.votes, [role]: releaseToExporter };
    const cast = Object.values(votes).filter((entry) => entry !== null);
    const releaseCount = cast.filter(Boolean).length;
    const refundCount = cast.length - releaseCount;

    let nextState = escrow.state;
    if (releaseCount >= 2) nextState = "Completed";
    if (refundCount >= 2) nextState = "Refunded";

    onUpdate(escrow.id, (current) => ({ ...current, votes, state: nextState }));
    log(`voted ${releaseToExporter ? "release" : "refund"} in the dispute`);

    if (nextState === "Completed") ok("Arbiter resolved the dispute: funds released to exporter.");
    else if (nextState === "Refunded") ok("Arbiter resolved the dispute: funds refunded to importer.");
    else ok(`Vote recorded as ${role}. One more matching vote resolves the dispute.`);
  }

  async function proposeExtension() {
    if (!extensionInput) {
      fail("Pick a new deadline first.");
      return;
    }
    const newDeadlineMs = new Date(extensionInput).getTime();
    if (!Number.isFinite(newDeadlineMs) || newDeadlineMs <= new Date(escrow.deadline).getTime()) {
      fail("The new deadline must be later than the current one — the contract enforces this.");
      return;
    }

    if (isChain) {
      await proposeExtensionAsUser(smartAccountClient, escrow.id, Math.floor(newDeadlineMs / 1000));
      await reload();
      ok("Extension proposed — waiting for the counterparty's approval.");
      log("proposed a deadline extension on-chain");
      return;
    }

    if (escrow.state !== "Pending" && escrow.state !== "Verified") {
      fail(`Cannot amend an escrow in ${escrow.state} state.`);
      return;
    }
    onUpdate(escrow.id, (current) => ({
      ...current,
      pendingExtension: { proposer: role, newDeadline: new Date(newDeadlineMs).toISOString() }
    }));
    ok("Extension proposed — the counterparty must approve.");
    log(`proposed extending the deadline to ${new Date(newDeadlineMs).toLocaleString()}`);
  }

  async function approveExtension() {
    if (isChain) {
      if (
        escrow.pendingExtension?.proposerAddress &&
        walletAccount &&
        escrow.pendingExtension.proposerAddress.toLowerCase() === walletAccount.toLowerCase()
      ) {
        fail(
          "You proposed this extension, so the counterparty is the one who approves it. The contract refuses an approval from the proposer."
        );
        return;
      }
      await approveExtensionAsUser(smartAccountClient, escrow.id);
      await reload();
      ok("Amendment signed by both parties — deadline extended.");
      log("approved the deadline extension on-chain");
      return;
    }

    if (!escrow.pendingExtension) {
      fail("No pending extension to approve.");
      return;
    }
    const proposedByMe =
      escrow.pendingExtension.proposerAddress &&
      walletAddress &&
      escrow.pendingExtension.proposerAddress.toLowerCase() === String(walletAddress).toLowerCase();
    if (proposedByMe || escrow.pendingExtension.proposer === role) {
      fail("The proposer cannot approve their own extension.");
      return;
    }
    const approved = escrow.pendingExtension.newDeadline;
    onUpdate(escrow.id, (current) => ({
      ...current,
      deadline: approved,
      pendingExtension: null
    }));
    ok("Amendment signed by both parties — deadline extended without cancelling the contract.");
    log("approved the deadline extension");
  }

  const terminal = escrow.state === "Completed" || escrow.state === "Refunded";
  // Prefer the real milestone proof; fall back to the legacy harness payload.
  const checkValue = (check) => {
    const proof = escrow.milestones?.[check.milestoneKey];
    if (proof) return proof.submitted ? true : null;
    return verification ? verification[check.field] : null;
  };
  const attestedCount = CHECKS.filter((check) => checkValue(check) === true).length;
  const importerAddress = escrow.importer;
  const messageTone = {
    ok: "border-state-attested/40 bg-state-attested/10 text-state-attested",
    warn: "border-state-pending/40 bg-state-pending/10 text-state-pending",
    fail: "border-state-disputed/40 bg-state-disputed/10 text-state-disputed"
  }[message?.tone || "ok"];

  const railBtn =
    "flex w-full cursor-pointer items-center justify-center gap-2 rounded-panel px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";
  const btnPrimary =
    "flex cursor-pointer items-center justify-center rounded-panel bg-navy px-6 py-2.5 text-[13px] font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-40";
  const btnOutline =
    "flex cursor-pointer items-center justify-center rounded-panel border border-sky bg-surface px-5 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/40 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-sm text-teal transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t("Back to escrows")}
      </button>

      {message ? (
        <div
          role="status"
          className={`mb-4 rounded-panel px-4 py-3 font-serif text-sm ${messageTone}`}
        >
          {t(message.text)}
          {message.hash ? (
            <span className="mt-1.5 flex items-center gap-1.5">
              <span className="text-2xs uppercase opacity-70">{t("Transaction")}</span>
              <TxLink hash={message.hash} />
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        {/* ---------- The instrument ---------- */}
        <div className="min-w-0">
          <article className="overflow-hidden rounded-doc bg-surface shadow-card">
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-sky px-6 py-7 lg:px-9">
              <div className="min-w-0">
                <p className="mb-2.5 text-2xs uppercase text-teal">
                  {t("Deed of conditional settlement")}
                </p>
                <h1 className="text-balance text-[28px] font-bold leading-[1.08] tracking-display text-navy lg:text-[36px]">
                  {escrow.commodity || t("Export shipment")}
                </h1>
                <p className="mt-2 font-serif text-base text-teal">
                  Instrument &#8470;&thinsp;{formatEscrowId(escrow.id)}
                  {escrow.containerRef ? ` · ${escrow.containerRef}` : ""}
                </p>
              </div>
              <StatusPill state={escrow.state} />
            </header>

            {/* Article I */}
            <section className="border-b border-sky px-6 py-6 lg:px-9">
              <p className="mb-3 text-2xs uppercase text-ink-faint">
                {t("Article I · Parties and terms")}
              </p>
              <div className="grid gap-x-14 sm:grid-cols-2">
                <TermRow label={t("Importer")} value={shortAddress(importerAddress)} />
                <TermRow label={t("Exporter")} value={shortAddress(escrow.exporter) || t("not set")} />
                <TermRow label={t("Arbiter")} value={shortAddress(escrow.arbiter) || t("not set")} />
                <TermRow
                  label={t("Contract value")}
                  value={`${grossValue.toLocaleString()} ${CURRENCY_LABEL}`}
                />
                <TermRow
                  label={t("Deadline")}
                  value={
                    escrow.deadline ? new Date(escrow.deadline).toLocaleDateString() : t("not set")
                  }
                  warn={deadlinePassed && !terminal}
                />
                <TermRow
                  label={t("Timelock")}
                  value={
                    chainMeta ? `${Math.round(chainMeta.timelock / 3600)}h` : "24h"
                  }
                />
                {/* Printed as a link, because an address nobody can follow is
                    just a long string. The gateway serves the bytes from the
                    same CID any IPFS gateway would. */}
                <TermRow label="e-BL CID" value={<EblCidValue cid={escrow.cid} />} truncate title={escrow.cid || undefined} />
                <TermRow label={t("Conditions met")} value={`${attestedCount} / ${CHECKS.length}`} />
              </div>
            </section>

            {/* Article II */}
            <section className="grid gap-8 border-b border-sky px-6 py-6 lg:grid-cols-[minmax(0,1fr)_216px] lg:px-9">
              <div className="min-w-0">
                <p className="mb-3 text-2xs uppercase text-ink-faint">{t("Article II · Conditions precedent")}</p>
                {reloading && !verifying ? <InlineOperationStatus className="mb-2">{t("Checking latest state…")}</InlineOperationStatus> : null}
                {CHECKS.map((check) => {
                  const value = checkValue(check);
                  return (
                    <div
                      key={check.key}
                      className="flex items-center gap-3.5 border-b border-sky/50 py-3 last:border-b-0"
                    >
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-[7px] ${
                          value === null
                            ? "border-[1.5px] border-sky bg-surface"
                            : value
                              ? "bg-state-attested"
                              : "bg-state-disputed"
                        }`}
                      >
                        {value === true ? (
                          <Check size={12} className="text-white" aria-hidden="true" />
                        ) : value === false ? (
                          <X size={12} className="text-white" aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] text-navy">{t(check.label)}</span>
                        {value === false ? (
                          <span className="block font-serif text-xs text-state-disputed">
                            {t(check.failDetail)}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-2xs uppercase text-ink-faint">
                        {check.source.split(" · ")[0]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="self-start rounded-panel bg-beige px-5 py-6 text-center">
                <div className="seal mx-auto grid h-32 w-32 place-items-center rounded-full" style={{ "--pct": `${attestedCount / CHECKS.length}turn` }} role="img" aria-label={t("{count} of {total} conditions attested", { count: attestedCount, total: CHECKS.length })}>
                  <span className="grid h-[104px] w-[104px] place-content-center rounded-full bg-beige text-center">
                    <span className="block text-[33px] font-medium leading-none tracking-display text-state-attested">{attestedCount}/{CHECKS.length}</span>
                    <span className="mt-1 block text-[8.5px] uppercase tracking-micro text-state-attested">{t("Attested")}</span>
                  </span>
                </div>
                <p className="mt-4 font-serif text-sm leading-snug text-ink-dim">
                  {attestedCount === CHECKS.length
                    ? t("All conditions met. Release is eligible.")
                    : t(CHECKS.length - attestedCount === 1 ? "Release withheld pending {count} condition." : "Release withheld pending {count} conditions.", { count: CHECKS.length - attestedCount })}
                </p>
              </div>
            </section>

            {/* Conformance harness — read-only.
                This used to carry check toggles, a "dissenting oracle" picker
                and a Submit verification button. All three existed to let the
                browser assemble an oracle submission, which is the one thing a
                frontend must never do: submitMilestoneProof requires a verifier
                role and a posted bond, and the gateway route behind it is gated
                by INTERNAL_API_KEY precisely so the browser cannot hold it. The
                button could only ever return 401.

                Fault simulation is unaffected and lives in the Evidence panel,
                where it belongs — it changes the mock SOURCE through
                POST /oracle/simulate/:id and never touches a proof. */}
            <Disclosure title={t("Technical information")} summary={t("Source checks and verifier process")} className="m-4 border-sky/60 lg:m-6">
              <p className="text-sm font-medium text-navy">{t("Conformance harness")}</p>
              <p className="mt-1 max-w-lg font-serif text-xs leading-relaxed text-ink-dim">
                {t("Deterministic feeds shaped like the real VGM, AIS and CEISA responses. We mock the credentials, not the architecture.")}
              </p>

              <div className="mt-3.5 grid gap-4 border-t border-sky pt-3.5 sm:grid-cols-2">
                <div>
                  <p className="text-2xs uppercase text-ink-faint">{t("Change what the sources say")}</p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-ink-dim">
                    {t("Use Fault simulation in the Evidence panel. It rewrites the mock source only — no proof is written, and none is altered.")}
                  </p>
                </div>
                <div>
                  <p className="text-2xs uppercase text-ink-faint">{t("Verify the milestones")}</p>
                  <p className="mt-1 font-serif text-xs leading-relaxed text-ink-dim">
                    {t("Use Verify milestones in the Evidence panel. It asks the gateway to run its own check and commit what passes — the verifier institutions sign, never this page.")}
                  </p>
                  <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
                    {t("The backend team can do the same from a terminal:")}{" "}
                    <code className="font-mono text-2xs text-navy">scripts/drive-demo.js</code>
                  </p>
                </div>
              </div>

              <p className="mt-3.5 truncate border-t border-sky pt-3 text-2xs text-ink-faint">
                e-BL CID &nbsp;<EblCidValue cid={escrow.cid} />
              </p>
            </Disclosure>
          </article>

          <div className="mt-5 overflow-hidden rounded-doc bg-surface shadow-card">
            <div className="flex items-center justify-between gap-2 border-b border-sky px-6 py-3.5 lg:px-9">
              <p className="text-2xs uppercase text-ink-faint">
                {t("Verifier institutions")} &nbsp;·&nbsp; {t("one role each")}
              </p>
              <span className="text-2xs text-ink-faint">{t("bond-secured")}</span>
            </div>
            <ul className="grid gap-px bg-sky/60 sm:grid-cols-3">
              {consortium.map((member) => (
                <li
                  key={member.address || member.name}
                  className={`px-5 py-4 ${member.revoked ? "bg-state-disputed/5" : "bg-surface"}`}
                >
                  <p className="text-sm font-medium text-navy">{member.name}</p>
                  {/* Linked, because "is the verifier actually working?" is a
                      fair question and this is where it gets answered: the
                      explorer shows the wallet's real transactions, its balance,
                      and whether it has been signing proofs at all. */}
                  {member.address ? (
                    <AddressLink address={member.address} label={shortAddress(member.address)} />
                  ) : (
                    <p className="truncate text-2xs text-ink-faint">{member.descr}</p>
                  )}
                  {/* Two different facts, and collapsing them was wrong.
                      `slashCount` is a lifetime figure that never resets, so
                      showing it as the status made a verifier read "SLASHED" on
                      a brand-new escrow it had not touched — as though the first
                      milestone had already failed. The status is about THIS
                      escrow; the strikes are the verifier's own history. */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-2xs tabular-nums text-teal">
                      {t("bond")} {Number(member.bond).toFixed(2)}
                    </span>
                    <span
                      className={`text-2xs uppercase ${
                        member.revoked
                          ? "text-state-disputed"
                          : member.attested
                            ? "text-state-attested"
                            : "text-ink-faint"
                      }`}
                    >
                      {t(member.revoked ? "revoked" : member.attested ? "attested" : "pending")}
                    </span>
                  </div>
                  {member.slashes > 0 && !member.revoked ? (
                    <p className="mt-1.5 text-2xs uppercase text-state-pending">
                      {t("{count} of 3 strikes", { count: member.slashes })}
                      <span className="ml-1 normal-case text-ink-faint">· {t("earlier escrow")}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          {/* Lifecycle and Activity moved out of the right rail and into this
              column. Measured on a live escrow, the rail ran 1974px against the
              centre's 1125 — half a screen of white space beside a wall of
              panels. Both of these are read-only reference; the rail is for
              things you act on, so they were also in the wrong place by meaning,
              not only by height. */}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Panel title={t("Lifecycle")}>
              <Timeline state={escrow.state} />
              <p className="mt-4 border-t border-sky pt-3 font-serif text-xs leading-relaxed text-ink-dim">
                {t("Each milestone opens a challenge window, and the timelock runs after the third. Both are set at deploy time.")}
              </p>
            </Panel>

            <Disclosure title={t("Activity history")} summary={t("Recorded escrow events")}>
              <ActivityLog entries={escrow.activity} error={escrow.activityError} truncatedBefore={escrow.activityTruncatedBefore} />
            </Disclosure>
          </div>

        </div>

        {/* ---------- Rail ---------- */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-0">
          {isOnChainReady ? (
            <EvidencePanel
              escrowId={escrow.id}
              smartAccountClient={smartAccountClient}
              onStateChanged={reload}
              onBusyChange={setVerifying}
            />
          ) : null}

          <Panel title={`${t("Actions")} · ${t(role)}`}>
            {/* The contract's own isReleaseEligible, surfaced. Saying "not yet"
                with the time is the difference between a disabled button and a
                raw "timelock not elapsed" revert. */}
            {timelock && !timelock.canRelease ? (
              <p className="mb-3 rounded-panel border border-state-pending/40 bg-state-pending/[0.08] px-3 py-2.5 font-serif text-xs leading-relaxed text-state-pending">
                {t("Timelock running. Release opens")}{" "}
                {new Date(timelock.timelockReleaseAt).toLocaleString("id-ID")}
                {Number(timelock.secondsRemaining) > 0
                  ? ` — ${t("about {time} from now.", { time: formatRemaining(Number(timelock.secondsRemaining)) })}`
                  : "."}
              </p>
            ) : null}
            <div className="space-y-2">
              {/* The step between "all three verified" and "release", and it was
                  missing entirely. releasePayment requires State.TimelockActive,
                  so with no way to start the timelock the settlement path simply
                  ended at ArrivedCleared with a button that could only revert. */}
              {escrow.state === "ArrivedCleared" ? (
                <button
                  type="button"
                  disabled={busy || !permissions.release}
                  onClick={() => run(startTimelock)}
                  className={`${railBtn} bg-teal/10 text-teal hover:bg-teal/20`}
                >
                  {t("Start timelock")}
                </button>
              ) : null}
              <button
                type="button"
                disabled={
                  busy ||
                  terminal ||
                  escrow.state === "Disputed" ||
                  !permissions.release ||
                  (timelock ? !timelock.canRelease : false)
                }
                title={
                  !permissions.release
                    ? t("Only importer or exporter trigger release")
                    : timelock && !timelock.canRelease
                      ? t("The timelock has not elapsed. Release opens {date}.", { date: new Date(timelock.timelockReleaseAt).toLocaleString("id-ID") })
                      : undefined
                }
                onClick={() => run(release)}
                className={`${railBtn} bg-state-attested/10 text-state-attested hover:bg-state-attested/20`}
              >
                {t("Release settlement")}
              </button>
              {/* Two corrections. The deadline was never checked, so the button
                  was live from the moment the escrow existed and came back
                  "global deadline not passed" — the same shape of revert the
                  timelock used to produce.

                  And a dispute was treated as blocking, which the contract does
                  not do: claimRefund runs while disputed and returns the bond to
                  whoever raised it. Refusing here withheld a remedy the contract
                  grants, from the party whose funds are frozen. */}
              <button
                type="button"
                disabled={busy || terminal || !permissions.refund || !deadlinePassed}
                title={
                  !permissions.refund
                    ? t("Only the importer can claim a refund")
                    : !deadlinePassed
                      ? t("Refund opens after the settlement deadline, {date}.", { date: new Date(escrow.deadline).toLocaleString("id-ID") })
                      : undefined
                }
                onClick={() => run(refund)}
                className={`${railBtn} bg-beige text-navy hover:bg-sky/50`}
              >
                <Undo2 size={13} aria-hidden="true" />
                {t("Claim refund")}
              </button>
              <button
                type="button"
                disabled={busy || terminal || escrow.state === "Disputed" || !permissions.dispute}
                onClick={() => run(openDispute)}
                className={`${railBtn} bg-state-pending/10 text-state-pending hover:bg-state-pending/20`}
              >
                <Scale size={13} aria-hidden="true" />
                {t("Open dispute")}
              </button>
            </div>
            <p className="mt-3 font-serif text-xs leading-relaxed text-ink-dim">
              {t("Release pays the exporter. Refund returns funds to the importer, after the deadline. A dispute freezes the funds until the arbiter resolves it.")}
            </p>
            {role === ROLE.OBSERVER ? (
              <p className="mt-2 font-serif text-xs leading-relaxed text-ink-dim">
                {t("Your wallet is not a party to this escrow, so none of these actions are yours. You can read it in full.")}
              </p>
            ) : (
              <p className="mt-2 font-serif text-xs leading-relaxed text-ink-dim">
                {t("You are the")} <span className="text-navy">{t(ROLE_LABEL[role])}</span> {t("on this escrow, read from its own party addresses. Your Smart Account signs.")}
              </p>
            )}
          </Panel>

          {escrow.state === "Disputed" ? (
            <Panel title={t("Dispute · arbiter decision")} tone="pending">
              <Disclosure title={t("Dispute details")} summary={t("Votes and resolution rules")} className="mb-3">
              {!isChain ? (
                <ul className="mb-3 space-y-1.5">
                  {Object.entries(escrow.votes || {}).map(([party, partyVote]) => (
                    <li key={party} className="flex items-center justify-between text-xs">
                      <span className="capitalize text-teal">{party}</span>
                      <span
                        className={`${
                          partyVote === null
                            ? "text-ink-faint"
                            : partyVote
                              ? "text-state-attested"
                              : "text-state-disputed"
                        }`}
                      >
                        {t(partyVote === null ? "not voted" : partyVote ? "release" : "refund")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* Named rather than left as two dead buttons. resolveDispute is
                  `require(msg.sender == escrow.arbiter)`, so a party pressing
                  these could only ever get a revert. */}
              {!permissions.vote ? (
                <p className="mb-3 font-serif text-xs leading-relaxed text-ink-dim">
                  {t("Only the appointed arbiter resolves a dispute, and the arbiter signs on the ops console with its own key. Your funds stay frozen until then.")}
                </p>
              ) : null}
              </Disclosure>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={busy || !permissions.vote}
                  onClick={() => run(() => vote(true))}
                  className={`${railBtn} bg-state-attested/10 text-state-attested hover:bg-state-attested/20`}
                >
                  {t("Resolve: release to exporter")}
                </button>
                <button
                  type="button"
                  disabled={busy || !permissions.vote}
                  onClick={() => run(() => vote(false))}
                  className={`${railBtn} bg-state-disputed/10 text-state-disputed hover:bg-state-disputed/20`}
                >
                  {t("Resolve: refund to importer")}
                </button>
              </div>
            </Panel>
          ) : null}

          {!terminal ? (
            <Disclosure title={t("Amendment")} summary={t(escrow.pendingExtension ? "Deadline change awaiting approval" : "Propose or approve a deadline change")}>
              <p className="font-serif text-xs leading-relaxed text-ink-dim">
                {t("Vessel delayed? The importer or exporter proposes a later deadline and the counterparty approves.")}
              </p>
              {escrow.pendingExtension ? (
                <p className="mt-2.5 rounded-panel bg-teal/10 px-3 py-2 font-serif text-xs text-teal">
                  <span className="capitalize">{t(escrow.pendingExtension.proposer)}</span> {t("proposed")}{" "}
                  {new Date(escrow.pendingExtension.newDeadline).toLocaleString()}
                </p>
              ) : null}
              <input
                type="datetime-local"
                value={extensionInput}
                onChange={(event) => setExtensionInput(event.target.value)}
                aria-label={t("New deadline")}
                className={`${inputClass(false)} mt-2.5 py-2 text-xs`}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || !permissions.amend}
                  title={permissions.amend ? undefined : t("Only importer or exporter can amend")}
                  onClick={() => run(proposeExtension)}
                  className={`${railBtn} bg-beige text-navy hover:bg-sky/50`}
                >
                  {t("Propose")}
                </button>
                <button
                  type="button"
                  disabled={busy || !permissions.amend}
                  title={permissions.amend ? undefined : t("Only importer or exporter can amend")}
                  onClick={() => run(approveExtension)}
                  className={`${railBtn} bg-teal/10 text-teal hover:bg-teal/20`}
                >
                  {t("Approve")}
                </button>
              </div>
            </Disclosure>
          ) : null}

        </aside>
      </div>
    </div>
  );
}

/* Dot-leader term row: serif label, leader, mono value. See design system §5.3. */
function TermRow({ label, value, warn, truncate, title }) {
  return (
    <div className="flex items-baseline gap-2.5 py-2.5">
      <span className="whitespace-nowrap font-serif text-[15px] text-teal">{label}</span>
      <span className="leader h-1 min-w-[16px] flex-1 -translate-y-[3px]" aria-hidden="true" />
      <span
        className={`text-xs font-medium tabular-nums ${
          truncate ? "min-w-0 truncate" : "whitespace-nowrap"
        } ${warn ? "text-state-pending" : "text-navy"}`}
        // `value` may be a link rather than a string, and a React element in a
        // title attribute renders as "[object Object]".
        title={title ?? (truncate && typeof value === "string" ? value : undefined)}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The escrow's document CID, as something you can follow.
 *
 * Three cases worth telling apart: a real IPFS address, which opens; the
 * pre-IPFS local hash that some older escrows carry, which resolves nowhere
 * and should not pretend otherwise; and nothing at all.
 */
function EblCidValue({ cid }) {
  const { t } = useLanguage();
  if (!cid) return <span className="text-ink-dim">{t("not pinned")}</span>;

  const url = eblDocumentUrl(cid);
  const isContentAddress = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/.test(cid);

  if (!isContentAddress || !url) {
    return (
      <span className="font-mono" title={t("{cid} — a local content hash, not an IPFS address", { cid })}>
        {shortCid(cid)} <span className="text-ink-dim">({t("not pinned")})</span>
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={cid}
      className="font-mono text-teal transition-colors duration-150 hover:text-navy"
    >
      {shortCid(cid)}
    </a>
  );
}

function Panel({ title, tone, children }) {
  return (
    <section
      className={`stern-workspace-card overflow-hidden rounded-doc shadow-card ${
        tone === "pending" ? "bg-state-pending/[0.06]" : "bg-surface"
      }`}
    >
      <h2 className="border-b border-sky px-5 py-3 text-2xs uppercase text-ink-faint">
        {title}
      </h2>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
