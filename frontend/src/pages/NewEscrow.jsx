import { useMemo, useState } from "react";
import { ethers } from "ethers";
import { ArrowLeft, FileCheck2, Loader2, Lock, Paperclip } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { getBrowserContract, getBrowserIdrtContract } from "../lib/contract.js";
import { CURRENCY_CAPTION, CURRENCY_DECIMALS, CURRENCY_LABEL } from "../lib/currency.js";
import { formatBytes, hashFileToCid } from "../lib/ebl.js";
import { validateEscrowForm } from "../lib/validate.js";

const INITIAL_FORM = {
  exporter: "",
  arbiter: "",
  value: "",
  commodity: "",
  containerRef: "",
  deadline: ""
};

export default function NewEscrow({ role, isOnChainReady, onCreated, onBack }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [document_, setDocument] = useState(null);
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const { errors, valid } = useMemo(
    () => validateEscrowForm(form, document_?.cid),
    [form, document_]
  );

  function showError(field) {
    return (touched[field] || attemptedSubmit) && errors[field] ? errors[field] : undefined;
  }

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function markTouched(event) {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setHashing(true);
    setSubmitError("");
    try {
      const result = await hashFileToCid(file);
      setDocument(result);
    } catch (error) {
      setSubmitError(`Could not hash the document: ${error.message}`);
    } finally {
      setHashing(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    setSubmitError("");
    if (!valid) return;

    setSubmitting(true);
    const deadlineSeconds = Math.floor(new Date(form.deadline).getTime() / 1000);

    try {
      let id = String(Date.now()).slice(-5);
      let txHash = null;
      let source = "mock";

      if (isOnChainReady) {
        source = "chain";
        const contract = await getBrowserContract();
        const contractAddress = await contract.getAddress();
        const tokenAddress = await contract.idrtToken();
        const idrt = await getBrowserIdrtContract(tokenAddress);
        const amount = ethers.parseUnits(form.value, CURRENCY_DECIMALS);
        const allowance = await idrt.allowance(await idrt.runner.getAddress(), contractAddress);
        if (allowance < amount) {
          const approveTx = await idrt.approve(contractAddress, amount);
          await approveTx.wait();
        }
        const tx = await contract.createEscrow(
          form.exporter,
          form.arbiter,
          document_.cid,
          amount,
          deadlineSeconds,
          form.commodity.trim(),
          form.containerRef.trim().toUpperCase()
        );
        const receipt = await tx.wait();
        txHash = receipt.hash;
        const created = receipt.logs
          .map((log) => {
            try {
              return contract.interface.parseLog(log);
            } catch {
              return null;
            }
          })
          .find((parsed) => parsed?.name === "EscrowCreated");
        id = created?.args?.escrowId?.toString?.() || id;
      }

      onCreated({
        id,
        source,
        txHash,
        exporter: form.exporter,
        arbiter: form.arbiter,
        value: form.value,
        commodity: form.commodity.trim(),
        containerRef: form.containerRef.trim().toUpperCase(),
        cid: document_.cid,
        fileName: document_.fileName,
        fileSize: document_.size,
        deadline: new Date(form.deadline).toISOString(),
        createdAt: new Date().toISOString(),
        state: "Created",
        verification: null,
        votes: { importer: null, exporter: null, arbiter: null },
        pendingExtension: null,
        activity: [
          {
            time: new Date().toISOString(),
            actor: role,
            event: isOnChainReady
            ? `locked ${form.value} ${CURRENCY_LABEL} on-chain (tx ${txHash?.slice(0, 10)}…)`
              : `locked ${form.value} ${CURRENCY_LABEL} in escrow (mock session)`
          }
        ]
      });
    } catch (error) {
      const reason = error.reason || error.shortMessage || error.message || "Transaction failed";
      const nonceHint =
        /nonce|already known|replacement/i.test(reason) || error.code === "UNKNOWN_ERROR"
          ? " If the Hardhat node was restarted, clear MetaMask's stale nonce cache: Settings → Advanced → Clear activity tab data."
          : "";
      setSubmitError(`${reason}.${nonceHint}`);
    } finally {
      setSubmitting(false);
    }
  }

  const grossValue = Number(form.value) || 0;

  return (
    <div className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-xs text-paper-dim transition-colors duration-150 hover:text-paper"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        Back to escrows
      </button>

      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-paper">New escrow</h1>
        <p className="mt-0.5 text-sm text-paper-dim">
          You are acting as the <span className="capitalize text-brass-300">{role}</span> — the party
          that deposits funds. {isOnChainReady ? "This will send a real transaction to the local chain." : "No wallet detected: the escrow is created in local mock state."}
        </p>
      </header>

      {role !== "importer" ? (
        <div className="mb-5 rounded border border-state-warn/40 bg-state-warn/10 px-3.5 py-2.5 text-xs text-state-warn">
          Only the importer deposits funds. Switch the session to Importer (bottom-left) — on-chain,
          the depositing wallet becomes the importer automatically.
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="rounded border border-ink-700 bg-ink-900 p-4">
            <h2 className="mb-4 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
              Counterparties
            </h2>
            <div className="space-y-4">
              <Field label="Exporter wallet" htmlFor="exporter" required error={showError("exporter")} hint="Receives the funds when all five checks pass.">
                <input
                  id="exporter"
                  name="exporter"
                  value={form.exporter}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="0x…"
                  spellCheck="false"
                  autoComplete="off"
                  className={`${inputClass(Boolean(showError("exporter")))} font-mono text-xs`}
                />
              </Field>
              <Field label="Arbiter wallet" htmlFor="arbiter" required error={showError("arbiter")} hint="Independent inspection body — holds the third vote in disputes.">
                <input
                  id="arbiter"
                  name="arbiter"
                  value={form.arbiter}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="0x…"
                  spellCheck="false"
                  autoComplete="off"
                  className={`${inputClass(Boolean(showError("arbiter")))} font-mono text-xs`}
                />
              </Field>
            </div>
          </section>

          <section className="rounded border border-ink-700 bg-ink-900 p-4">
            <h2 className="mb-4 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
              Shipment terms
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Contract value (${CURRENCY_LABEL})`} htmlFor="value" required error={showError("value")}>
                <input
                  id="value"
                  name="value"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.value}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="1.5"
                  className={`${inputClass(Boolean(showError("value")))} font-mono`}
                />
              </Field>
              <Field label="Settlement deadline" htmlFor="deadline" required error={showError("deadline")} hint="After this passes unsettled, the importer can claim a refund.">
                <input
                  id="deadline"
                  name="deadline"
                  type="datetime-local"
                  value={form.deadline}
                  onChange={update}
                  onBlur={markTouched}
                  className={inputClass(Boolean(showError("deadline")))}
                />
              </Field>
              <Field label="Commodity" htmlFor="commodity" required error={showError("commodity")}>
                <input
                  id="commodity"
                  name="commodity"
                  value={form.commodity}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="Arabica Gayo Grade 1"
                  className={inputClass(Boolean(showError("commodity")))}
                />
              </Field>
              <Field label="Container reference" htmlFor="containerRef" required error={showError("containerRef")}>
                <input
                  id="containerRef"
                  name="containerRef"
                  value={form.containerRef}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="TGHU-2026-001"
                  spellCheck="false"
                  className={`${inputClass(Boolean(showError("containerRef")))} font-mono text-xs uppercase`}
                />
              </Field>
            </div>
            <p className="mt-3 text-2xs text-paper-faint">{CURRENCY_CAPTION}</p>
          </section>

          <section className="rounded border border-ink-700 bg-ink-900 p-4">
            <h2 className="mb-1 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
              e-BL document
            </h2>
            <p className="mb-3 text-xs text-paper-faint">
              The file is hashed locally (SHA-256) into a content identifier. The contract stores the
              CID — anyone holding the same document can verify it matches.
            </p>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded border border-dashed px-3.5 py-3 transition-colors duration-150 ${
                showError("document")
                  ? "border-state-fail/60"
                  : "border-ink-600 hover:border-brass-400/60"
              }`}
            >
              <input type="file" onChange={onFileChange} className="sr-only" />
              {document_ ? (
                <FileCheck2 size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
              ) : (
                <Paperclip size={16} className="shrink-0 text-paper-faint" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {hashing ? (
                  <span className="text-xs text-paper-dim">Hashing document…</span>
                ) : document_ ? (
                  <>
                    <span className="block truncate text-xs font-medium text-paper">
                      {document_.fileName}{" "}
                      <span className="text-paper-faint">({formatBytes(document_.size)})</span>
                    </span>
                    <span className="block truncate font-mono text-2xs text-brass-300">
                      {document_.cid}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-paper-dim">
                    Choose the bill of lading file (any format)
                  </span>
                )}
              </span>
            </label>
            {showError("document") ? (
              <p role="alert" className="mt-1.5 text-xs text-state-fail">
                {errors.document}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="h-fit rounded border border-ink-700 bg-ink-900 p-4 lg:sticky lg:top-6">
          <h2 className="mb-4 text-2xs font-semibold uppercase tracking-widest text-paper-dim">
            Review &amp; lock
          </h2>
          <dl className="space-y-2.5 text-xs">
            <SummaryRow label="Deposit" value={`${grossValue.toLocaleString()} ${CURRENCY_LABEL}`} mono />
            <SummaryRow label="Platform fee" value="Not charged by contract" />
            <SummaryRow label="Release condition" value="3 milestones + timelock" />
            <SummaryRow label="Refund path" value="Importer, after deadline" />
            <SummaryRow label="Dispute path" value="Arbiter decision + IDRT bond" />
          </dl>

          <button
            type="submit"
            disabled={submitting || hashing}
            className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded bg-brass-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors duration-150 hover:bg-brass-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Lock size={15} aria-hidden="true" />
            )}
            {submitting ? "Locking funds…" : "Lock funds in escrow"}
          </button>

          {attemptedSubmit && !valid ? (
            <p role="alert" className="mt-3 text-xs text-state-fail">
              Fix the highlighted fields before locking funds.
            </p>
          ) : null}
          {submitError ? (
            <p role="alert" className="mt-3 break-words text-xs text-state-fail">
              {submitError}
            </p>
          ) : null}
        </aside>
      </form>
    </div>
  );
}

function SummaryRow({ label, value, mono }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-paper-faint">{label}</dt>
      <dd className={`text-right text-paper ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
