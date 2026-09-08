import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Notice, Tag } from "./ui.jsx";
import { inputClass } from "./Field.jsx";
import {
  beginMfaSetup,
  companyLogin,
  confirmMfaSetup,
  registerCompany,
  verifyMfa
} from "../lib/sternApi.js";

/*
 * Company access, DESIGN.md section 2: a segmented control over Sign in and
 * Register company, then the MFA enrolment and six-digit verification states.
 *
 * The flow is unchanged from the version this replaces — same endpoints, same
 * state transitions, same conditions on every button. What changed is that it
 * is now legible: it was a single 46-line file of run-on JSX with unstyled
 * square inputs sitting under a designed sign-in panel, and it read as a
 * different product bolted to the bottom of the page.
 */

const initialRegistration = {
  companyName: "",
  email: "",
  username: "",
  walletAddress: "",
  password: ""
};

const REGISTRATION_FIELDS = [
  { name: "companyName", label: "Company", type: "text" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "username", label: "Username", type: "text", autoComplete: "username" },
  { name: "walletAddress", label: "Verified wallet address", type: "text", mono: true },
  { name: "password", label: "Password", type: "password", autoComplete: "new-password" }
];

export default function CompanyAccess() {
  const [mode, setMode] = useState("login");
  const [registration, setRegistration] = useState(initialRegistration);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [mfaToken, setMfaToken] = useState("");
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = (setter) => (event) =>
    setter((current) => ({ ...current, [event.target.name]: event.target.value }));

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err?.message || "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ signed in ------------------------------ */

  if (session) {
    return (
      <Section title="Company session">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold text-navy">{session.company.name}</span>
          <Tag tone="teal">{session.user.role}</Tag>
          {session.user.mfaEnabled ? (
            <Tag tone="attested" icon={ShieldCheck}>
              MFA enabled
            </Tag>
          ) : (
            <Tag tone="pending">MFA not enrolled</Tag>
          )}
        </div>

        {/* Two separate sessions, and nothing said so. This one identifies the
            company to the backend; the workspace needs a wallet, which only
            Particle provides. After finishing MFA the panel simply sat there and
            the page looked stuck — the next step was above it all along. */}
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-dim">
          This signs you in as the company. To open the workspace you still need a wallet — use{" "}
          <span className="font-medium text-navy">Continue with Google</span> above.
        </p>

        {error ? (
          <Notice tone="disputed" role="alert" className="mt-3">
            {error}
          </Notice>
        ) : null}

        {!session.user.mfaEnabled && !setup ? (
          <SecondaryButton
            disabled={busy}
            onClick={() => run(async () => setSetup(await beginMfaSetup(session.accessToken)))}
          >
            Enable MFA
          </SecondaryButton>
        ) : null}

        {setup ? (
          <div className="mt-3 space-y-2.5">
            <div className="rounded-panel border border-sky bg-surface-soft px-3 py-2.5">
              <p className="text-2xs text-ink-dim">Enrolment secret</p>
              <p className="mt-1 break-all font-mono text-[12px] text-navy">{setup.secret}</p>
            </div>
            <CodeInput label="Authenticator code" value={code} onChange={setCode} />
            <PrimaryButton
              disabled={busy || code.length !== 6}
              onClick={() =>
                run(async () => {
                  const result = await confirmMfaSetup({ setupToken: setup.setupToken, code });
                  setSession((current) => ({ ...current, user: result.user }));
                  setSetup(null);
                  setCode("");
                })
              }
            >
              Confirm MFA
            </PrimaryButton>
          </div>
        ) : null}
      </Section>
    );
  }

  /* ------------------------------ MFA challenge ------------------------------ */

  if (mfaToken) {
    return (
      <Section title="Two-factor verification">
        <p className="text-[13px] leading-relaxed text-ink-dim">
          Enter the six-digit code from your authenticator app.
        </p>
        <div className="mt-2.5 space-y-2.5">
          <CodeInput label="MFA code" value={code} onChange={setCode} />
          <PrimaryButton
            disabled={busy || code.length !== 6}
            onClick={() =>
              run(async () => {
                setSession(await verifyMfa({ mfaToken, code }));
                setMfaToken("");
                setCode("");
              })
            }
          >
            Verify code
          </PrimaryButton>
        </div>
        {error ? (
          <Notice tone="disputed" role="alert" className="mt-3">
            {error}
          </Notice>
        ) : null}
      </Section>
    );
  }

  /* --------------------------- sign in / register --------------------------- */

  return (
    <Section title="Company account">
      <div
        role="tablist"
        aria-label="Company access"
        className="flex gap-1 rounded-panel border border-sky bg-surface-soft p-1"
      >
        <Segment
          selected={mode === "login"}
          onClick={() => {
            setMode("login");
            setError("");
          }}
        >
          Sign in
        </Segment>
        <Segment
          selected={mode === "register"}
          onClick={() => {
            setMode("register");
            setError("");
          }}
        >
          Register company
        </Segment>
      </div>

      {mode === "register" ? (
        <form
          className="mt-3 space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => setSession(await registerCompany(registration)));
          }}
        >
          {REGISTRATION_FIELDS.map((f) => (
            <TextField
              key={f.name}
              {...f}
              value={registration[f.name]}
              onChange={change(setRegistration)}
            />
          ))}
          <PrimaryButton type="submit" disabled={busy}>
            Create company account
          </PrimaryButton>
        </form>
      ) : (
        <form
          className="mt-3 space-y-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await companyLogin(login);
              if (result.mfaRequired) setMfaToken(result.mfaToken);
              else setSession(result);
            });
          }}
        >
          <TextField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={login.email}
            onChange={change(setLogin)}
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={login.password}
            onChange={change(setLogin)}
          />
          <PrimaryButton type="submit" disabled={busy}>
            Sign in to company
          </PrimaryButton>
        </form>
      )}

      {error ? (
        <Notice tone="disputed" role="alert" className="mt-3">
          {error}
        </Notice>
      ) : null}

      {/* DESIGN.md is explicit: an ordinary user is never shown a seed phrase or
          a private key field, so this panel asks for a verified wallet ADDRESS
          and nothing more. */}
      <p className="mt-3 text-2xs leading-relaxed text-ink-faint">
        The wallet address is recorded for verification only. STERN never asks for a seed phrase or
        a private key.
      </p>
    </Section>
  );
}

