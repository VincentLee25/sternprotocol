import { useState } from "react";
import {
  Check,
  Copy,
  FilePlus2,
  KeyRound,
  LayoutGrid,
  LogOut,
  RadioTower,
  ScrollText,
  SlidersHorizontal,
  Wallet,
  X
} from "lucide-react";
import { shortAddress } from "../lib/actors.js";
import { onChainConfigured } from "../lib/sternContract.js";
import { formatEscrowId } from "../lib/escrowState.js";
import ThemeToggle from "./ThemeToggle.jsx";
import sternLogo from "../assets/stern-logo.png";

/*
 * The canonical STERN sidebar.
 *
 * Chosen from the Stitch set: nine screens carried four different asides
 * (240px / 250px / 260px, two with a company switcher, one with three separate
 * <nav> blocks). The 260px grouped-nav variant used by Amendment Inbox, Dispute
 * Case and Company & Team is the one adopted here, because it is the only one
 * that (a) sits inside DESIGN.md's 240-280px band with room for the longest
 * label unwrapped, (b) groups destinations under quiet section headings instead
 * of one flat list, and (c) aligns its brand row to the 64px header so the two
 * chrome edges meet.
 *
 * Every entry points at a view this app actually renders. The Stitch nav also
 * listed Evidence, Disputes and Amendments as top-level pages; in this codebase
 * those are panels inside an escrow rather than routes, so linking them here
 * would have produced dead navigation.
 */

