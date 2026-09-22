import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileCheck2, Loader2, Lock, Paperclip, X } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { Button, Card, CardTitle, Notice, Tag } from "../components/ui.jsx";
import { CURRENCY_CAPTION, CURRENCY_LABEL } from "../lib/currency.js";
import { eblCheckRows, eblFieldRows, formatBytes, pinEbl, shortCid } from "../lib/ebl.js";
import { eblDocumentUrl } from "../lib/sternApi.js";
import { shortAddress } from "../lib/actors.js";
import CounterpartyLookup, { PickedFrom } from "../components/CounterpartyLookup.jsx";
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
  // Which directory entry filled each address field, if any. Kept so the form
  // can show where the address came from — the handle is a convenience, the
  // address is what binds.
  const [pickedFrom, setPickedFrom] = useState({ exporter: null, arbiter: null });

  const { errors, valid } = useMemo(
    () => validateEscrowForm(form, document_?.cid),
    [form, document_]
  );

  // The two kinds of problem a pinned document can have, kept apart on
  // purpose.
  //
  // `blocked` is structural: nothing resolves at the CID, or the bytes that do
  // resolve hash to something else. Anchoring that on chain would write an
  // address that proves nothing, which is the exact failure the IPFS work
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
    // Typed over by hand: the handle no longer describes what is in the field.
    if (name === "exporter" || name === "arbiter") {
      setPickedFrom((current) => (current[name] ? { ...current, [name]: null } : current));
    }
  }

  function pickCounterparty(field, address, entry) {
    setForm((current) => ({ ...current, [field]: address }));
    setTouched((current) => ({ ...current, [field]: true }));
    setPickedFrom((current) => ({ ...current, [field]: entry }));
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
  const containerLabel = form.containerRef.trim().toUpperCase();

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
                hint="Receives IDRT-demo once all three milestones are verified. Demo exporter: 0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381"
              >
                <CounterpartyLookup
                  label="exporter"
                  onPick={(address, entry) => pickCounterparty("exporter", address, entry)}
                />
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
                <PickedFrom
                  entry={pickedFrom.exporter}
                  onClear={() => setPickedFrom((current) => ({ ...current, exporter: null }))}
                />
              </Field>
              <Field
                label="Arbiter wallet"
                htmlFor="arbiter"
                required
                error={showError("arbiter")}
                hint="Resolves disputes — independent of importer and exporter. Demo arbiter: 0x0997657e121213909bE3E9d7701df0753Fb102ed"
              >
                <CounterpartyLookup
                  label="arbiter"
                  onPick={(address, entry) => pickCounterparty("arbiter", address, entry)}
                />
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
                <PickedFrom
                  entry={pickedFrom.arbiter}
                  onClear={() => setPickedFrom((current) => ({ ...current, arbiter: null }))}
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
            <CardTitle
              hint={`Pinned to IPFS, then read back from its own address and checked: that the bytes hash to the address, and that the document is a bill of lading for container ${containerLabel || "…"}. The contract stores that address.`}
            >
              Electronic bill of lading
            </CardTitle>
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-panel border border-dashed px-3.5 py-3.5 transition-colors duration-150 ${
                showError("document") ? "border-state-disputed/60" : "border-sky hover:border-teal/50"
              }`}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={onFileChange}
                className="sr-only"
              />
              {hashing ? (
                <Loader2 size={17} className="shrink-0 animate-spin text-teal" aria-hidden="true" />
              ) : blocked ? (
                <AlertTriangle size={17} className="shrink-0 text-state-disputed" aria-hidden="true" />
              ) : document_ ? (
                <FileCheck2 size={17} className="shrink-0 text-state-attested" aria-hidden="true" />
              ) : (
                <Paperclip size={17} className="shrink-0 text-ink-dim" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {hashing ? (
                  <span className="text-[13px] text-teal">Pinning to IPFS and reading it back…</span>
                ) : document_ ? (
                  <>
                    <span className="block truncate text-[13px] font-medium text-navy">
                      {document_.fileName}{" "}
                      <span className="font-normal text-ink-dim">({formatBytes(document_.size)})</span>
                    </span>
                    <span className="block truncate font-mono text-2xs text-teal">
                      {document_.mode === "ipfs" ? document_.cid : `${document_.cid.slice(0, 24)}…`}
                    </span>
                  </>
                ) : (
                  <span className="text-[13px] text-ink-dim">Choose the e-BL — PDF</span>
                )}
              </span>
            </label>
            {showError("document") ? (
              <p role="alert" className="mt-2 text-[12.5px] text-state-disputed">
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
              <Notice tone="pending" icon={AlertTriangle} className="mt-3">
                This gateway has no IPFS pinning service configured, so the document was not pinned.
                What goes on chain is a local content hash — it identifies the file, but nothing
                resolves at it and no one else can retrieve the document from it. Set{" "}
                <span className="font-mono">PINATA_JWT</span> on the gateway to pin for real.
              </Notice>
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
            disabled={submitting || hashing || blocked || (needsAcknowledgement && !acknowledged)}
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
      <div className="rounded-panel border border-sky bg-surface-soft px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[13px] text-ink-dim">IPFS address</span>
          <span className="text-2xs text-ink-faint">
            {document_.provider === "pinata" ? "Pinata" : "IPFS node"}
          </span>
        </div>
        <p className="mt-1 break-all font-mono text-2xs text-navy">{document_.cid}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {documentUrl ? (
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-2xs font-medium text-teal transition-colors duration-150 hover:text-navy"
            >
              Open the document
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          ) : null}
          {/* The distinction that makes the pin worth anything: the CID was
              recomputed here from the bytes, not simply believed. */}
          <Tag tone={document_.cidSelfChecked ? "attested" : "pending"}>
            {document_.cidSelfChecked
              ? "Address reproduced independently"
              : "Address not reproduced locally"}
          </Tag>
        </div>
      </div>

      {checks.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {checks.map((check) => (
            <li key={check.key}>
              <Tag tone={check.passed ? "attested" : "disputed"} icon={check.passed ? Check : X}>
                {check.label}
              </Tag>
            </li>
          ))}
        </ul>
      ) : null}

      {fields.length ? (
        <div className="rounded-panel border border-sky px-3.5 py-3">
          <p className="mb-2 text-[13px] text-ink-dim">Read from the document</p>
          <dl className="divide-y divide-sky/70">
            {fields.map((field) => (
              <div key={field.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="shrink-0 text-2xs text-ink-faint">{field.label}</dt>
                <dd className="min-w-0 text-right text-2xs text-navy">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {verification?.notes?.length
        ? verification.notes.map((note) => (
            <Notice key={note} tone={blocked ? "disputed" : "pending"} icon={AlertTriangle}>
              {note}
            </Notice>
          ))
        : null}

      {blocked ? (
        <Notice tone="disputed">
          {verification?.reason || "The document could not be retrieved from its own address."}{" "}
          Anchoring this address would put a reference on chain that resolves to nothing, so it
          cannot be used. Attach the document again.
        </Notice>
      ) : null}

      {needsAcknowledgement ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-panel border border-state-pending/45 bg-state-pending/[0.08] px-3.5 py-3">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-state-pending"
          />
          <span className="text-[13px] leading-relaxed text-state-pending">
            The document is retrievable and its address checks out, but it did not pass every
            content check above. Anchor it anyway — the verifiers will see the same result.
          </span>
        </label>
      ) : null}
    </div>
  );
}
