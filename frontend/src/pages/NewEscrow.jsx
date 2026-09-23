import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ExternalLink, FileCheck2, Loader2, Lock, Paperclip, Plus, X } from "lucide-react";
import Field, { inputClass } from "../components/Field.jsx";
import { Button, Card, CardTitle, Notice, Tag } from "../components/ui.jsx";
import { CURRENCY_CAPTION, CURRENCY_LABEL } from "../lib/currency.js";
import {
  DOCUMENT_SLOTS,
  QUANTITY_UNITS,
  eblCheckRows,
  eblFieldRows,
  formatBytes,
  goodsFieldRows,
  manifestRows,
  pinDocumentSet,
  shortCid
} from "../lib/ebl.js";
import { eblDocumentUrl } from "../lib/sternApi.js";
import { shortAddress } from "../lib/actors.js";
import CounterpartyLookup, { PickedFrom } from "../components/CounterpartyLookup.jsx";
import { hashShipmentDocument } from "../lib/shipmentHash.js";
import { createEscrow } from "../lib/mockRegistry.js";
import { createEscrowOnChain, onChainConfigured } from "../lib/sternContract.js";
import { validateEscrowForm } from "../lib/validate.js";
import { useLanguage } from "../lib/language.jsx";

const INITIAL_FORM = {
  exporter: "",
  arbiter: "",
  value: "",
  commodity: "",
  // How much of it. The form used to ask only what the commodity was, so an
  // escrow settled 45,000,000 IDRT against "Arabica Gayo Grade 1" and no
  // stated amount — which is not a term anyone could enforce.
  quantity: "",
  quantityUnit: "kg",
  containerRef: "",
  deadline: ""
};

// Changing any of these makes an already-pinned manifest describe a different
// trade than the form does, so the manifest is dropped and has to be pinned
// again. Silently keeping it would put a CID on chain that states a quantity
// nobody on this screen agreed to.
const MANIFEST_INPUTS = ["commodity", "containerRef", "quantity", "quantityUnit"];

