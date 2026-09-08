import { useMemo, useState } from "react";
import { ArrowLeft, FileCheck2, Loader2, Lock, Paperclip } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { Button, Card, CardTitle, Notice } from "../components/ui.jsx";
import { CURRENCY_CAPTION, CURRENCY_LABEL } from "../lib/currency.js";
import { formatBytes } from "../lib/ebl.js";
import { shortAddress } from "../lib/actors.js";
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

export default function NewEscrow({ balance, onCreated, onBack, smartAccountClient, importerAddress }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [document_, setDocument] = useState(null);
  const [hashing, setHashing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

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
        importer: importerAddress,
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
      <Button icon={ArrowLeft} tone="ghost" size="sm" onClick={onBack} className="-ml-3.5 mb-4">
        Back to escrows
      </Button>

      <Notice tone="teal" className="mb-5">
        Creating an escrow makes you its <strong className="font-semibold">importer</strong> &mdash;
        the party whose funds are locked. The transaction is gasless and sponsored by the paymaster.
      </Notice>

      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardTitle hint="Both addresses are checked for format, and for being distinct from each other and from you.">
              Counterparties
            </CardTitle>
            <div className="space-y-4">
              <Field
                label="Exporter wallet"
                htmlFor="exporter"
                required
                error={showError("exporter")}
                hint="Receives IDRT-demo once all three milestones are verified."
              >
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
              <Field
                label="Arbiter wallet"
                htmlFor="arbiter"
                required
                error={showError("arbiter")}
                hint="Resolves disputes — independent of importer and exporter."
              >
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
          </Card>

          <Card>
            <CardTitle hint={CURRENCY_CAPTION}>Shipment terms</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Contract value (${CURRENCY_LABEL})`}
                htmlFor="value"
                required
                error={showError("value")}
              >
                <input
                  id="value"
                  name="value"
                  inputMode="decimal"
                  value={form.value}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="45000000"
                  className={`${inputClass(Boolean(showError("value")))} tabular-nums`}
                />
              </Field>
              <Field
                label="Settlement deadline"
                htmlFor="deadline"
                required
                error={showError("deadline")}
                hint="Global safety valve — the importer can refund at any time after this passes."
              >
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
              <Field
                label="Container reference"
                htmlFor="containerRef"
                required
                error={showError("containerRef")}
              >
                <input
                  id="containerRef"
                  name="containerRef"
                  value={form.containerRef}
                  onChange={update}
                  onBlur={markTouched}
                  placeholder="TGHU-2026-001"
                  spellCheck="false"
                  className={`${inputClass(Boolean(showError("containerRef")))} uppercase`}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle hint="Hashed locally (container ref + commodity + file → keccak256), so the contract anchors a real fingerprint of your document rather than a filename.">
              Contract document
            </CardTitle>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-panel border border-dashed px-3.5 py-3.5 transition-colors duration-150 ${
                showError("document") ? "border-state-disputed/60" : "border-sky hover:border-teal/50"
              }`}
            >
              <input type="file" onChange={onFileChange} className="sr-only" />
              {hashing ? (
                <Loader2 size={17} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
              ) : document_ ? (
                <FileCheck2 size={17} className="shrink-0 text-state-attested" aria-hidden="true" />
              ) : (
                <Paperclip size={17} className="shrink-0 text-ink-dim" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {hashing ? (
                  <span className="text-[13px] text-teal">Hashing document…</span>
                ) : document_ ? (
                  <>
                    <span className="block truncate text-[13px] font-medium text-navy">
                      {document_.fileName}{" "}
                      <span className="font-normal text-ink-dim">({formatBytes(document_.size)})</span>
                    </span>
                    <span className="block truncate font-mono text-2xs text-teal">
                      {document_.documentHash.slice(0, 24)}…
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-dim">
                    Choose the contract document — invoice, e-BL, any format
                  </span>
                )}
              </span>
            </label>
            {showError("document") ? (
              <p role="alert" className="mt-2 text-[12.5px] text-state-disputed">
                {errors.document}
              </p>
            ) : null}
          </Card>
        </div>

        {/* Review rail. DESIGN.md: the final review names importer, exporter,
            arbiter, contract value and the action being signed before anything
            is committed. */}
        <Card as="aside" className="h-fit lg:sticky lg:top-0">
          <CardTitle>Review and lock</CardTitle>
          <div className="divide-y divide-sky/70">
            <Row label="Deposit" value={`${grossValue.toLocaleString("id-ID")} ${CURRENCY_LABEL}`} />
            <Row
              label="Your balance"
              value={`${Number(balance || 0).toLocaleString("id-ID")} ${CURRENCY_LABEL}`}
            />
            <Row label="You sign as" value="Importer" />
            <Row label="Exporter" value={shortAddress(form.exporter) || "not set"} />
            <Row label="Arbiter" value={shortAddress(form.arbiter) || "not set"} />
            <Row label="Milestones" value="3 — inspected, shipped, cleared" />
            <Row label="Challenge window" value="6h per milestone" />
            <Row label="Timelock" value="24h after final milestone" />
            <Row label="Dispute path" value="Arbiter decides, 2% buyer bond" />
          </div>

          {submitError ? (
            <Notice tone="disputed" role="alert" className="mt-4">
              {submitError}
            </Notice>
          ) : null}

          <Button
            type="submit"
            tone="primary"
            size="lg"
            full
            busy={submitting}
            disabled={submitting || hashing}
            icon={Lock}
            className="mt-5"
          >
            {submitting
              ? onChainConfigured
                ? "Locking funds on chain…"
                : "Locking funds…"
              : "Lock funds in escrow"}
          </Button>
          <p className="mt-2.5 text-center text-2xs text-ink-faint">
            {onChainConfigured
              ? "Gasless — sponsored by Pimlico"
              : "Demo data — nothing is sent on chain"}
          </p>
        </Card>
      </form>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="whitespace-nowrap text-[13px] text-ink-dim">{label}</span>
      <span className="text-right text-[13px] font-medium tabular-nums text-navy">{value}</span>
    </div>
  );
}
