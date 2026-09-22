import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileCheck2, Loader2, Lock, Paperclip, X } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { CURRENCY_CAPTION, CURRENCY_LABEL } from "../lib/currency.js";
import { eblCheckRows, eblFieldRows, formatBytes, pinEbl, shortCid } from "../lib/ebl.js";
import { eblDocumentUrl } from "../lib/sternApi.js";
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
  // Set by the operator when the document verified but not cleanly — a valid
  // bill of lading that does not name this container, say. Structural failures
  // are not acknowledgeable; see `blocked` below.
  const [acknowledged, setAcknowledged] = useState(false);

  const { errors, valid } = useMemo(
    () => validateEscrowForm(form, document_?.cid),
    [form, document_]
  );

  // The two kinds of problem a pinned document can have, kept apart on
  // purpose.
  //
  // `blocked` is structural: nothing resolves at the CID, or the bytes that do
  // resolve hash to something else. Anchoring that on chain would write an
  // address that proves nothing, which is the exact failure this whole change
  // exists to remove — so there is no override for it.
  //
  // `needsAcknowledgement` is about the document's contents: it is a real,
  // retrievable PDF, but the gateway could not confirm it is a bill of lading
  // for this container. That is a judgement call an operator is allowed to
  // make, so it asks rather than refuses.
  const verification = document_?.verification || null;
  const structuralChecks = ["cidResolves", "cidMatchesContent"];
  const blocked =
    document_?.mode === "ipfs" &&
    (verification?.available === false ||
      structuralChecks.some((name) => verification?.checks?.[name] === false));
  const needsAcknowledgement =
    document_?.mode === "ipfs" && !blocked && verification?.valid === false;

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
    setDocument(null);
    setAcknowledged(false);
    try {
      if (!form.containerRef.trim() || !form.commodity.trim()) {
        throw new Error(
          "Fill in Container reference and Commodity first — the container is what the e-BL is checked against."
        );
      }

      // The real path: pin the document, and let the gateway read it back by
      // CID and tell us what it found.
      const pinned = await pinEbl(file, { containerRef: form.containerRef.trim().toUpperCase() });
      setDocument({ mode: "ipfs", ...pinned });
    } catch (error) {
      // A deployment with no pinning service is a supported state, not a
      // broken one. Fall back to the local content fingerprint so the escrow
      // can still be created, and label it for what it is — an unpinned hash,
      // not an address anything resolves at.
      if (error.code === "IPFS_NOT_CONFIGURED" || error.code === "API_NOT_CONFIGURED") {
        try {
          const local = await hashShipmentDocument(form.containerRef, form.commodity, file);
          setDocument({
            mode: "local",
            cid: local.documentHash,
            fileName: file.name,
            size: file.size,
            reason: error.message
          });
        } catch (fallbackError) {
          setSubmitError(`Could not hash the document: ${fallbackError.message}`);
        }
      } else {
        setSubmitError(`Could not pin the e-BL: ${error.message}`);
      }
    } finally {
      setHashing(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    setSubmitError("");
    if (!valid) return;

    if (blocked) {
      setSubmitError(
        "The e-BL could not be verified at its own address, so there is nothing worth anchoring. Attach the document again."
      );
      return;
    }

    if (needsAcknowledgement && !acknowledged) {
      setSubmitError("Confirm you want to anchor this document despite the failed checks.");
      return;
    }

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
        // The IPFS address of the pinned e-BL. Whoever reads this escrow can
        // fetch the document from that address and check it themselves —
        // which is the only reason a contract should carry one.
        documentCid: document_.cid,
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
          Creating an escrow makes you its <span className="text-navy">Importer</span> — the party
          that deposits funds. Gasless, sponsored by the Paymaster.
        </p>
      </header>


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
            <h2 className="mb-1 text-2xs uppercase text-ink-faint">Electronic bill of lading</h2>
            <p className="mb-3 font-serif text-xs leading-relaxed text-ink-dim">
              Pinned to IPFS, then read back from its own address and checked: that the bytes hash
              to the address, and that the document is a bill of lading for container{" "}
              <span className="font-mono text-navy">{form.containerRef.trim().toUpperCase() || "…"}</span>.
              The contract stores that address.
            </p>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-panel border border-dashed px-3.5 py-3 transition-colors duration-150 ${
                showError("document") ? "border-state-disputed/60" : "border-sky hover:border-teal/50"
              }`}
            >
              <input type="file" accept="application/pdf,.pdf" onChange={onFileChange} className="sr-only" />
              {hashing ? (
                <Loader2 size={16} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
              ) : blocked ? (
                <AlertTriangle size={16} className="shrink-0 text-state-disputed" aria-hidden="true" />
              ) : document_ ? (
                <FileCheck2 size={16} className="shrink-0 text-state-attested" aria-hidden="true" />
              ) : (
                <Paperclip size={16} className="shrink-0 text-ink-dim" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {hashing ? (
                  <span className="text-xs text-teal">Pinning to IPFS and reading it back…</span>
                ) : document_ ? (
                  <>
                    <span className="block truncate text-xs font-medium text-navy">
                      {document_.fileName} <span className="text-ink-dim">({formatBytes(document_.size)})</span>
                    </span>
                    <span className="block truncate font-mono text-2xs text-teal">
                      {document_.mode === "ipfs" ? document_.cid : `${document_.cid.slice(0, 24)}…`}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-teal">Choose the e-BL (PDF)</span>
                )}
              </span>
            </label>
            {showError("document") ? (
              <p role="alert" className="mt-1.5 text-xs text-state-disputed">
                {errors.document}
              </p>
            ) : null}

            {document_?.mode === "ipfs" ? (
              <EblReport
                document_={document_}
                verification={verification}
                blocked={blocked}
                needsAcknowledgement={needsAcknowledgement}
                acknowledged={acknowledged}
                onAcknowledge={setAcknowledged}
              />
            ) : null}

            {document_?.mode === "local" ? (
              <p className="mt-3 rounded-panel border border-state-pending/40 bg-state-pending/[0.08] px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-pending">
                This gateway has no IPFS pinning service configured, so the document was not pinned.
                What goes on chain is a local content hash — it identifies the file, but nothing
                resolves at it and no one else can retrieve the document from it. Set{" "}
                <span className="font-mono">PINATA_JWT</span> on the gateway to pin for real.
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
            <Row
              label="e-BL"
              value={
                document_
                  ? document_.mode === "ipfs"
                    ? `IPFS · ${shortCid(document_.cid)}`
                    : "Local hash, not pinned"
                  : "Not attached"
              }
            />
          </div>

          {submitError ? (
            <p role="alert" className="mt-4 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-3 py-2.5 font-serif text-xs text-state-disputed">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || hashing || blocked || (needsAcknowledgement && !acknowledged)}
            className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-navy py-3 text-sm font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
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

/**
 * What the gateway found when it fetched the document back from its own CID.
 *
 * This is shown before the escrow is created, deliberately: the point of
 * pinning first is that the operator sees the document was retrievable and
 * reads its bill-of-lading fields while they can still change their mind.
 * Afterwards the CID is immutable on chain.
 */
function EblReport({ document_, verification, blocked, needsAcknowledgement, acknowledged, onAcknowledge }) {
  const checks = eblCheckRows(verification);
  const fields = eblFieldRows(verification);
  const documentUrl = eblDocumentUrl(document_.cid);

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-panel border border-sky bg-beige/50 px-3.5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xs uppercase text-ink-faint">IPFS address</span>
          <span className="font-serif text-2xs text-ink-dim">
            {document_.provider === "pinata" ? "Pinata" : "IPFS node"}
          </span>
        </div>
        <p className="mt-1 break-all font-mono text-2xs text-navy">{document_.cid}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {documentUrl ? (
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-2xs uppercase text-teal transition-colors duration-150 hover:text-navy"
            >
              Open the document
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          ) : null}
          {/* The distinction that makes the pin worth anything: the CID was
              recomputed here from the bytes, not simply believed. */}
          <span
            className={`font-mono text-2xs uppercase ${
              document_.cidSelfChecked ? "text-state-attested" : "text-state-pending"
            }`}
          >
            {document_.cidSelfChecked ? "Address reproduced independently" : "Address not reproduced locally"}
          </span>
        </div>
      </div>

      {checks.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {checks.map((check) => (
            <li
              key={check.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs uppercase ${
                check.passed
                  ? "bg-state-attested/10 text-state-attested"
                  : "bg-state-disputed/10 text-state-disputed"
              }`}
            >
              {check.passed ? <Check size={10} aria-hidden="true" /> : <X size={10} aria-hidden="true" />}
              {check.label}
            </li>
          ))}
        </ul>
      ) : null}

      {fields.length ? (
        <div className="rounded-panel border border-sky px-3.5 py-3">
          <p className="mb-2 text-2xs uppercase text-ink-faint">Read from the document</p>
          <dl className="space-y-1">
            {fields.map((field) => (
              <div key={field.key} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-2xs uppercase text-ink-faint">{field.label}</dt>
                <dd className="min-w-0 text-right font-serif text-2xs text-navy">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {verification?.notes?.length ? (
        <ul className="space-y-1.5">
          {verification.notes.map((note) => (
            <li
              key={note}
              className={`flex items-start gap-1.5 rounded-panel px-3 py-2 font-serif text-xs leading-relaxed ${
                blocked
                  ? "border border-state-disputed/40 bg-state-disputed/[0.07] text-state-disputed"
                  : "border border-state-pending/40 bg-state-pending/[0.07] text-state-pending"
              }`}
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
              {note}
            </li>
          ))}
        </ul>
      ) : null}

      {blocked ? (
        <p className="rounded-panel border border-state-disputed/45 bg-state-disputed/[0.08] px-3.5 py-2.5 font-serif text-xs leading-relaxed text-state-disputed">
          {verification?.reason ||
            "The document could not be retrieved from its own address."}{" "}
          Anchoring this address would put a reference on chain that resolves to nothing, so it
          cannot be used. Attach the document again.
        </p>
      ) : null}

      {needsAcknowledgement ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-panel border border-state-pending/45 bg-state-pending/[0.08] px-3.5 py-3">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-state-pending"
          />
          <span className="font-serif text-xs leading-relaxed text-state-pending">
            The document is retrievable and its address checks out, but it did not pass every
            content check above. Anchor it anyway — the verifiers will see the same result.
          </span>
        </label>
      ) : null}
    </div>
  );
}
