import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Copy, FilePlus2, LayoutList, LogOut, RadioTower, RotateCcw, Wallet } from "lucide-react";
import { ACTORS, actorById, shortAddress } from "../lib/actors.js";
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
  role,
  onRoleChange,
  user,
  balance,
  onClaim,
  claiming,
  onSignOut,
  onResetDemo,
  isOnChainReady
}) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [oracleOnline, setOracleOnline] = useState(null);
  const switcherRef = useRef(null);
  const actor = actorById(role);

  useEffect(() => {
    function onClickOutside(event) {
      if (switcherRef.current && !switcherRef.current.contains(event.target)) {
        setSwitcherOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

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
          {/* On chain the faucet is a real mint guarded by MINTER_ROLE, so the
              browser cannot do it. Showing the mock button here would paint a
              balance the wallet does not hold, and the next createEscrow would
              revert for insufficient funds. */}
          {onChainConfigured ? (
            <SmartAccountAddress address={user?.smartAccountAddress} />
          ) : !user?.hasClaimedDemoBalance ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="mt-2 w-full cursor-pointer rounded-full border border-teal/50 bg-teal/10 py-1.5 text-2xs font-medium uppercase text-teal transition-colors duration-150 hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claiming ? "Provisioning…" : "Claim demo balance"}
            </button>
          ) : null}
        </div>

        <div ref={switcherRef} className="relative">
          {switcherOpen ? (
            <div className="absolute bottom-full left-0 right-0 z-30 mb-1.5 overflow-hidden rounded-doc border border-sky bg-surface py-1 shadow-card">
              {ACTORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onRoleChange(option.id);
                    setSwitcherOpen(false);
                  }}
                  className={`flex w-full cursor-pointer items-start gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-beige ${
                    option.id === role ? "text-teal" : "text-navy"
                  }`}
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-beige text-2xs uppercase">
                    {option.label[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{option.label}</span>
                    <span className="block truncate font-serif text-xs text-ink-dim">{option.org}</span>
                    <span className="block text-2xs text-ink-faint">
                      {shortAddress(option.address)}
                    </span>
                  </span>
                </button>
              ))}
              <div className="mt-1 border-t border-sky pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onResetDemo();
                    setSwitcherOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-ink-dim transition-colors duration-150 hover:bg-beige hover:text-navy"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Reset demo data
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    setSwitcherOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-ink-dim transition-colors duration-150 hover:bg-beige hover:text-navy"
                >
                  <LogOut size={13} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSwitcherOpen((open) => !open)}
            aria-expanded={switcherOpen}
            aria-label={`Acting as ${actor.label}. Switch actor.`}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-full bg-beige px-2 py-1.5 text-left transition-colors duration-150 hover:bg-sky/40"
          >
            <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold uppercase text-beige">
              {actor.label[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-navy">{actor.label}</span>
              <span className="block truncate text-2xs text-ink-faint">
                {shortAddress(actor.address)}
              </span>
            </span>
            <ChevronsUpDown size={13} className="mr-1 shrink-0 text-ink-dim" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2.5 px-1 font-serif text-xs leading-relaxed tracking-normal text-ink-dim">
          Demo: switch actor to preview each party&rsquo;s view. A real session is one wallet per
          signed-in user.
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
