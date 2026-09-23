import { useCallback, useEffect, useState } from "react";
import { Handshake, Loader2 } from "lucide-react";
import {
  acceptSettlement,
  apiConfigured,
  eblDocumentUrl,
  getNegotiation,
  proposeSettlement,
  withdrawSettlement
} from "../lib/sternApi.js";
import { AddressLink } from "./TxLink.jsx";
import { inputClass } from "./Field.jsx";
import { CURRENCY_LABEL } from "../lib/currency.js";
import { shortCid } from "../lib/ebl.js";
import { useLanguage } from "../lib/language.jsx";

// What the two parties can do after a dispute is raised, and before the arbiter
// has to impose an answer.
//
// The contract freezes a disputed escrow and gives the arbiter one binary
// choice: everything to the exporter, or everything back to the importer. That
// is a fine backstop and a poor first resort, because most trade disputes are
// not "who was right" but "what is this shipment now worth". A mechanism that
// can only award all or nothing pushes both sides to fight for all, since
// conceding anything costs them everything.
//
// So this sits in front of the arbiter. While the dispute is open the importer
// and exporter exchange concrete, recorded proposals; when both sign the same
// one, the gateway pins it and the arbiter executes THAT instead of deciding
// for them.
//
// One thing this panel must never do: claim a settlement is executable when the
// deployed contract cannot execute it. A negotiated split needs
// resolveDisputeByAgreement, and a deployment made before that function existed
// does not have it. The gateway probes the deployed bytecode and says which it
// is; this renders that answer rather than assuming one.

const OUTCOME_LABEL = {
  release_to_exporter: "Release to the exporter",
  refund_to_importer: "Refund to the importer",
  split: "Split by agreement"
};

const MIN_NOTE = 20;

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

// The gateway talks in the token's smallest unit and states the scale
// (`decimals`, 2 for IDRT-demo). Printing 4275000000 as a rupiah figure without
// it would be off by a factor of a hundred, which on a settlement is not a
// rounding problem.
function money(units, decimals = 2) {
  if (units == null) return "—";
  try {
    const value = Number(BigInt(units)) / 10 ** decimals;
    return `${value.toLocaleString("id-ID", { maximumFractionDigits: decimals })} ${CURRENCY_LABEL}`;
  } catch {
    return "—";
  }
}

