import { useCallback, useEffect, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { apiConfigured, eblDocumentUrl, getClauses, reviewClause } from "../lib/sternApi.js";
import { useLanguage } from "../lib/language.jsx";
import { AddressLink } from "./TxLink.jsx";
import { inputClass } from "./Field.jsx";
import { shortCid } from "../lib/ebl.js";

// The clauses no feed can answer, and the person who has to.
//
// Everything else in this workspace is a reading: a mass matched, a vessel
// departed, customs cleared. A contract that says "biji kopi harus dalam
// kondisi layak jual" is not a reading, and scoring it with a model would put
// the least defensible number on the most important screen.
//
// So this panel does the opposite of hiding the judgement. It shows which
// clauses need a human, who that human is, whether they have answered, and the
// argument they gave. Until a required clause has an answer, the gateway will
// not submit the milestone it governs — the same refusal it makes for a wrong
// e-BL. Nothing here verifies anything; it records who decided and why.

// Named here rather than taken from the gateway's response. The gateway's own
// labels are Indonesian only (backend/oracle-gateway/clauseService.js), and the
// workspace is bilingual — rendering its label would pin these rows to one
// language while every other row followed the toggle.
const VERDICTS = [
  {
    key: "met",
    label: "Met",
    hint: "The clause is satisfied.",
    tone: "attested"
  },
  {
    key: "met_with_reservation",
    label: "Met with reservation",
    // The reason this option exists at all: a reviewer whose only choices are
    // "fine" and "stop the settlement" will say fine, and the reservation — the
    // part actually worth reading later — never gets written down.
    hint: "Satisfied, with a recorded reservation. Does not stop settlement.",
    tone: "pending"
  },
  {
    key: "not_met",
    label: "Not met",
    hint: "Not satisfied. The milestone it governs cannot be committed.",
    tone: "disputed"
  }
];

const MILESTONE_LABEL = {
  inspected: "Inspected",
  shipped: "Shipped",
  arrived_cleared: "Arrived and cleared"
};

const STATE_TONE = {
  awaiting: "pending",
  met: "attested",
  met_with_reservation: "pending",
  not_met: "disputed"
};

const STATE_LABEL = {
  awaiting: "Awaiting review",
  met: "Met",
  met_with_reservation: "Met with reservation",
  not_met: "Not met"
};

const MIN_REASONING = 40;

const same = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

export default function ClausePanel({ escrowId, reviewerAddress, accessToken, onStateChanged }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // The gateway answered 404: it is older than this feature.
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState("");

  const load = useCallback(
    async (signal) => {
      setError("");
      try {
        setData(await getClauses(escrowId, { signal }));
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

  async function submitReview(clauseId, verdict, reasoning) {
    setBusy(clauseId);
    setError("");
    try {
      await reviewClause(escrowId, clauseId, { verdict, reasoning, token: accessToken });
      setOpen("");
      await load();
      // A verdict can release or hold a milestone, so the page's own view of
      // what is verifiable is now out of date.
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
          {t("Reading the clauses from the pinned instrument…")}
        </p>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <Head />
        <p className="mt-2 border-l-2 border-state-disputed pl-3 font-serif text-sm leading-relaxed text-state-disputed">
          {t(error)}
        </p>
      </Card>
    );
  }

  const clauses = data?.clauses || [];

  // An escrow created before any of this existed, or one whose terms were all
  // objective. Said in one line rather than with an empty panel, because "no
  // interpretive clauses" is itself a fact about the instrument.
  if (!data?.declared || clauses.length === 0) {
    return (
      <Card>
        <Head />
        <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
          {t("This instrument declared no interpretive clauses, so every condition on it is a machine-readable reading. Clauses that need a person — merchantable quality, packaging fit for ocean carriage — are declared when the escrow is created, so their wording is inside the pinned manifest and cannot be added afterwards.")}
        </p>
      </Card>
    );
  }

  const held = Object.entries(data.milestones || {}).filter(([, m]) => m.blocked);

  return (
    <Card>
      <Head />
      <p className="mt-2 font-serif text-sm leading-relaxed text-ink-dim">
        {t("These are the terms no feed can answer. Each names the person who must judge it, and their verdict is not accepted without a written reason. Until a required clause has one, the gateway refuses to submit the milestone it governs.")}
      </p>

      {held.length ? (
        <p className="mt-3 border-l-2 border-state-pending pl-3 font-serif text-sm leading-relaxed text-state-pending">
          {t("Held pending review: {milestones}.", {
            milestones: held.map(([name]) => t(MILESTONE_LABEL[name] || name)).join(", ")
          })}
        </p>
      ) : (
        <p className="mt-3 border-l-2 border-state-attested pl-3 font-serif text-sm leading-relaxed text-state-attested">
          {t("Every declared clause has been answered. No milestone is held by one.")}
        </p>
      )}

      {error ? (
        <p className="mt-3 border-l-2 border-state-disputed pl-3 font-serif text-sm leading-relaxed text-state-disputed">
          {t(error)}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-sky/70 border-t border-sky/70">
        {clauses.map((clause) => (
          <ClauseRow
            key={clause.id}
            clause={clause}
            isReviewer={Boolean(accessToken) && same(clause.reviewer, reviewerAddress)}
            open={open === clause.id}
            onToggle={() => setOpen(open === clause.id ? "" : clause.id)}
            busy={busy === clause.id}
            onSubmit={(verdict, reasoning) => submitReview(clause.id, verdict, reasoning)}
          />
        ))}
      </ul>
    </Card>
  );
}

function ClauseRow({ clause, isReviewer, open, onToggle, busy, onSubmit }) {
  const { t } = useLanguage();
  const review = clause.review;
  const automated = clause.kind === "automated";

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-mono text-2xs uppercase text-ink-faint">
          {clause.id} · {t(MILESTONE_LABEL[clause.milestone] || clause.milestone)}
          {automated ? ` · ${t("automated")}` : ""}
          {clause.required ? "" : ` · ${t("advisory")}`}
        </p>
        <Dot tone={automated ? "muted" : STATE_TONE[clause.state]}>
          {t(automated ? "Read by a feed" : STATE_LABEL[clause.state] || clause.state)}
        </Dot>
      </div>

      <p className="mt-1.5 font-serif text-sm leading-relaxed text-navy">{clause.text}</p>

      {clause.standard ? (
        <p className="mt-1 font-serif text-xs leading-relaxed text-ink-dim">
          {t("Standard")}: {clause.standard}
        </p>
      ) : null}

      {clause.reviewer ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs uppercase text-ink-faint">
          <span>{t(clause.reviewerRole)}</span>
          <AddressLink address={clause.reviewer} label={t("reviewer")} />
          {isReviewer ? <span className="text-teal">{t("that is you")}</span> : null}
        </p>
      ) : null}

      {review ? (
        <div className="mt-2.5 border-l-2 border-sky pl-3">
          <p className="font-mono text-2xs uppercase text-ink-faint">
            {t(STATE_LABEL[review.verdict] || review.verdict)} ·{" "}
            {new Date(review.reviewedAt).toLocaleString("id-ID")}
          </p>
          <p className="mt-1 font-serif text-sm leading-relaxed text-navy">{review.reasoning}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs uppercase text-ink-faint">
            <AddressLink address={review.reviewedBy} label={t("decided by")} />
            {/* The reasoning is pinned, so the verdict points at an address
                anyone can fetch rather than at a row in our own database. When
                pinning is not configured the record says so instead of implying
                a citation it does not have. */}
            {review.reasoningCid ? (
              <a
                href={eblDocumentUrl(review.reasoningCid) || undefined}
                target="_blank"
                rel="noreferrer"
                title={review.reasoningCid}
                className="text-teal transition-colors duration-150 hover:text-navy"
              >
                {shortCid(review.reasoningCid)}
              </a>
            ) : (
              <span className="text-state-pending">{t("not pinned")}</span>
            )}
          </p>
        </div>
      ) : null}

      {isReviewer ? (
        open ? (
          <VerdictForm
            busy={busy}
            revising={Boolean(review)}
            onCancel={onToggle}
            onSubmit={onSubmit}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="mt-2.5 cursor-pointer font-mono text-2xs uppercase text-teal transition-colors duration-150 hover:text-navy"
          >
            {t(review ? "Revise this verdict" : "Record a verdict")}
          </button>
        )
      ) : null}
    </li>
  );
}

function VerdictForm({ busy, revising, onCancel, onSubmit }) {
  const { t } = useLanguage();
  const [verdict, setVerdict] = useState("met");
  const [reasoning, setReasoning] = useState("");
  const short = reasoning.trim().length < MIN_REASONING;
  const chosen = VERDICTS.find((v) => v.key === verdict);

  return (
    <form
      className="mt-3 border-t border-sky/70 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!short) onSubmit(verdict, reasoning.trim());
      }}
    >
      <p className="font-mono text-2xs uppercase text-ink-faint">{t("Your verdict")}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {VERDICTS.map((option) => (
          <label
            key={option.key}
            className="flex cursor-pointer items-center gap-1.5 font-serif text-sm text-navy"
          >
            <input
              type="radio"
              name="verdict"
              value={option.key}
              checked={verdict === option.key}
              onChange={() => setVerdict(option.key)}
              className="accent-teal"
            />
            {t(option.label)}
          </label>
        ))}
      </div>
      <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">{chosen ? t(chosen.hint) : null}</p>

      <label
        htmlFor="clause-reasoning"
        className="mt-3 block font-mono text-2xs uppercase text-ink-faint"
      >
        {t("Why")}
      </label>
      <textarea
        id="clause-reasoning"
        rows={3}
        value={reasoning}
        onChange={(event) => setReasoning(event.target.value)}
        placeholder={t("What you examined, and what you found.")}
        className={`${inputClass(false)} mt-1 font-serif`}
      />
      {/* Not a formality. A verdict with no argument behind it would look like a
          judgement and carry none, and this is the one place in the product
          where a person's opinion moves money. */}
      <p
        className={`mt-1 font-serif text-xs leading-relaxed ${
          short ? "text-state-pending" : "text-ink-dim"
        }`}
      >
        {short
          ? t("{count} more characters. A verdict nobody can argue with is the thing this exists to prevent.", {
              count: MIN_REASONING - reasoning.trim().length
            })
          : t("This is pinned alongside the verdict, so it can be read and contested later.")}
      </p>

      {revising ? (
        <p className="mt-1.5 font-serif text-xs leading-relaxed text-ink-dim">
          {t("Your earlier verdict stays in the record. This is added to it, not over it.")}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={busy || short}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-navy px-4 py-2 text-xs font-medium text-beige transition-colors duration-150 hover:bg-teal-solid disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : null}
          {t(busy ? "Recording…" : "Record verdict")}
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
      <ScrollText size={12} aria-hidden="true" />
      {t("Interpretive clauses · human review")}
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