const NAV_SECTIONS = [
  {
    title: "Workspace",
    items: [
      { id: "overview", label: "Workspace overview", icon: LayoutGrid },
      { id: "create", label: "Create escrow", icon: FilePlus2 }
    ]
  },
  {
    title: "Environment",
    items: [
      { id: "settings", label: "Integration status", icon: SlidersHorizontal },
      { id: "ops", label: "Operations console", icon: KeyRound }
    ]
  }
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
  isOnChainReady,
  oracleOnline,
  gatewayConfigured = true,
  activeEscrowId,
  onDismiss
}) {
  return (
    <div className="flex h-full w-sidebar shrink-0 flex-col border-r border-sky bg-surface">
      {/* Brand row. 64px, so it lines up exactly with the header opposite. */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-sky px-5">
        <button
          type="button"
          onClick={() => onNavigate("landing")}
          className="cursor-pointer text-left"
          aria-label="STERN home"
        >
          {/* The asset is already the wordmark, so a second "STERN" in type
              beside it would be the brand said twice. */}
          <img src={sternLogo} alt="STERN" className="h-5 w-auto invert dark:invert-0" />
          <span className="mt-1 block whitespace-nowrap text-2xs font-medium text-ink-faint">
            Trade protocol
          </span>
        </button>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {/* Only rendered inside the mobile drawer. */}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close navigation"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-panel text-ink-dim transition-colors duration-150 hover:bg-surface-soft hover:text-navy lg:hidden"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-micro text-ink-faint">
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                active={view === item.id}
                onSelect={() => onNavigate(item.id)}
              />
            ))}

            {/* The open escrow is a real destination, so it belongs in the nav
                rather than only in the breadcrumb - otherwise the sidebar shows
                nothing selected for the page you are actually on. */}
            {section.title === "Workspace" && activeEscrowId != null ? (
              <NavItem
                item={{
                  id: "escrow",
                  label: `Escrow № ${formatEscrowId(activeEscrowId)}`,
                  icon: ScrollText
                }}
                active={view === "escrow"}
                onSelect={() => onNavigate("escrow")}
              />
            ) : null}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sky p-3">
        <div className="mb-2.5 space-y-1.5">
          <StatusRow
            label="Escrow registry"
            ok={isOnChainReady}
            onText="Gateway"
            offText="Simulated"
            title={
              isOnChainReady
                ? "Escrows are read from the oracle gateway"
                : "No gateway configured: escrows come from local mock state"
            }
          />
          <StatusRow
            icon={RadioTower}
            label="Oracle gateway"
            ok={gatewayConfigured ? oracleOnline : false}
            offText={gatewayConfigured ? "Offline" : "Not set"}
            title={
              !gatewayConfigured
                ? "No gateway endpoint is set. Configure VITE_ORACLE_API."
                : oracleOnline === null
                  ? "Checking the oracle gateway"
                  : oracleOnline
                    ? "Oracle gateway online"
                    : "Oracle gateway offline. Run: npm run backend"
            }
          />
        </div>

        {user ? (
          <div className="mb-2.5 rounded-panel border border-sky bg-surface-soft px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-2xs font-medium text-ink-faint">
              <Wallet size={12} aria-hidden="true" />
              IDRT-demo balance
            </p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-navy">
              {balance ? Number(balance).toLocaleString("id-ID") : "0"}
            </p>

            {/* The browser cannot mint - MINTER_ROLE guards it - but the gateway
                can, and does, on POST /demo-balance/claim. The address is useful
                whenever it exists; the button appears whenever something can
                actually mint. */}
            {onChainConfigured ? <SmartAccountAddress address={user?.smartAccountAddress} /> : null}

            {canClaim && !user?.hasClaimedDemoBalance ? (
              <button
                type="button"
                onClick={onClaim}
                disabled={claiming}
                className="mt-2.5 w-full cursor-pointer whitespace-nowrap rounded-panel border border-teal/45 bg-teal/10 py-1.5 text-2xs font-semibold text-teal transition-colors duration-150 hover:bg-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {claiming ? "Minting…" : "Claim demo balance"}
              </button>
            ) : null}

            {canClaim && user?.hasClaimedDemoBalance ? (
              <p className="mt-2 text-2xs leading-relaxed text-ink-dim">
                Already claimed for this wallet. The faucet is once per address.
              </p>
            ) : null}

            {claimError ? (
              <p
                role="alert"
                className="mt-2 rounded-panel border border-state-disputed/40 bg-state-disputed/10 px-2.5 py-2 text-2xs leading-relaxed text-state-disputed"
              >
                {claimError}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Identity, not a chooser. One session is one wallet; which party you
            are is a fact about each escrow (see lib/roles.js), so there is
            nothing here to pick. */}
        <div className="flex items-center gap-2.5 rounded-panel bg-surface-soft px-2.5 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-solid text-xs font-semibold uppercase text-white">
            {(user?.email || "S")[0].toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-navy">
              {user?.email || "Signed in"}
            </span>
            <span className="block truncate text-2xs text-ink-faint">
              {shortAddress(user?.smartAccountAddress) || "No wallet"}
            </span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-panel text-ink-dim transition-colors duration-150 hover:bg-surface hover:text-state-disputed"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2.5 px-1 text-2xs leading-relaxed text-ink-dim">
          Your role is read from each escrow. The arbiter and the contract admin sign in on the
          operations console with their own keys.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- parts --------------------------------- */

function NavItem({ item, active, onSelect }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`mb-0.5 flex w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-panel px-3 py-2.5 text-left text-[13.5px] transition-colors duration-150 ${
        active
          ? "bg-teal-solid font-semibold text-white shadow-card"
          : "text-ink-dim hover:bg-surface-soft hover:text-navy"
      }`}
    >
      <Icon size={17} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  );
}

// Text label first, colour second: an operator reading this in monochrome still
// learns whether the dependency is up.
function StatusRow({ icon: Icon, label, ok, title, onText = "Online", offText = "Offline" }) {
  const tone =
    ok === null || ok === undefined
      ? { dot: "bg-sky", text: "Checking" }
      : ok
        ? { dot: "bg-state-attested", text: onText }
        : { dot: offText === "Offline" ? "bg-state-disputed" : "bg-state-pending", text: offText };

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-panel bg-surface-soft px-2.5 py-1.5"
      title={title}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-2xs text-ink-dim">
        {Icon ? <Icon size={12} className="shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-2xs font-medium text-ink-dim">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
        {tone.text}
      </span>
    </div>
  );
}

// The panel used to say "mint to this address" without ever showing it, and the
// actor pill below showed a demo address from actors.js, not the signed-in
// user's Safe. Minting to that one sends the tokens nowhere useful, so print the
// real address here and make it copyable.
function SmartAccountAddress({ address }) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return (
      <p className="mt-2 text-2xs leading-relaxed text-ink-dim">
        On-chain balance. Resolving your Smart Account address&hellip;
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
      <p className="text-2xs leading-relaxed text-ink-dim">Mint IDRT-demo to your Smart Account:</p>
      <button
        type="button"
        onClick={copy}
        title={address}
        className="mt-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-panel border border-sky bg-surface px-2 py-1.5 text-left transition-colors duration-150 hover:border-teal/50"
      >
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-navy">{address}</span>
        {copied ? (
          <Check size={12} className="shrink-0 text-state-attested" aria-hidden="true" />
        ) : (
          <Copy size={12} className="shrink-0 text-ink-dim" aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Smart Account address copied" : ""}
      </span>
    </div>
  );
}
