import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDashed,
  Loader2,
  Scale,
  Undo2,
  X
} from "lucide-react";
import ActivityLog from "../components/ActivityLog.jsx";
import StatusPill from "../components/StatusPill.jsx";
import Timeline from "../components/Timeline.jsx";
import { inputClass } from "../components/Field.jsx";
import { getMockStatus, submitOracle } from "../lib/api.js";
import { getBrowserContract } from "../lib/contract.js";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { CONSORTIUM, ORACLE_QUORUM, defaultConsortium } from "../lib/oracles.js";
import { actorById, shortAddress } from "../lib/actors.js";

const STATE_LABELS = [
  "Created",
  "Inspected",
  "Shipped",
  "ArrivedCleared",
  "TimelockActive",
  "Disputed",
  "Completed",
  "Refunded"
];

const CHECKS = [
  { key: "vgm", field: "vgmMatch", label: "VGM match", source: "Port IoT · gate-in", failDetail: "Container mass mismatch at gate-in" },
  { key: "ais", field: "aisDeparted", label: "Vessel departed", source: "AIS satellite feed", failDetail: "Vessel still in port" },
  { key: "ceisa", field: "ceisaApproved", label: "Customs approved", source: "CEISA · PEB status", failDetail: "Customs clearance still pending" },
  { key: "ebl", field: "eblCidValid", label: "e-BL hash valid", source: "IPFS content check", failDetail: "Document hash does not match contract" },
  { key: "inspection", field: "inspectionPassed", label: "Inspection passed", source: "PSI surveyor certificate", failDetail: "PSI: goods do not match contract" }
];

const PERMISSIONS = {
  importer: { release: true, refund: true, dispute: true, vote: true, amend: true },
  exporter: { release: true, refund: false, dispute: true, vote: true, amend: true },
  arbiter: { release: false, refund: false, dispute: true, vote: true, amend: false }
};

