import { useEffect, useState } from "react";
import { Check, Copy, FilePlus2, KeyRound, LayoutList, LogOut, RadioTower, Wallet } from "lucide-react";
import { shortAddress } from "../lib/actors.js";
import { getHealth } from "../lib/api.js";
import { onChainConfigured } from "../lib/sternContract.js";
import ThemeToggle from "./ThemeToggle.jsx";
import sternLogo from "../assets/stern-logo.png";

const NAV = [
  { id: "overview", label: "Escrows", icon: LayoutList },
  { id: "create", label: "New escrow", icon: FilePlus2 }
];

export default function Sidebar({
  view,
  onNavigate,
  user,
  balance,
  onClaim,
  claiming,
  canClaim,
  claimError,
  onSignOut,
  onOpenOps,
  isOnChainReady
}) {
  const [oracleOnline, setOracleOnline] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const health = await getHealth();
        if (!cancelled) setOracleOnline(Boolean(health.ok));
      } catch {
        if (!cancelled) setOracleOnline(false);
      }
    }

    ping();
    const interval = setInterval(ping, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="flex h-full w-[238px] shrink-0 flex-col border-r border-sky bg-surface pb-3.5">
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          className="cursor-pointer text-left"
          aria-label="STERN home"
        >
          <img src={sternLogo} alt="STERN" className="h-5 w-auto invert dark:invert-0" />
          <span className="mt-0.5 block text-2xs uppercase text-teal">Settlement engine</span>
        </button>
        <ThemeToggle />
      </div>

      <nav className="flex-1" aria-label="Primary">
        <p className="px-5 pb-1.5 pt-3.5 text-2xs uppercase text-ink-faint">Workspace</p>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
              className={`mx-3 mb-0.5 flex w-[calc(100%-1.5rem)] cursor-pointer items-center gap-2.5 rounded-full px-3.5 py-2.5 text-left text-sm transition-colors duration-150 ${
                active
                  ? "bg-beige font-medium text-navy"
                  : "text-navy/90 hover:bg-beige hover:text-navy"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 border-t border-sky px-1.5 pt-3.5">
        <div className="flex items-center justify-between px-1 py-1 text-2xs uppercase text-ink-faint">
          <span>{isOnChainReady ? "Local chain · 31337" : "Mock session"}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOnChainReady ? "bg-state-attested" : "bg-state-pending"
            }`}
            title={isOnChainReady ? "Wallet + contract detected" : "No wallet or contract: local mock state"}
          />
        </div>
        <div
          className="mb-2 flex items-center justify-between px-1 py-1 text-2xs uppercase text-ink-faint"
          title="The oracle gateway is the trusted signer that submits the five verification checks on-chain (backend/oracle-gateway, port 4000)"
        >
          <span className="flex items-center gap-1.5">
            <RadioTower size={11} aria-hidden="true" />
            Oracle gateway
          </span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              oracleOnline === null
                ? "bg-sky"
                : oracleOnline
                  ? "bg-state-attested"
                  : "bg-state-disputed"
            }`}
            title={
              oracleOnline === null
                ? "Checking oracle gateway…"
                : oracleOnline
                  ? "Oracle gateway online at :4000"
                  : "Oracle gateway offline. Run: npm run backend"
            }
          />
        </div>

        <div className="mb-3 rounded-panel border border-sky bg-beige/60 px-3.5 py-3">
          <div className="flex items-center gap-1.5 text-2xs uppercase text-ink-faint">
            <Wallet size={11} aria-hidden="true" />
            IDRT-demo balance
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-navy">
            {balance ? Number(balance).toLocaleString("id-ID") : "0"}
          </p>
          {/* The browser cannot mint — MINTER_ROLE guards it — but the gateway
              can, and does, on POST /demo-balance/claim. These two were an
              either/or, which hid the faucet from the one setup that can use
              it. The address is useful whenever it exists; the button appears
              whenever something can actually mint. */}
          {onChainConfigured ? <SmartAccountAddress address={user?.smartAccountAddress} /> : null}

          {canClaim && !user?.hasClaimedDemoBalance ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="mt-2 w-full cursor-pointer rounded-full border border-teal/50 bg-teal/10 py-1.5 text-2xs font-medium uppercase text-teal transition-colors duration-150 hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? "Minting…" : "Claim demo balance"}
            </button>
          ) : null}

          {canClaim && user?.hasClaimedDemoBalance ? (
            <p className="mt-2 font-serif text-2xs leading-relaxed text-ink-dim">
              Demo balance already claimed for this wallet. The faucet is once per address.
            </p>
          ) : null}

          {claimError ? (
            <p
              role="alert"
              className="mt-2 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-2.5 py-2 font-serif text-2xs leading-relaxed text-state-disputed"
            >
              {claimError}
            </p>
          ) : null}
        </div>

        {/* Identity, not a chooser. One session is one wallet; which party you
            are is a fact about each escrow (see lib/roles.js), so there is
            nothing here to pick. */}
        <div className="relative">
          <div className="flex w-full items-center gap-2.5 rounded-full bg-beige px-2 py-1.5 text-left">
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold uppercase text-beige">
              {(user?.email || "S")[0].toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-navy">
                {user?.email || "Signed in"}
              </span>
              <span className="block truncate text-2xs text-ink-faint">
                {shortAddress(user?.smartAccountAddress)}
              </span>
            </span>
          </div>

          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={onOpenOps}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-sky py-1.5 text-2xs uppercase text-ink-dim transition-colors duration-150 hover:border-teal/50 hover:text-navy"
            >
              <KeyRound size={11} aria-hidden="true" />
              Ops
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-sky py-1.5 text-2xs uppercase text-ink-dim transition-colors duration-150 hover:border-teal/50 hover:text-navy"
            >
              <LogOut size={11} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
        <p className="mt-2.5 px-1 font-serif text-xs leading-relaxed tracking-normal text-ink-dim">
          Your role is read from each escrow. The arbiter and the contract admin sign in on the
          ops console with their own keys.
        </p>
      </div>
    </aside>
  );
}

// The panel used to say "mint to this address" without ever showing it, and the
// actor pill below shows a demo address from actors.js — not the signed-in
// user's Safe. Minting to that one sends the tokens nowhere useful, so print
// the real address here and make it copyable.
function SmartAccountAddress({ address }) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <p className="mt-2 font-serif text-2xs leading-relaxed text-ink-dim">
        On-chain balance. Resolving your Smart Account address…
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard is blocked on insecure origins; the address is on screen
      // anyway, so there is nothing useful to report.
    }
  }

  return (
    <div className="mt-2">
      <p className="font-serif text-2xs leading-relaxed text-ink-dim">
        On-chain balance. Mint IDRT-demo to your Smart Account:
      </p>
      <button
        type="button"
        onClick={copy}
        title={address}
        className="mt-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-panel border border-sky bg-surface px-2 py-1.5 text-left transition-colors duration-150 hover:border-teal/50"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-navy">{address}</span>
        {copied ? (
          <Check size={11} className="shrink-0 text-state-attested" aria-hidden="true" />
        ) : (
          <Copy size={11} className="shrink-0 text-ink-dim" aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Smart Account address copied" : ""}
      </span>
    </div>
  );
}