/* ---------------------------------- parts --------------------------------- */

function Section({ title, children }) {
  return (
    <div className="mt-6 border-t border-sky pt-5">
      <h3 className="mb-2.5 text-[14px] font-semibold text-navy">{title}</h3>
      {children}
    </div>
  );
}

function Segment({ selected, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`flex-1 cursor-pointer whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
        selected ? "bg-surface text-navy shadow-card" : "text-ink-dim hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function TextField({ name, label, type = "text", autoComplete, mono, value, onChange }) {
  const id = `company-${name}`;
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-navy">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required
        className={`${inputClass(false)} py-2 text-[13px] ${mono ? "font-mono text-xs" : ""}`}
      />
    </label>
  );
}

function CodeInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        maxLength="6"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="000000"
        className={`${inputClass(false)} text-center font-mono text-[18px] tracking-[0.4em]`}
      />
    </label>
  );
}

function PrimaryButton({ children, ...rest }) {
  return (
    <button
      {...rest}
      className="w-full cursor-pointer whitespace-nowrap rounded-panel bg-teal-solid px-4 py-2.5 text-[13px] font-medium text-white shadow-card transition-[filter,opacity] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...rest }) {
  return (
    <button
      type="button"
      {...rest}
      className="mt-3 w-full cursor-pointer whitespace-nowrap rounded-panel border border-sky bg-surface px-4 py-2.5 text-[13px] font-medium text-navy transition-colors duration-150 hover:border-teal/50 hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}