export default function EscrowDetail({ escrow, role, isOnChainReady, onUpdate, onBack }) {
  const [checks, setChecks] = useState({ vgm: true, ais: true, ceisa: true, ebl: true, inspection: true });
  const [dissentIndex, setDissentIndex] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [oracleSources, setOracleSources] = useState(null);
  const [extensionInput, setExtensionInput] = useState("");
  const [chainMeta, setChainMeta] = useState(null);
  const [chainOracles, setChainOracles] = useState(null);
  const [walletAccount, setWalletAccount] = useState(null);

  const permissions = PERMISSIONS[role] || PERMISSIONS.importer;
  const isChain = isOnChainReady && escrow.source === "chain";
  const verification = escrow.verification;
  const deadlinePassed = escrow.deadline ? Date.now() > new Date(escrow.deadline).getTime() : false;
  const consortium = isChain ? chainOracles || [] : escrow.consortium || defaultConsortium();

  const grossValue = Number(escrow.value) || 0;

  useEffect(() => {
    setMessage(null);
    setOracleSources(null);
    setChainOracles(null);
    setDissentIndex(null);
    if (!isChain) return;

    (async () => {
      try {
        const contract = await getBrowserContract({ requireSigner: false });
        const [timelock, eligible, chainEscrow] = await Promise.all([
          contract.timelockDurationSeconds(),
          contract.isReleaseEligible(escrow.id),
          contract.getEscrow(escrow.id)
        ]);
        setChainMeta({ timelock: Number(timelock), eligible });
        applyChainEscrow(chainEscrow);
        await Promise.all([loadChainOracles(contract), loadChainExtension(contract, chainEscrow)]);
      } catch {
        setChainMeta(null);
      }
    })();
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
            slashes: Number(slashes),
            attested: proof.submitted,
            slashed: Number(slashes) > 0
          };
        })
      );
      setChainOracles(rows);
    } catch {
      setChainOracles(null);
    }
  }

  function applyChainEscrow(chainEscrow) {
    const state = STATE_LABELS[Number(chainEscrow.state)] || "Pending";
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

  function log(event) {
    onUpdate(escrow.id, (current) => ({
      ...current,
      activity: [...(current.activity || []), { time: new Date().toISOString(), actor: role, event }]
    }));
  }

  function fail(text) {
    setMessage({ tone: "fail", text });
  }

  function ok(text) {
    setMessage({ tone: "ok", text });
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
      hint = " A 2-of-3 oracle consensus must be finalized on-chain and the confirmation depth reached.";
    } else if (/deadline not passed/i.test(reason)) {
      hint = " Refund only opens after the escrow deadline.";
    } else if (/proposer cannot approve|only importer or exporter|not escrow party|only importer/i.test(reason)) {
      hint =
        " The signer is the connected MetaMask account — the sidebar role does NOT change who signs. Switch accounts in MetaMask, then retry.";
    }
    const signedAs = isChain && walletAccount ? ` (signed as ${shortAddress(walletAccount)})` : "";
    fail(`${reason}.${hint}${signedAs}`);
  }

  function buildOverrides() {
    const overrides = {};
    if (!checks.vgm) overrides.vgm = { vgm_match: false };
    if (!checks.ais) overrides.ais = { departure_status: "in_port" };
    if (!checks.ceisa) overrides.ceisa = { customs_status: "pending" };
    if (!checks.inspection) overrides.inspection = { inspection_status: "failed" };
    overrides.eblCid = checks.ebl ? escrow.cid : "invalid-cid-demo";
    return overrides;
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

  async function refreshFeed() {
    const status = await getMockStatus(escrow.id, buildOverrides());
    setOracleSources(status.sources);
    onUpdate(escrow.id, (current) => ({ ...current, verification: status.verification }));
    if (status.allVerified) {
      ok("Oracle feed refreshed — all five checks passing.");
    } else {
      setMessage({ tone: "warn", text: "Oracle feed refreshed — checks failing, funds would stay locked." });
    }
    log("refreshed the oracle feed");
  }

  function applyMockConsortium(current) {
    const base = current.consortium || defaultConsortium();
    return base.map((member, index) => {
      if (index === dissentIndex) {
        return {
          ...member,
          attested: true,
          slashed: true,
          bond: member.slashed ? member.bond : member.bond / 2,
          slashes: member.slashed ? member.slashes : member.slashes + 1
        };
      }
      return { ...member, attested: true };
    });
  }

  async function submitVerification() {
    const overrides = buildOverrides();
    const dissenterName = dissentIndex !== null ? CONSORTIUM[dissentIndex]?.name : null;

    try {
      const result = await submitOracle(escrow.id, {
        ...overrides,
        ...(dissentIndex !== null ? { dissentIndex } : {})
      });
      setOracleSources(result.status.sources);
      if (!isChain) {
        onUpdate(escrow.id, (current) => ({ ...current, verification: result.status.verification }));
      }
      const syncedState = await syncChain();
      const finalized = syncedState === "Completed" || syncedState === "Refunded";

      const submitted = result.result.attestations || [];
      const rawCount = submitted.length;
      const count = rawCount || 1;
      const noun = count === 1 ? "attestation" : "attestations";
      const dissentSubmitted = submitted.some((entry) => entry.dissent);

      if (isChain && rawCount === 0 && finalized) {
        ok("Escrow already settled by an earlier attestation — nothing left to submit.");
        log("checked oracle status — escrow already settled");
      } else if (isChain && rawCount < CONSORTIUM.length && finalized) {
        ok(
          `${rawCount} oracle ${rawCount === 1 ? "attestation" : "attestations"} submitted on-chain — quorum was reached and the escrow settled before the remaining oracle(s) needed to attest (tx ${result.result.transactionHash.slice(0, 10)}…).`
        );
        log(`submitted ${rawCount} oracle ${noun} on-chain — quorum finalized early`);
      } else if (isChain && count < CONSORTIUM.length) {
        setMessage({
          tone: "warn",
          text: `Only ${count} of ${CONSORTIUM.length} consortium ${noun} submitted — the gateway holds ${count} key(s), so the ${ORACLE_QUORUM}-of-${CONSORTIUM.length} quorum cannot finalize. Set ORACLE_PRIVATE_KEYS in .env to all three consortium keys (Hardhat accounts #1, #4, #5 from the deploy output) and restart npm run backend.`
        });
        log(`submitted ${count}/${CONSORTIUM.length} oracle ${noun} — gateway keys incomplete, quorum not reached`);
      } else if (dissentSubmitted && dissenterName) {
        ok(
          `${count} ${noun} submitted on-chain — ${dissenterName} deviated from the ${ORACLE_QUORUM}-of-${CONSORTIUM.length} consensus and its bond was slashed (see consortium panel).`
        );
        log(`submitted ${count} oracle ${noun} — ${dissenterName} deviated and was slashed`);
      } else {
        ok(`${count} oracle ${noun} submitted on-chain — consensus recorded (tx ${result.result.transactionHash.slice(0, 10)}…).`);
        log(`submitted ${count} oracle ${noun} on-chain`);
      }
    } catch (error) {
      if (isChain) {
        // Wallet mode: verification MUST land on-chain. Never pretend with
        // local mock state — surface the failure and re-read the contract.
        await syncChain().catch(() => {});
        fail(
          `Oracle gateway request failed: ${error.message}. In wallet mode the oracle must submit on-chain — make sure the gateway is running (npm run backend) and its .env points at this contract, then submit again.`
        );
        return;
      }

      // Mock session: evaluate the same feed locally.
      const status = await getMockStatus(escrow.id, overrides);
      setOracleSources(status.sources);
      onUpdate(escrow.id, (current) => ({
        ...current,
        verification: status.verification,
        state: status.allVerified && current.state === "Pending" ? "Verified" : current.state,
        consortium: applyMockConsortium(current)
      }));

      if (dissenterName) {
        log(`consortium consensus reached — ${dissenterName} deviated and was slashed 50% of its bond`);
      }
      if (status.allVerified) {
        ok(
          dissenterName
            ? `Consensus ${ORACLE_QUORUM}-of-${CONSORTIUM.length} reached despite ${dissenterName} deviating — dissenter slashed, escrow marked Verified (mock session).`
            : "All five checks passed by consortium consensus — escrow marked Verified (mock session)."
        );
        log("submitted attestations: consensus passed (mock)");
      } else {
        setMessage({
          tone: "warn",
          text: "Consortium consensus recorded a failing check — funds stay locked."
        });
        log("submitted attestations: consensus failed, funds locked (mock)");
      }
    }
  }

  async function release() {
    if (isChain) {
      const contract = await getBrowserContract();
      const tx = await contract.releasePayment(escrow.id);
      const receipt = await tx.wait();
      await syncChain();
      ok(`Funds released to exporter (tx ${receipt.hash.slice(0, 10)}…).`);
      log("released the settlement on-chain");
      return;
    }

    if (escrow.state !== "Verified") {
      fail("Conditions not met: all five checks must pass before funds can be released.");
      return;
    }
    onUpdate(escrow.id, (current) => ({ ...current, state: "Completed" }));
    ok("Funds released to exporter instantly — e-BL transferred to importer (mock session).");
    log("released the settlement");
  }

  async function refund() {
    if (isChain) {
      const contract = await getBrowserContract();
      const tx = await contract.claimRefund(escrow.id);
      const receipt = await tx.wait();
      await syncChain();
      ok(`Refund claimed (tx ${receipt.hash.slice(0, 10)}…).`);
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
      const contract = await getBrowserContract();
      const tx = await contract.raiseDispute(escrow.id, 0);
      await tx.wait();
      await syncChain();
      ok("Dispute opened — funds frozen until a 2-of-3 vote.");
      log("opened a dispute on-chain");
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
    ok("Dispute opened — funds frozen until a 2-of-3 vote.");
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

    if (nextState === "Completed") ok("Dispute resolved 2-of-3: funds released to exporter.");
    else if (nextState === "Refunded") ok("Dispute resolved 2-of-3: funds refunded to importer.");
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
      const contract = await getBrowserContract();
      const tx = await contract.proposeDeadlineExtension(escrow.id, Math.floor(newDeadlineMs / 1000));
      await tx.wait();
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
          `You proposed this extension — the counterparty must approve it. MetaMask is still on ${shortAddress(walletAccount)}; switch to the other party's account first.`
        );
        return;
      }
      const contract = await getBrowserContract();
      const tx = await contract.approveDeadlineExtension(escrow.id);
      await tx.wait();
      await syncChain();
      ok("Amendment signed by both parties — deadline extended.");
      log("approved the deadline extension on-chain");
      return;
    }

    if (!escrow.pendingExtension) {
      fail("No pending extension to approve.");
      return;
    }
    if (escrow.pendingExtension.proposer === role) {
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
  const messageTone = {
    ok: "border-state-ok/40 bg-state-ok/10 text-state-ok",
    warn: "border-state-warn/40 bg-state-warn/10 text-state-warn",
    fail: "border-state-fail/40 bg-state-fail/10 text-state-fail"
  }[message?.tone || "ok"];

  const actionButton =
    "flex w-full cursor-pointer items-center justify-center gap-2 rounded border px-3 py-2 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mx-auto max-w-6xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-xs text-paper-dim transition-colors duration-150 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Back to escrows
      </button>

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-lg font-semibold text-paper">Escrow #{escrow.id}</h1>
          <StatusPill state={escrow.state} />
        </div>
        <div className="flex items-baseline gap-4 text-right">
          <div>
            <p className="text-2xs uppercase tracking-widest text-paper-faint">Locked value</p>
            <p className="font-mono text-sm font-semibold text-paper">
              {grossValue.toLocaleString()} {CURRENCY_LABEL}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-2xs uppercase tracking-widest text-paper-faint">Exporter receives</p>
            <p className="font-mono text-sm text-paper-dim">
              {grossValue.toLocaleString()} {CURRENCY_LABEL}
            </p>
          </div>
        </div>
      </header>

      <div className="mb-5 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Commodity" value={escrow.commodity} />
        <Meta label="Container" value={escrow.containerRef} mono />
        <Meta label="e-BL CID" value={escrow.cid} mono truncate />
        <Meta
          label="Deadline"
          value={`${new Date(escrow.deadline).toLocaleString()}${deadlinePassed && !terminal ? " · passed" : ""}`}
          warn={deadlinePassed && !terminal}
        />
      </div>

      {message ? (
        <div role="status" className={`mb-5 rounded border px-3.5 py-2.5 text-xs ${messageTone}`}>
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[230px_1fr_280px]">
        {/* Lifecycle */}
        <section>
          <SectionTitle>Lifecycle</SectionTitle>
          <div className="rounded border border-ink-700 bg-ink-900 p-4">
            <Timeline state={escrow.state} />
            <div className="mt-4 border-t border-ink-800 pt-3 text-2xs text-paper-faint">
              <p>
                Confirmation depth:{" "}
                <span className="font-mono text-paper-dim">
                  {chainMeta ? `${Math.round(chainMeta.timelock / 3600)}h timelock` : "24h timelock"}
                </span>
              </p>
              <p className="mt-1">
                Settlement can take up to three 6h challenge windows plus the final timelock.
              </p>
            </div>
          </div>

          {!terminal ? (
            <div className="mt-4 rounded border border-ink-700 bg-ink-900 p-4">
              <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
                <CalendarClock size={12} aria-hidden="true" />
                Amendment
              </h3>
              <p className="mt-1.5 text-2xs text-paper-faint">
                Vessel delayed? Importer or exporter proposes a later deadline; the counterparty
                approves.
              </p>
              {escrow.pendingExtension ? (
                <p className="mt-2 rounded border border-state-info/40 bg-state-info/10 px-2 py-1.5 text-2xs text-state-info">
                  <span className="capitalize">{escrow.pendingExtension.proposer}</span> proposed{" "}
                  {new Date(escrow.pendingExtension.newDeadline).toLocaleString()}
                </p>
              ) : null}
              <input
                type="datetime-local"
                value={extensionInput}
                onChange={(event) => setExtensionInput(event.target.value)}
                aria-label="New deadline"
                className={`${inputClass(false)} mt-2.5 px-2.5 py-2 text-xs`}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || !permissions.amend}
                  title={permissions.amend ? undefined : "Only importer or exporter can amend"}
                  onClick={() => run(proposeExtension)}
                  className={`${actionButton} border-ink-600 text-paper-dim hover:border-ink-600 hover:text-paper`}
                >
                  Propose
                </button>
                <button
                  type="button"
                  disabled={busy || !permissions.amend}
                  title={permissions.amend ? undefined : "Only importer or exporter can amend"}
                  onClick={() => run(approveExtension)}
                  className={`${actionButton} border-brass-400/50 text-brass-300 hover:bg-brass-400/10`}
                >
                  Approve
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Verification */}
        <section>
          <SectionTitle>Oracle verification</SectionTitle>
          <div className="overflow-hidden rounded border border-ink-700 bg-ink-900">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Five oracle checks required for release</caption>
              <tbody>
                {CHECKS.map((check) => {
                  const value = verification ? verification[check.field] : null;
                  return (
                    <tr key={check.key} className="border-b border-ink-800 last:border-b-0">
                      <td className="py-2.5 pl-3.5 pr-2">
                        <span className="grid h-6 w-6 place-items-center rounded-full border border-ink-700">
                          {value === null ? (
                            <CircleDashed size={12} className="text-paper-faint" aria-hidden="true" />
                          ) : value ? (
                            <Check size={12} className="text-state-ok" aria-hidden="true" />
                          ) : (
                            <X size={12} className="text-state-fail" aria-hidden="true" />
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="text-xs font-medium text-paper">{check.label}</p>
                        <p className="text-2xs text-paper-faint">
                          {value === false ? check.failDetail : check.source}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3.5 text-right">
                        <span
                          className={`font-mono text-2xs uppercase tracking-wider ${
                            value === null
                              ? "text-paper-faint"
                              : value
                                ? "text-state-ok"
                                : "text-state-fail"
                          }`}
                        >
                          {value === null ? "unchecked" : value ? "attested" : "failed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="border-t border-ink-700 px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-2xs font-semibold uppercase tracking-widest text-paper-dim">
                  Oracle consortium · {ORACLE_QUORUM}-of-{CONSORTIUM.length} consensus
                </p>
                <span className="font-mono text-2xs text-paper-faint">bond-secured</span>
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-3">
                {consortium.map((member) => (
                  <li
                    key={member.address || member.name}
                    className={`rounded border px-2.5 py-2 ${
                      member.slashed ? "border-state-fail/50 bg-state-fail/5" : "border-ink-700"
                    }`}
                  >
                    <p className="text-xs font-medium text-paper">{member.name}</p>
                    <p className="truncate font-mono text-2xs text-paper-faint">
                      {member.address ? shortAddress(member.address) : member.descr}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-2xs text-paper-dim">
                        bond {Number(member.bond).toFixed(2)}
                      </span>
                      <span
                        className={`font-mono text-2xs uppercase tracking-wider ${
                          member.slashed
                            ? "text-state-fail"
                            : member.attested
                              ? "text-state-ok"
                              : "text-paper-faint"
                        }`}
                      >
                        {member.slashed ? "slashed" : member.attested ? "attested" : "pending"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-ink-700 bg-ink-850 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-widest text-paper-dim">
                    Conformance harness
                  </p>
                  <p className="mt-0.5 max-w-md text-2xs text-paper-faint">
                    Deterministic feeds shaped like the real VGM/AIS/CEISA/IPFS/PSI responses — we
                    mock the credentials, not the architecture.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CHECKS.map((check) => (
                    <button
                      key={check.key}
                      type="button"
                      onClick={() => setChecks((current) => ({ ...current, [check.key]: !current[check.key] }))}
                      aria-pressed={!checks[check.key]}
                      title={`${check.label}: click to simulate ${checks[check.key] ? "failure" : "success"}`}
                      className={`cursor-pointer rounded border px-2 py-1 font-mono text-2xs transition-colors duration-150 ${
                        checks[check.key]
                          ? "border-ink-600 text-paper-dim hover:text-paper"
                          : "border-state-fail/50 bg-state-fail/10 text-state-fail"
                      }`}
                    >
                      {check.label.split(" ")[0]} {checks[check.key] ? "✓" : "✗"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-2xs uppercase tracking-widest text-paper-faint">
                  Dissenting oracle
                </span>
                <button
                  type="button"
                  onClick={() => setDissentIndex(null)}
                  className={`cursor-pointer rounded border px-2 py-1 font-mono text-2xs transition-colors duration-150 ${
                    dissentIndex === null
                      ? "border-state-ok/50 bg-state-ok/10 text-state-ok"
                      : "border-ink-600 text-paper-dim hover:text-paper"
                  }`}
                >
                  none
                </button>
                {CONSORTIUM.map((member) => (
                  <button
                    key={member.index}
                    type="button"
                    onClick={() => setDissentIndex(member.index)}
                    title={`Simulate ${member.name} submitting false data — the majority outvotes it and its bond is slashed`}
                    className={`cursor-pointer rounded border px-2 py-1 font-mono text-2xs transition-colors duration-150 ${
                      dissentIndex === member.index
                        ? "border-state-fail/50 bg-state-fail/10 text-state-fail"
                        : "border-ink-600 text-paper-dim hover:text-paper"
                    }`}
                  >
                    {member.name}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy || terminal}
                  onClick={() => run(refreshFeed)}
                  className={`${actionButton} border-ink-600 text-paper hover:bg-ink-800`}
                >
                  {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
                  Refresh oracle feed
                </button>
                <button
                  type="button"
                  disabled={busy || terminal || escrow.state === "Disputed"}
                  onClick={() => run(submitVerification)}
                  className={`${actionButton} border-brass-400 bg-brass-400 text-ink-950 hover:bg-brass-300`}
                >
                  Submit verification
                </button>
              </div>
            </div>
          </div>

          {oracleSources ? (
            <details className="mt-3 rounded border border-ink-700 bg-ink-900">
              <summary className="flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-xs font-medium text-paper-dim hover:text-paper">
                Raw source payloads — real API response shapes
                <ChevronDown size={13} aria-hidden="true" />
              </summary>
              <pre className="max-h-56 overflow-auto border-t border-ink-800 px-3.5 py-3 font-mono text-2xs leading-relaxed text-paper-dim">
                {JSON.stringify(oracleSources, null, 2)}
              </pre>
            </details>
          ) : null}
        </section>

        {/* Actions + activity */}
        <section>
          <SectionTitle>Actions · {role}</SectionTitle>
          <div className="space-y-2 rounded border border-ink-700 bg-ink-900 p-4">
            <button
              type="button"
              disabled={busy || terminal || escrow.state === "Disputed" || !permissions.release}
              title={permissions.release ? undefined : "Only importer or exporter trigger release"}
              onClick={() => run(release)}
              className={`${actionButton} border-state-ok/50 text-state-ok hover:bg-state-ok/10`}
            >
              Release settlement
            </button>
            <button
              type="button"
              disabled={busy || terminal || escrow.state === "Disputed" || !permissions.refund}
              title={permissions.refund ? undefined : "Only the importer can claim a refund"}
              onClick={() => run(refund)}
              className={`${actionButton} border-ink-600 text-paper-dim hover:text-paper`}
            >
              <Undo2 size={13} aria-hidden="true" />
              Claim refund
            </button>
            <button
              type="button"
              disabled={busy || terminal || escrow.state === "Disputed" || !permissions.dispute}
              onClick={() => run(openDispute)}
              className={`${actionButton} border-state-warn/50 text-state-warn hover:bg-state-warn/10`}
            >
              <Scale size={13} aria-hidden="true" />
              Open dispute
            </button>
            <p className="pt-1 text-2xs text-paper-faint">
              Release pays the <span className="text-paper-dim">exporter</span>. Refund returns funds
              to the <span className="text-paper-dim">importer</span> (importer only, after the
              deadline). Dispute freezes funds for a 2-of-3 vote.
            </p>
            {isChain ? (
              <p className="pt-1 text-2xs text-paper-faint">
                MetaMask signs everything — the sidebar role does not.{" "}
                {walletAccount ? (
                  <span
                    className={
                      walletAccount.toLowerCase() === actorById(role).address.toLowerCase()
                        ? "text-state-ok"
                        : "text-state-warn"
                    }
                  >
                    Connected: {shortAddress(walletAccount)}
                    {walletAccount.toLowerCase() !== actorById(role).address.toLowerCase()
                      ? ` — differs from the ${role} demo account, switch in MetaMask before acting`
                      : ` (matches ${role})`}
                  </span>
                ) : (
                  "No account connected."
                )}
              </p>
            ) : null}
          </div>

          {escrow.state === "Disputed" ? (
            <div className="mt-4 rounded border border-state-warn/40 bg-state-warn/5 p-4">
              <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-widest text-state-warn">
                <Scale size={12} aria-hidden="true" />
                Dispute · 2-of-3 vote
              </h3>
              {!isChain ? (
                <ul className="mt-2.5 space-y-1">
                  {Object.entries(escrow.votes || {}).map(([party, partyVote]) => (
                    <li key={party} className="flex items-center justify-between text-2xs">
                      <span className="capitalize text-paper-dim">{party}</span>
                      <span
                        className={`font-mono ${
                          partyVote === null
                            ? "text-paper-faint"
                            : partyVote
                              ? "text-state-ok"
                              : "text-state-fail"
                        }`}
                      >
                        {partyVote === null ? "not voted" : partyVote ? "release" : "refund"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  disabled={busy || !permissions.vote}
                  onClick={() => run(() => vote(true))}
                  className={`${actionButton} border-state-ok/50 text-state-ok hover:bg-state-ok/10`}
                >
                  Vote: release to exporter
                </button>
                <button
                  type="button"
                  disabled={busy || !permissions.vote}
                  onClick={() => run(() => vote(false))}
                  className={`${actionButton} border-state-fail/50 text-state-fail hover:bg-state-fail/10`}
                >
                  Vote: refund to importer
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded border border-ink-700 bg-ink-900 p-4">
            <h3 className="mb-3 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
              Activity
            </h3>
            <ActivityLog entries={escrow.activity} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="mb-2 text-2xs font-semibold uppercase tracking-widest text-paper-faint">
      {children}
    </h2>
  );
}

function Meta({ label, value, mono, truncate, warn }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs uppercase tracking-widest text-paper-faint">{label}</p>
      <p
        className={`mt-0.5 ${mono ? "font-mono text-2xs" : "text-xs"} ${
          warn ? "text-state-warn" : "text-paper-dim"
        } ${truncate ? "truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}
