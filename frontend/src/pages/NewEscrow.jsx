import { useMemo, useState } from "react";
import { ArrowLeft, FileCheck2, Loader2, Lock, Paperclip, ShieldCheck } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { actorById } from "../lib/actors.js";
import { CURRENCY_CAPTION, CURRENCY_LABEL } from "../lib/currency.js";
import { formatBytes } from "../lib/ebl.js";
import { hashShipmentDocument } from "../lib/shipmentHash.js";
import { createEscrow } from "../lib/mockRegistry.js";
import { createEscrowOnChain, onChainConfigured } from "../lib/sternContract.js";
import { validateEscrowForm } from "../lib/validate.js";

const INITIAL_FORM = {
  exporter: "",
  arbiter: "",
  value: "",
  commodity: "",
  containerRef: "",
  deadline: ""
};

export default function NewEscrow({ role, balance, onCreated, onBack, smartAccountClient, importerAddress }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [document_, setDocument] = useState(null);
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const actor = actorById(role);
  const { errors, valid } = useMemo(
    () => validateEscrowForm(form, document_?.documentHash),
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
      if (!form.containerRef.trim() || !form.commodity.trim()) {
        throw new Error("Fill in Container reference and Commodity before attaching the document — they're part of the hash.");
      }
      const result = await hashShipmentDocument(form.containerRef, form.commodity, file);
      setDocument({ ...result, fileName: file.name, size: file.size });
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

    if (Number(form.value) > Number(balance || 0)) {
      setSubmitError(`Insufficient IDRT-demo balance — you have ${Number(balance || 0).toLocaleString("id-ID")}, this escrow needs ${Number(form.value).toLocaleString("id-ID")}.`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        importer: importerAddress || actor.address,
        exporter: form.exporter,
        arbiter: form.arbiter,
        documentCid: document_.documentHash,
        value: Number(form.value).toFixed(2),
        commodity: form.commodity.trim(),
        containerRef: form.containerRef.trim().toUpperCase(),
        globalDeadline: new Date(form.deadline).toISOString()
      };

      // On-chain when the contracts are configured, mock otherwise, so a demo
      // without a deploy still works end to end.
      const result = onChainConfigured
        ? await createEscrowOnChain(smartAccountClient, payload)
        : await createEscrow(payload);

      onCreated(result.escrowId);
    } catch (error) {
      setSubmitError(error.message || "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  }

  const grossValue = Number(form.value) || 0;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1.5 text-sm text-teal transition-colors duration-150 hover:text-navy"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to escrows
      </button>

      <header className="mb-6">
        <p className="text-2xs uppercase text-ink-faint">Deed of conditional settlement</p>
        <h1 className="mt-1.5 text-[32px] font-bold leading-none tracking-display text-navy">New escrow</h1>
        <p className="mt-2.5 max-w-[62ch] font-serif text-[15px] leading-relaxed text-teal">
          You are acting as the <span className="text-navy">{actor.label}</span> — the party that
          deposits funds. Gasless, sponsored by the Paymaster.
        </p>
      </header>

      {role !== "importer" ? (
        <div className="mb-5 flex items-center gap-2 rounded-panel bg-state-pending/10 px-4 py-3 font-serif text-sm text-state-pending">
          <ShieldCheck size={15} aria-hidden="true" className="shrink-0" />
          Only the importer deposits funds. Switch to Importer in the sidebar to create an escrow.
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-5">
          <section className="rounded-doc bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-2xs uppercase text-ink-faint">Counterparties</h2>
            <div className="space-y-4">
              <Field label="Exporter wallet" htmlFor="exporter" required error={showError("exporter")} hint="Receives IDRT-demo once all three milestones are verified.">
                <input
                  id="exporter"
                  name="exporter"
                  value={form.exporter}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="0x…"
                  spellCheck="false"
                  autoComplete="off"
                  className={`${inputClass(Boolean(showError("exporter")))} text-xs`}
                />
              </Field>
              <Field label="Arbiter wallet" htmlFor="arbiter" required error={showError("arbiter")} hint="Resolves disputes — independent of importer and exporter.">
                <input
                  id="arbiter"
                  name="arbiter"
                  value={form.arbiter}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="0x…"
                  spellCheck="false"
                  autoComplete="off"
                  className={`${inputClass(Boolean(showError("arbiter")))} text-xs`}
                />
              </Field>
            </div>
          </section>

          <section className="rounded-doc bg-surface p-6 shadow-card">
            <h2 className="mb-4 text-2xs uppercase text-ink-faint">Shipment terms</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Contract value (${CURRENCY_LABEL})`} htmlFor="value" required error={showError("value")}>
                <input
                  id="value"
                  name="value"
                  inputMode="decimal"
                  value={form.value}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="45000000"
                  className={inputClass(Boolean(showError("value")))}
                />
              </Field>
              <Field label="Settlement deadline" htmlFor="deadline" required error={showError("deadline")} hint="Global safety valve — importer can refund any time after this passes.">
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
                  className={`${inputClass(Boolean(showError("containerRef")))} text-xs uppercase`}
                />
              </Field>
            </div>
            <p className="mt-3 font-serif text-xs leading-relaxed text-ink-dim">{CURRENCY_CAPTION}</p>
          </section>

          <section className="rounded-doc bg-surface p-6 shadow-card">
            <h2 className="mb-1 text-2xs uppercase text-ink-faint">Contract document</h2>
            <p className="mb-3 font-serif text-xs leading-relaxed text-ink-dim">
              Hashed locally (container ref + commodity + file &rarr; keccak256), so the contract
              anchors a real fingerprint of your document, not a filename.
            </p>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-panel border border-dashed px-3.5 py-3 transition-colors duration-150 ${
                showError("document") ? "border-state-disputed/60" : "border-sky hover:border-teal/50"
              }`}
            >
              <input type="file" onChange={onFileChange} className="sr-only" />
              {hashing ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
              ) : document_ ? (
                <FileCheck2 size={16} className="shrink-0 text-state-attested" aria-hidden="true" />
              ) : (
                <Paperclip size={16} className="shrink-0 text-ink-dim" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {hashing ? (
                  <span className="text-xs text-teal">Hashing document…</span>
                ) : document_ ? (
                  <>
                    <span className="block truncate text-xs font-medium text-navy">
                      {document_.fileName} <span className="text-ink-dim">({formatBytes(document_.size)})</span>
                    </span>
                    <span className="block truncate text-2xs text-teal">
                      {document_.documentHash.slice(0, 24)}…
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-teal">Choose the contract document (invoice, e-BL — any format)</span>
                )}
              </span>
            </label>
            {showError("document") ? (
              <p role="alert" className="mt-1.5 text-xs text-state-disputed">
                {errors.document}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="h-fit rounded-doc bg-surface p-6 shadow-card lg:sticky lg:top-6">
          <h2 className="mb-4 text-2xs uppercase text-ink-faint">Review &amp; lock</h2>
          <div className="space-y-2.5 text-sm">
            <Row label="Deposit" value={`${grossValue.toLocaleString("id-ID")} ${CURRENCY_LABEL}`} />
            <Row label="Your balance" value={`${Number(balance || 0).toLocaleString("id-ID")} ${CURRENCY_LABEL}`} />
            <Row label="Milestones" value="3 — Inspected, Shipped, Arrived & cleared" />
            <Row label="Challenge window" value="6h per milestone" />
            <Row label="Timelock" value="24h after final milestone" />
            <Row label="Dispute path" value="Arbiter decides, 2% buyer bond" />
          </div>

          {submitError ? (
            <p role="alert" className="mt-4 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-3 py-2.5 font-serif text-xs text-state-disputed">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || hashing}
            className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-navy py-3 text-sm font-medium text-beige transition-colors duration-150 hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
            {submitting
              ? onChainConfigured
                ? "Locking funds on chain…"
                : "Locking funds…"
              : "Lock funds in escrow"}
          </button>
          <p className="mt-2.5 text-center text-2xs uppercase text-ink-faint">
            {onChainConfigured ? "Gasless — sponsored by Pimlico" : "Demo data — nothing is sent on chain"}
          </p>
        </aside>
      </form>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-sky pb-2">
      <span className="text-2xs uppercase text-ink-faint">{label}</span>
      <span className="text-right font-serif text-[13.5px] text-navy">{value}</span>
    </div>
  );
}