export default function NewEscrow({ balance, onCreated, onBack, smartAccountClient, importerAddress }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [document_, setDocument] = useState(null);
  // The files chosen but not yet pinned. Separate from `document_`, which is
  // what came back from the gateway: pinning is an upload that spends quota, so
  // it happens once, on a press, rather than on every file picker change.
  const [files, setFiles] = useState({});
  const [pinning, setPinning] = useState(false);
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
  // The terms no feed can answer: "layak jual", "fit for ocean carriage".
  // Declared here, at creation, because they go inside the manifest that gets
  // pinned — and `documentCid` has no setter, so a clause added later would be
  // a term someone could introduce after the goods shipped.
  const [clauses, setClauses] = useState([]);

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
    return (touched[field] || attemptedSubmit) && errors[field] ? t(errors[field]) : undefined;
  }

  function update(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    // Typed over by hand: the handle no longer describes what is in the field.
    if (name === "exporter" || name === "arbiter") {
      setPickedFrom((current) => (current[name] ? { ...current, [name]: null } : current));
    }
    // The manifest records the quantity, the commodity and the container, so
    // editing any of them makes the pinned one stale.
    if (MANIFEST_INPUTS.includes(name)) dropPinnedManifest();
  }

  /**
   * Forgets a manifest that no longer describes this form.
   *
   * Keeping it would put a CID on chain stating a quantity — or a clause —
   * nobody on this screen agreed to, which is the one thing content addressing
   * is supposed to make impossible.
   */
  function dropPinnedManifest() {
    setDocument((current) => {
      if (!current) return current;
      setSubmitError("");
      setAcknowledged(false);
      return null;
    });
  }

  function addClause() {
    dropPinnedManifest();
    setClauses((current) => [
      ...current,
      // The arbiter by default: they are already the party this escrow appoints
      // to judge what the parties cannot agree on. Editable, because a quality
      // surveyor is often the right reader for a quality term.
      { text: "", milestone: "inspected", reviewer: form.arbiter || "", reviewerRole: "arbiter" }
    ]);
  }

  function updateClause(index, patch) {
    dropPinnedManifest();
    setClauses((current) => current.map((clause, i) => (i === index ? { ...clause, ...patch } : clause)));
  }

  function removeClause(index) {
    dropPinnedManifest();
    setClauses((current) => current.filter((_, i) => i !== index));
  }

  function pickCounterparty(field, address, entry) {
    setForm((current) => ({ ...current, [field]: address }));
    setTouched((current) => ({ ...current, [field]: true }));
    setPickedFrom((current) => ({ ...current, [field]: entry }));
  }

  function markTouched(event) {
    setTouched((current) => ({ ...current, [event.target.name]: true }));
  }

  /** Choosing a file. Nothing leaves the browser until Pin is pressed. */
  function onFileChange(slotKey, event) {
    const file = event.target.files?.[0];
    setFiles((current) => {
      const next = { ...current };
      if (file) next[slotKey] = file;
      else delete next[slotKey];
      return next;
    });
    setDocument(null);
    setAcknowledged(false);
    setSubmitError("");
  }

  async function onPin() {
    const chosen = Object.keys(files).length;
    if (!chosen) return;
    setPinning(true);
    setSubmitError("");
    setDocument(null);
    setAcknowledged(false);
    try {
      if (!form.containerRef.trim() || !form.commodity.trim()) {
        throw new Error(
          t("Fill in Container reference and Commodity first — the container is what the e-BL is checked against.")
        );
      }
      if (!form.quantity.trim()) {
        throw new Error(
          t("Fill in the quantity first — it goes into the manifest, and the manifest's address is what the contract stores.")
        );
      }

      // Checked here rather than left to the gateway's 422, because an
      // incomplete clause is a half-written contract term and the person who can
      // finish it is looking at this form.
      const incomplete = clauses.findIndex(
        (clause) => clause.text.trim().length < 12 || !/^0x[a-fA-F0-9]{40}$/.test(clause.reviewer.trim())
      );
      if (incomplete >= 0) {
        throw new Error(
          `Clause ${incomplete + 1} is not finished — it needs wording of at least 12 characters and the address of the person who will judge it.`
        );
      }

      // The real path: pin the set, and let the gateway read it back by CID and
      // tell us what it found.
      const pinned = await pinDocumentSet(files, {
        containerRef: form.containerRef.trim().toUpperCase(),
        commodity: form.commodity.trim(),
        quantity: { value: form.quantity, unit: form.quantityUnit },
        clauses: clauses.map((clause) => ({
          text: clause.text.trim(),
          kind: "interpretive",
          milestone: clause.milestone,
          reviewer: clause.reviewer.trim(),
          reviewerRole: clause.reviewerRole
        }))
      });
      setDocument({ mode: "ipfs", ...pinned });
    } catch (error) {
      // A deployment with no pinning service is a supported state, not a
      // broken one. Fall back to the local content fingerprint so the escrow
      // can still be created, and label it for what it is — an unpinned hash,
      // not an address anything resolves at.
      if (error.code === "IPFS_NOT_CONFIGURED" || error.code === "API_NOT_CONFIGURED") {
        try {
          // The bill of lading only. The fallback is a local hash of one file,
          // and there is no honest way to make one address stand for three
          // documents without a manifest — which needs the gateway to pin.
          const file = files.billOfLading;
          const local = await hashShipmentDocument(form.containerRef, form.commodity, file);
          setDocument({
            mode: "local",
            cid: local.documentHash,
            fileName: file.name,
            size: file.size,
            reason: error.message
          });
        } catch (fallbackError) {
          setSubmitError(`${t("Could not hash the document:")} ${t(fallbackError.message)}`);
        }
      } else {
        setSubmitError(`${t("Could not pin the documents:")} ${t(error.message)}`);
      }
    } finally {
      setPinning(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setAttemptedSubmit(true);
    setSubmitError("");
    if (!valid) return;

    if (blocked) {
      setSubmitError(
        t("The e-BL could not be verified at its own address, so there is nothing worth anchoring. Attach the document again.")
      );
      return;
    }

    if (needsAcknowledgement && !acknowledged) {
      setSubmitError(t("Confirm you want to anchor this document despite the failed checks."));
      return;
    }

    if (Number(form.value) > Number(balance || 0)) {
      setSubmitError(t("Insufficient IDRT-demo balance — you have {balance}, this escrow needs {value}.", { balance: Number(balance || 0).toLocaleString("id-ID"), value: Number(form.value).toLocaleString("id-ID") }));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        importer: importerAddress,
        exporter: form.exporter,
        arbiter: form.arbiter,
        // The IPFS address of the pinned manifest: the quantity, plus the CIDs
        // of the bill of lading, the invoice and the packing list. Whoever
        // reads this escrow can fetch all of it from that address and check it
        // themselves — which is the only reason a contract should carry one.
        documentCid: document_.cid,
        value: Number(form.value).toFixed(2),
        // The quantity is written into the manifest rather than on chain: the
        // contract has no field for it, and a figure the contract cannot hold
        // is better anchored in the document the contract addresses than
        // smuggled into a string it can.
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
      setSubmitError(t(error.message || "Transaction failed"));
    } finally {
      setSubmitting(false);
    }
  }

  const grossValue = Number(form.value) || 0;
  const containerLabel = form.containerRef.trim().toUpperCase();

  return (
    <div className="w-full">
      <Button icon={ArrowLeft} tone="ghost" size="sm" onClick={onBack} className="-ml-3.5 mb-4">
        {t("Back to escrows")}
      </Button>

      <header className="mb-6 max-w-2xl">
        <p className="text-2xs uppercase text-ink-faint">{t("New settlement instruction")}</p>
        <h1 className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.035em] text-navy">{t("Create an escrow")}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">{t("Set counterparties, shipment terms and the source document in one clear instruction.")}</p>
      </header>

      <div className="new-escrow-note mb-5">
        {t("Creating an escrow makes you its")} <strong className="font-semibold">{t("importer")}</strong>, {t("the party whose funds are locked. The transaction is gasless and sponsored by the paymaster.")}
      </div>

      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="new-escrow-surface new-escrow-counterparties">
            <CardTitle hint={t("Both addresses are checked for format, and for being distinct from each other and from you.")}>
              {t("Counterparties")}
            </CardTitle>
            <div className="space-y-4">
              <Field
                label={t("Exporter wallet")}
                htmlFor="exporter"
                required
                error={showError("exporter")}
                hint={t("Receives IDRT-demo once all three milestones are verified. Demo exporter: 0xfAF7af811FC2D0D2a915D9e2d1ce44463Cb96381")}
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
                label={t("Arbiter wallet")}
                htmlFor="arbiter"
                required
                error={showError("arbiter")}
                hint={t("Resolves disputes — independent of importer and exporter. Demo arbiter: 0x0997657e121213909bE3E9d7701df0753Fb102ed")}
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
            <CardTitle hint={t(CURRENCY_CAPTION)}>{t("Shipment terms")}</CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`${t("Contract value")} (${CURRENCY_LABEL})`}
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
                label={t("Settlement deadline")}
                htmlFor="deadline"
                required
                error={showError("deadline")}
                hint={t("Global safety valve — the importer can refund at any time after this passes.")}
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
              <Field label={t("Commodity")} htmlFor="commodity" required error={showError("commodity")}>
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
                label={t("Container reference")}
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
              {/* How much of it. Without this the escrow settled a contract
                  value against a commodity name and no amount. */}
              <Field
                label={t("Quantity")}
                htmlFor="quantity"
                required
                error={showError("quantity")}
                hint={t("Checked against the invoice and packing list once they are pinned.")}
              >
                <div className="flex gap-2">
                  <input
                    id="quantity"
                    name="quantity"
                    inputMode="decimal"
                    value={form.quantity}
                    onChange={update}
                    onBlur={markTouched}
                    placeholder="320"
                    className={`${inputClass(Boolean(showError("quantity")))} tabular-nums`}
                  />
                  <label className="shrink-0">
                    <span className="sr-only">{t("Unit")}</span>
                    <select
                      name="quantityUnit"
                      value={form.quantityUnit}
                      onChange={update}
                      className={`${inputClass(false)} w-[104px] cursor-pointer`}
                    >
                      {QUANTITY_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Field>
            </div>
          </Card>

          {/* Declared before the documents are pinned, because they are pinned
              with them. A clause here is a promise that a named person will
              answer it in writing before the milestone it governs can be
              committed — nothing scores it, and nothing here pretends to. */}
          <Card>
            <CardTitle
              hint={t(
                "Terms a feed cannot read: merchantable quality, packaging fit for ocean carriage. Each one names the person who must judge it, and the milestone it holds until they have. Their wording goes into the pinned manifest, so it cannot be added or edited after the goods ship."
              )}
              action={
                <Button size="sm" tone="secondary" icon={Plus} onClick={addClause}>
                  {t("Add clause")}
                </Button>
              }
            >
              {t("Interpretive clauses")}
            </CardTitle>

            {clauses.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-ink-dim">
                {t(
                  "None. Every condition on this escrow will be a machine-readable reading — a mass matched, a vessel departed, customs cleared. Add a clause if the contract also says something a person has to decide."
                )}
              </p>
            ) : (
              <div className="space-y-4">
                {clauses.map((clause, index) => (
                  <ClauseRow
                    key={index}
                    index={index}
                    clause={clause}
                    arbiter={form.arbiter}
                    onChange={(patch) => updateClause(index, patch)}
                    onRemove={() => removeClause(index)}
                  />
                ))}
                <p className="text-[13px] leading-relaxed text-ink-dim">
                  {t(
                    "The gateway will refuse to submit a milestone while one of its clauses is unanswered. That refusal is the feature: judgement is not automated here, it is assigned and recorded."
                  )}
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle
              hint={t("Pinned to IPFS, then read back from their own addresses and checked: that the bytes hash to each address, that the bill of lading is one and names container {container}, and that the quantity above agrees with the invoice and packing list. What the contract stores is the address of a manifest naming all three.", { container: containerLabel || "…" })}
            >
              {t("Shipment documents")}
            </CardTitle>

            <div className="space-y-2">
              {DOCUMENT_SLOTS.map((slot) => (
                <FilePicker
                  key={slot.key}
                  slot={slot}
                  file={files[slot.key]}
                  invalid={slot.required && Boolean(showError("document")) && !files[slot.key]}
                  onChange={(event) => onFileChange(slot.key, event)}
                />
              ))}
            </div>

            {/* An explicit press, not an upload on every file change. Pinning
                spends the gateway's quota and writes the manifest from the
                quantity above, so it happens once, after the form agrees with
                itself. */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                tone={document_ ? "secondary" : "primary"}
                size="sm"
                icon={document_ ? FileCheck2 : Paperclip}
                busy={pinning}
                disabled={pinning || !files.billOfLading}
                onClick={onPin}
              >
                {pinning
                  ? t("Pinning and reading back…")
                  : document_
                    ? t("Pin again")
                    : t("Pin {count} documents to IPFS", { count: Object.keys(files).length || "" })}
              </Button>
              {!files.billOfLading ? (
                <span className="text-2xs text-ink-faint">{t("Choose the bill of lading first.")}</span>
              ) : !document_ && !pinning ? (
                <span className="text-2xs text-ink-faint">{t("Nothing has left this browser yet.")}</span>
              ) : null}
            </div>

            {showError("document") ? (
              <p role="alert" className="mt-2 text-[12.5px] text-state-disputed">
                {t(errors.document)}
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
                {t("This gateway has no IPFS pinning service configured, so the document was not pinned. What goes on chain is a local content hash — it identifies the file, but nothing resolves at it and no one else can retrieve the document from it. Set PINATA_JWT on the gateway to pin for real.")}
              </Notice>
            ) : null}
          </Card>
        </div>

        {/* Review rail. DESIGN.md: the final review names importer, exporter,
            arbiter, contract value and the action being signed before anything
            is committed. */}
        <Card as="aside" className="new-escrow-surface new-escrow-review h-fit lg:sticky lg:top-0">
          <CardTitle>{t("Review and lock")}</CardTitle>
          <div className="divide-y divide-sky/70">
            <Row label={t("Deposit")} value={`${grossValue.toLocaleString("id-ID")} ${CURRENCY_LABEL}`} />
            <Row
              label={t("Your balance")}
              value={`${Number(balance || 0).toLocaleString("id-ID")} ${CURRENCY_LABEL}`}
            />
            <Row label={t("You sign as")} value={t("Importer")} />
            <Row label={t("Exporter")} value={shortAddress(form.exporter) || t("not set")} />
            <Row label={t("Arbiter")} value={shortAddress(form.arbiter) || t("not set")} />
            <Row label={t("Milestones")} value={t("3 milestones: inspected, shipped, cleared")} />
            <Row label={t("Challenge window")} value={t("6h per milestone")} />
            <Row label={t("Timelock")} value={t("24h after final milestone")} />
            <Row label={t("Dispute path")} value={t("Arbiter decides, 2% buyer bond")} />
            <Row
              label={t("Quantity")}
              value={
                form.quantity.trim()
                  ? `${Number(form.quantity).toLocaleString("id-ID")} ${form.quantityUnit}`
                  : t("not stated")
              }
            />
            <Row
              label={t("Documents")}
              value={
                document_
                  ? document_.mode === "ipfs"
                    ? t("{count} pinned · {cid}", { count: Object.keys(document_.documents || {}).length, cid: shortCid(document_.cid) })
                    : t("Local hash, not pinned")
                  : t("{count} chosen, not pinned", { count: Object.keys(files).length || t("None") })
              }
            />
            <Row
              label="Human review"
              value={
                clauses.length
                  ? `${clauses.length} clause${clauses.length === 1 ? "" : "s"} to be judged`
                  : "None — all conditions automated"
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
            disabled={submitting || pinning || blocked || (needsAcknowledgement && !acknowledged)}
            icon={Lock}
            className="mt-5"
          >
            {submitting
              ? onChainConfigured
                ? t("Locking funds on chain…")
                : t("Locking funds…")
              : t("Lock funds in escrow")}
          </Button>
          <p className="mt-2.5 text-center text-2xs text-ink-faint">
            {onChainConfigured
              ? t("Gasless — sponsored by Pimlico")
              : t("Demo data — nothing is sent on chain")}
          </p>
        </Card>
      </form>
    </div>
  );
}

/**
 * One interpretive clause, as it will be written into the manifest.
 *
 * Three fields and no more, because each answers a question that has to have an
 * answer before this is worth writing down: what does the contract say, which
 * milestone does it hold, and who answers for it. A clause with no named
 * reviewer is a clause nobody owns, and the gateway refuses it.
 */
function ClauseRow({ index, clause, arbiter, onChange, onRemove }) {
  const short = clause.text.trim().length > 0 && clause.text.trim().length < 12;
  const badAddress =
    clause.reviewer.trim().length > 0 && !/^0x[a-fA-F0-9]{40}$/.test(clause.reviewer.trim());

  return (
    <div className="rounded-panel border border-sky bg-surface-soft/60 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-2xs uppercase text-ink-faint">Clause {index + 1}</p>
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-2xs uppercase text-ink-faint transition-colors duration-150 hover:text-state-disputed"
        >
          Remove
        </button>
      </div>

      <label htmlFor={`clause-text-${index}`} className="sr-only">
        Clause wording
      </label>
      <textarea
        id={`clause-text-${index}`}
        rows={2}
        value={clause.text}
        onChange={(event) => onChange({ text: event.target.value })}
        placeholder="Biji kopi harus dalam kondisi layak jual dan bebas dari bau apek."
        className={`${inputClass(short)} resize-y`}
      />
      {short ? (
        <p className="mt-1 text-[12.5px] text-state-disputed">
          Write it out — this is the wording someone will be asked to judge, and it is fixed the
          moment the manifest is pinned.
        </p>
      ) : null}

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className="text-2xs uppercase text-ink-faint">Holds milestone</span>
          <select
            value={clause.milestone}
            onChange={(event) => onChange({ milestone: event.target.value })}
            className={`${inputClass(false)} mt-1 cursor-pointer`}
          >
            <option value="inspected">Inspected</option>
            <option value="shipped">Shipped</option>
            <option value="arrived_cleared">Arrived and cleared</option>
          </select>
        </label>
        <label className="block">
          <span className="text-2xs uppercase text-ink-faint">Judged by</span>
          <input
            value={clause.reviewer}
            onChange={(event) => onChange({ reviewer: event.target.value })}
            placeholder={arbiter || "0x…"}
            spellCheck="false"
            className={`${inputClass(badAddress)} mt-1 font-mono text-xs`}
          />
        </label>
      </div>
      {badAddress ? (
        <p className="mt-1 text-[12.5px] text-state-disputed">
          That is not a wallet address. The reviewer signs in with it to record their verdict.
        </p>
      ) : null}
      <p className="mt-1.5 text-2xs text-ink-faint">
        {clause.reviewer.trim() && arbiter && clause.reviewer.trim().toLowerCase() === arbiter.toLowerCase()
          ? "The arbiter on this escrow."
          : "Anyone you appoint — a surveyor, a lab, your own quality manager."}
      </p>
    </div>
  );
}

/**
 * One document slot. Chosen here, uploaded later — see onPin.
 *
 * The optional ones are not hidden behind a disclosure: the whole point of this
 * change is that the invoice and the packing list are what state the quantity,
 * and a form that tucks them away teaches the opposite.
 */
function FilePicker({ slot, file, invalid, onChange }) {
  const { t } = useLanguage();
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-panel border border-dashed px-3.5 py-3 transition-colors duration-150 ${
        invalid ? "border-state-disputed/60" : file ? "border-teal/50 bg-surface-soft" : "border-sky hover:border-teal/50"
      }`}
    >
      <input type="file" accept="application/pdf,.pdf" onChange={onChange} className="sr-only" />
      {file ? (
        <FileCheck2 size={16} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
      ) : (
        <Paperclip size={16} className="mt-0.5 shrink-0 text-ink-dim" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium text-navy">
          {t(slot.label)}
          {slot.required ? (
            <span className="text-state-disputed" aria-label={t("required")}>*</span>
          ) : (
            <span className="text-2xs font-normal text-ink-faint">{t("optional")}</span>
          )}
        </span>
        {file ? (
          <span className="mt-0.5 block truncate text-2xs text-teal">
            {file.name} <span className="text-ink-faint">({formatBytes(file.size)})</span>
          </span>
        ) : (
          <span className="mt-0.5 block font-serif text-2xs leading-relaxed text-ink-dim">{t(slot.hint)}</span>
        )}
      </span>
    </label>
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
  const { t } = useLanguage();
  const checks = eblCheckRows(verification);
  const fields = eblFieldRows(verification);
  const goods = goodsFieldRows(verification);
  const contents = manifestRows(verification);
  const documentUrl = eblDocumentUrl(document_.cid);

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-panel border border-sky bg-surface-soft px-3.5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="text-[13px] text-ink-dim">
            {t(verification?.kind === "manifest" ? "Manifest address — this goes on chain" : "IPFS address")}
          </span>
          <span className="text-2xs text-ink-faint">
            {document_.provider === "pinata" ? "Pinata" : t("IPFS node")}
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
              {t("Open the document")}
              <ExternalLink size={10} aria-hidden="true" />
            </a>
          ) : null}
          {/* The distinction that makes the pin worth anything: the CID was
              recomputed here from the bytes, not simply believed. */}
          <Tag tone={document_.cidSelfChecked ? "attested" : "pending"}>
            {document_.cidSelfChecked
              ? t("Address reproduced independently")
              : t("Address not reproduced locally")}
          </Tag>
        </div>
      </div>

      {checks.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {checks.map((check) => (
            <li key={check.key}>
              {/* An advisory check that failed is amber, not red: it is a
                  disagreement worth seeing, not a refusal. */}
              <Tag
                tone={check.passed ? "attested" : check.advisory ? "pending" : "disputed"}
                icon={check.passed ? Check : check.advisory ? AlertTriangle : X}
              >
                {t(check.label)}
              </Tag>
            </li>
          ))}
        </ul>
      ) : null}

      {/* What the one address on chain actually commits to. Each document has
          its own CID inside the manifest and can be opened on its own. */}
      {contents.length ? (
        <div className="rounded-panel border border-sky px-3.5 py-3">
          <p className="mb-2 text-[13px] text-ink-dim">{t("Behind that one address")}</p>
          <ul className="divide-y divide-sky/70">
            {contents.map((row) => (
              <li key={row.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="shrink-0 text-2xs text-ink-faint">{t(row.label)}</span>
                <span className="min-w-0 text-right">
                  <span className="block truncate text-2xs text-navy">{row.value}</span>
                  {row.cid ? (
                    <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2">
                      <a
                        href={eblDocumentUrl(row.cid)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-2xs text-teal transition-colors duration-150 hover:text-navy"
                      >
                        {shortCid(row.cid)}
                      </a>
                      {row.digestMatches === false ? (
                        <span className="text-2xs text-state-disputed">{t("digest differs")}</span>
                      ) : null}
                      {row.resolves === false ? (
                        <span className="text-2xs text-state-disputed">{t("does not resolve")}</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {verification?.manifest?.quantityCheck?.comparable ? (
        <Notice
          tone={verification.manifest.quantityCheck.agrees ? "info" : "pending"}
          icon={verification.manifest.quantityCheck.agrees ? Check : AlertTriangle}
        >
          {t(verification.manifest.quantityCheck.reason)}
        </Notice>
      ) : null}

      {fields.length ? (
        <div className="rounded-panel border border-sky px-3.5 py-3">
          <p className="mb-2 text-[13px] text-ink-dim">{t("Read from the bill of lading")}</p>
          <dl className="divide-y divide-sky/70">
            {fields.map((field) => (
              <div key={field.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="shrink-0 text-2xs text-ink-faint">{t(field.label)}</dt>
                <dd className="min-w-0 text-right text-2xs text-navy">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {goods.length ? (
        <div className="rounded-panel border border-sky px-3.5 py-3">
          <p className="mb-2 text-[13px] text-ink-dim">{t("Read from the invoice and packing list")}</p>
          <dl className="divide-y divide-sky/70">
            {goods.map((field) => (
              <div key={field.key} className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="shrink-0 text-2xs text-ink-faint">{t(field.label)}</dt>
                <dd className="min-w-0 text-right text-2xs text-navy">{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {verification?.notes?.length
        ? verification.notes.map((note) => (
            <Notice key={note} tone={blocked ? "disputed" : "pending"} icon={AlertTriangle}>
              {t(note)}
            </Notice>
          ))
        : null}

      {blocked ? (
        <Notice tone="disputed">
          {t(verification?.reason || "The document could not be retrieved from its own address.")}{" "}
          {t("Anchoring this address would put a reference on chain that resolves to nothing, so it cannot be used. Attach the document again.")}
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
            {t("The document is retrievable and its address checks out, but it did not pass every content check above. Anchor it anyway — the verifiers will see the same result.")}
          </span>
        </label>
      ) : null}
    </div>
  );
}