export default function NegotiationPanel({ escrowId, walletAddress, escrow, onStateChanged }) {
  const { t } = useLanguage();
  const decimals = Number(escrow?.decimals ?? 2);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The gateway answered 404: it is older than this feature.
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(
    async (signal) => {
      setError("");
      try {
        setThread(await getNegotiation(escrowId, { signal }));
      } catch (err) {
        if (err.name === "AbortError") return;
        // A 404 here means this gateway has no such route — an older deployment,
        // which happens routinely because a push to master redeploys the
        // frontend on its own while the gateway is updated separately. That is
        // not a failure to report on every escrow page; the panel simply has
        // nothing to say, exactly as for an escrow that declared nothing.
        if (err.status === 404) setUnsupported(true);
        else setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [escrowId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const isImporter = same(escrow?.importer, walletAddress);
  const isExporter = same(escrow?.exporter, walletAddress);
  const isParty = isImporter || isExporter;
  const isArbiter = same(escrow?.arbiter, walletAddress);

  async function act(key, fn) {
    setBusy(key);
    setError("");
    try {
      await fn();
      setComposing(false);
      await load();
      onStateChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (!apiConfigured || unsupported) return null;

  if (loading) {
    return (
      <Card>
        <Head />
        <p className="mt-2 flex items-center gap-2 font-serif text-sm text-ink-dim">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          {t("Reading the settlement thread…")}
        </p>
      </Card>
    );
  }

  const proposals = thread?.proposals || [];
  const agreement = thread?.agreement || null;
  const live = proposals.filter((p) => !p.superseded && !p.acceptedBy).slice(-1)[0] || null;
  const splitExecutable = thread?.outcomes?.split?.executable === true;

  return (
    <Card>
      <Head />
      <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
        {t("A dispute leaves the arbiter one binary choice — the whole value to the exporter, or the whole value back to the importer. Most quality claims are not worth either. Agree on the figure here and the arbiter executes your agreement instead of deciding for you.")}
      </p>

      {error ? (
        <p className="mt-3 border-l-2 border-state-disputed pl-3 font-serif text-sm leading-relaxed text-state-disputed">
          {t(error)}
        </p>
      ) : null}

      {!splitExecutable ? (
        // Said before anyone proposes a split, not after both have signed one.
        <p className="mt-3 border-l-2 border-state-pending pl-3 font-serif text-sm leading-relaxed text-state-pending">
          {t("The contract at this address can only release or refund in full, so a partial split cannot be executed on chain here. You can still record one — it is a real agreement and it is pinned — but settling it needs a deployment that has")}{" "}
          <code className="font-mono text-xs">resolveDisputeByAgreement()</code>.
        </p>
      ) : null}

      {agreement ? (
        <Agreement
          agreement={agreement}
          decimals={decimals}
          canWithdraw={isParty && !busy}
          busy={busy === "withdraw"}
          onWithdraw={() => act("withdraw", () => withdrawSettlement(escrowId, { by: walletAddress }))}
        />
      ) : null}

      {proposals.length ? (
        <ul className="mt-4 divide-y divide-sky/70 border-t border-sky/70">
          {proposals.map((proposal) => (
            <Proposal
              key={proposal.id}
              proposal={proposal}
              decimals={decimals}
              mine={same(proposal.by, walletAddress)}
              canAccept={isParty && !same(proposal.by, walletAddress) && !proposal.superseded && !agreement}
              busy={busy === proposal.id}
              onAccept={() =>
                act(proposal.id, () => acceptSettlement(escrowId, proposal.id, { by: walletAddress }))
              }
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-sky/70 pt-4 font-serif text-sm leading-relaxed text-ink-dim">
          {t("Nothing proposed yet.")}
        </p>
      )}

      {isParty && !agreement ? (
        composing ? (
          <ProposalForm
            contractValue={escrow?.contractValue}
            decimals={decimals}
            splitExecutable={splitExecutable}
            counterTo={live}
            busy={busy === "propose"}
            onCancel={() => setComposing(false)}
            onSubmit={(body) =>
              act("propose", () => proposeSettlement(escrowId, { by: walletAddress, ...body }))
            }
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="mt-4 cursor-pointer font-mono text-2xs uppercase text-teal transition-colors duration-150 hover:text-navy"
          >
            {t(live ? "Counter this proposal" : "Propose a settlement")}
          </button>
        )
      ) : null}

      {isArbiter ? (
        <p className="mt-4 border-t border-sky/70 pt-3 font-serif text-xs leading-relaxed text-ink-dim">
          {t("You are the arbiter on this escrow. If the parties agree, execute their agreement from the ops console, where your own key signs — the gateway never holds a key that can settle a dispute.")}
        </p>
      ) : null}

      {!isParty && !isArbiter ? (
        <p className="mt-4 border-t border-sky/70 pt-3 font-serif text-xs leading-relaxed text-ink-dim">
          {t("Only the importer and the exporter can propose or accept a settlement. You can read the thread in full.")}
        </p>
      ) : null}
    </Card>
  );
}

function Agreement({ agreement, decimals, canWithdraw, busy, onWithdraw }) {
  const { t } = useLanguage();
  const executable = agreement.executable === true;
  return (
    <div
      className={`mt-3 border-l-2 pl-3 ${
        executable ? "border-state-attested" : "border-state-pending"
      }`}
    >
      <p className="font-mono text-2xs uppercase text-ink-faint">
        {t("Agreed")} · {new Date(agreement.agreedAt).toLocaleString("id-ID")}
      </p>
      <p className="mt-1 font-serif text-sm leading-relaxed text-navy">
        {t(OUTCOME_LABEL[agreement.outcome] || agreement.outcome)}
        {agreement.outcome === "split" && agreement.amountToExporter ? (
          <>
            {" — "}
            <span className="tabular-nums">{money(agreement.amountToExporter, decimals)}</span>{" "}
            {t("to the exporter")}
            {agreement.splitToExporterBps
              ? ` (${(agreement.splitToExporterBps / 100).toFixed(2).replace(/\.00$/, "")}%)`
              : ""}
            {t(", the rest returned to the importer.")}
          </>
        ) : null}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs uppercase text-ink-faint">
        <AddressLink address={agreement.proposedBy} label={t("proposed by")} />
        <AddressLink address={agreement.acceptedBy} label={t("accepted")} />
        {/* The agreement is pinned, so what the arbiter writes on chain is the
            parties' own document rather than a third party's summary of it. */}
        {agreement.cid ? (
          <a
            href={eblDocumentUrl(agreement.cid) || undefined}
            target="_blank"
            rel="noreferrer"
            title={agreement.cid}
            className="text-teal transition-colors duration-150 hover:text-navy"
          >
            {shortCid(agreement.cid)}
          </a>
        ) : (
          <span className="text-state-pending">{t("not pinned")}</span>
        )}
      </p>

      <p
        className={`mt-2 font-serif text-xs leading-relaxed ${
          executable ? "text-state-attested" : "text-state-pending"
        }`}
      >
        {executable ? agreement.arbiterInstruction : agreement.blockedReason}
      </p>
      {!executable && agreement.fallback ? (
        <p className="mt-1 font-serif text-xs leading-relaxed text-ink-dim">{agreement.fallback}</p>
      ) : null}

      {canWithdraw ? (
        <button
          type="button"
          onClick={onWithdraw}
          disabled={busy}
          className="mt-2.5 cursor-pointer font-mono text-2xs uppercase text-ink-faint transition-colors duration-150 hover:text-navy disabled:opacity-50"
        >
          {t(busy ? "Withdrawing…" : "Withdraw and renegotiate")}
        </button>
      ) : null}
    </div>
  );
}

function Proposal({ proposal, decimals, mine, canAccept, busy, onAccept }) {
  const { t } = useLanguage();
  const state = proposal.acceptedBy
    ? { tone: "attested", label: "Accepted" }
    : proposal.superseded
      ? { tone: "muted", label: "Superseded" }
      : { tone: "pending", label: "On the table" };

  return (
    <li className={`py-4 ${proposal.superseded ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-2xs uppercase text-ink-faint">
          {t(proposal.byRole)}
          {mine ? ` · ${t("you")}` : ""} · {new Date(proposal.at).toLocaleString("id-ID")}
        </p>
        <Dot tone={state.tone}>{t(state.label)}</Dot>
      </div>

      <p className="mt-1.5 font-serif text-sm leading-relaxed text-navy">
        {t(OUTCOME_LABEL[proposal.outcome] || proposal.outcome)}
        {proposal.outcome === "split" ? (
          <>
            {" — "}
            <span className="tabular-nums">{money(proposal.amountToExporter, decimals)}</span>{" "}
            {t("to the exporter")}
            {proposal.splitToExporterBps
              ? ` (${(proposal.splitToExporterBps / 100).toFixed(2).replace(/\.00$/, "")}%)`
              : ""}
          </>
        ) : null}
      </p>
      <p className="mt-1 font-serif text-sm leading-relaxed text-ink-dim">{proposal.note}</p>

      {canAccept ? (
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="mt-2.5 flex cursor-pointer items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          {t(busy ? "Signing…" : "Accept this settlement")}
        </button>
      ) : null}
      {mine && !proposal.superseded && !proposal.acceptedBy ? (
        <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
          {t("Waiting on your counterparty. You cannot accept your own proposal — a settlement takes two.")}
        </p>
      ) : null}
    </li>
  );
}

function ProposalForm({ contractValue, decimals, splitExecutable, counterTo, busy, onCancel, onSubmit }) {
  const { t } = useLanguage();
  const [outcome, setOutcome] = useState("split");
  const [percent, setPercent] = useState("85");
  const [note, setNote] = useState("");

  const bps = Math.round(Number(percent) * 100);
  const bpsValid = Number.isInteger(bps) && bps >= 1 && bps <= 9999;
  const shortNote = note.trim().length < MIN_NOTE;
  const blocked = outcome === "split" && !bpsValid;

  // The figure, in money, before it is proposed. A percentage the counterparty
  // has to convert themselves is a percentage they will convert differently.
  let preview = null;
  if (outcome === "split" && bpsValid && contractValue) {
    try {
      const toExporter = (BigInt(contractValue) * BigInt(bps)) / 10000n;
      preview = {
        exporter: money(toExporter.toString(), decimals),
        importer: money((BigInt(contractValue) - toExporter).toString(), decimals)
      };
    } catch {
      preview = null;
    }
  }

  return (
    <form
      className="mt-4 border-t border-sky/70 pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (shortNote || blocked) return;
        onSubmit({ outcome, note: note.trim(), ...(outcome === "split" ? { splitToExporterBps: bps } : {}) });
      }}
    >
      {counterTo ? (
        <p className="font-serif text-xs leading-relaxed text-ink-dim">
          {t("This replaces the proposal currently on the table, so only one offer is ever live.")}
        </p>
      ) : null}

      <p className="mt-2 font-mono text-2xs uppercase text-ink-faint">{t("What you propose")}</p>
      <div className="mt-2 space-y-1.5">
        {Object.entries(OUTCOME_LABEL).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-1.5 font-serif text-sm text-navy has-[:disabled]:text-ink-faint"
          >
            <input
              type="radio"
              name="outcome"
              value={key}
              checked={outcome === key}
              onChange={() => setOutcome(key)}
              className="accent-teal"
            />
            {t(label)}
            {key === "split" && !splitExecutable ? (
              <span className="font-mono text-2xs uppercase text-state-pending">
                {t("recorded, not executable here")}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      {outcome === "split" ? (
        <div className="mt-3">
          <label htmlFor="split-percent" className="block font-mono text-2xs uppercase text-ink-faint">
            {t("Share to the exporter")}
          </label>
          <div className="mt-1 flex items-center gap-2">
            {/* Boxed at a fixed width rather than overriding inputClass's
                w-full, which Tailwind resolves by stylesheet order and not by
                the order these classes are written in. */}
            <div className="w-28 shrink-0">
              <input
                id="split-percent"
                type="number"
                min="0.01"
                max="99.99"
                step="0.01"
                value={percent}
                onChange={(event) => setPercent(event.target.value)}
                className={`${inputClass(false)} font-mono tabular-nums`}
              />
            </div>
            <span className="font-serif text-sm text-ink-dim">{t("% of the escrow value")}</span>
          </div>
          {preview ? (
            <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
              <span className="tabular-nums text-navy">{preview.exporter}</span>{" "}
              {t("to the exporter")},{" "}
              <span className="tabular-nums text-navy">{preview.importer}</span>{" "}
              {t("back to the importer.")}
            </p>
          ) : null}
          {!bpsValid ? (
            <p className="mt-1.5 font-serif text-xs leading-relaxed text-state-pending">
              {t("A split is between 0.01% and 99.99%. Nothing and everything are the other two options.")}
            </p>
          ) : null}
        </div>
      ) : null}

      <label htmlFor="settlement-note" className="mt-3 block font-mono text-2xs uppercase text-ink-faint">
        {t("Why")}
      </label>
      <textarea
        id="settlement-note"
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t("The figure, and what it is based on.")}
        className={`${inputClass(false)} mt-1 font-serif`}
      />
      <p
        className={`mt-1 font-serif text-xs leading-relaxed ${
          shortNote ? "text-state-pending" : "text-ink-dim"
        }`}
      >
        {shortNote
          ? t("{count} more characters. A number with no reason behind it can only be refused, not answered.", {
              count: MIN_NOTE - note.trim().length
            })
          : t("Your counterparty sees this, and so does the arbiter if it comes to that.")}
      </p>

      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={busy || shortNote || blocked}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          {t(busy ? "Posting…" : "Post proposal")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="cursor-pointer font-mono text-2xs uppercase text-ink-faint transition-colors duration-150 hover:text-navy disabled:opacity-50"
        >
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

function Card({ children }) {
  return (
    <section className="stern-workspace-card rounded-doc bg-surface p-5 shadow-card lg:p-6">
      {children}
    </section>
  );
}

function Head() {
  const { t } = useLanguage();
  return (
    <h2 className="flex items-center gap-2 font-mono text-2xs uppercase text-ink-faint">
      <Handshake size={12} aria-hidden="true" />
      {t("Negotiated settlement · before the arbiter decides")}
    </h2>
  );
}

function Dot({ tone, children }) {
  const text = {
    attested: "text-state-attested",
    pending: "text-state-pending",
    disputed: "text-state-disputed",
    muted: "text-ink-dim"
  }[tone];
  const dot = {
    attested: "bg-state-attested",
    pending: "bg-state-pending",
    disputed: "bg-state-disputed",
    muted: "bg-ink-faint"
  }[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs uppercase ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}
