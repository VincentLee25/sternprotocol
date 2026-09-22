import { useEffect, useState } from "react";
import { Bell, ChevronRight, Menu, ShieldCheck } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import { getHealth } from "../lib/api.js";
import { apiConfigured } from "../lib/sternApi.js";
import { Tag } from "./ui.jsx";

/*
 * The application shell every authenticated STERN page renders inside.
 *
 * One 260px sidebar, one 64px header, one scrollable workspace capped at
 * 1440px with 32-40px desktop padding - the layout DESIGN.md specifies and the
 * one the strongest Stitch screens converged on. Pages supply a title, a
 * breadcrumb trail and their primary actions; they never draw their own chrome.
 * That is the whole point: consistency comes from this file, not from nine
 * pages agreeing to look alike.
 */

/**
 * One poll of the oracle gateway for the whole shell. The sidebar row and the
 * header chip used to be two separate 30s intervals reporting the same fact.
 *
 * The poll is skipped entirely when no gateway is configured. lib/api falls
 * back to http://localhost:4000, so an unconfigured build would happily ping a
 * dev server and report "synced" on the same screen where Integration status
 * correctly said "no endpoint set".
 */
function useGatewayHealth() {
  const [online, setOnline] = useState(null);

  useEffect(() => {
    if (!apiConfigured) return undefined;
    let cancelled = false;

    async function ping() {
      try {
        const health = await getHealth();
        if (!cancelled) setOnline(Boolean(health.ok));
      } catch {
        if (!cancelled) setOnline(false);
      }
    }

    ping();
    const interval = setInterval(ping, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { configured: apiConfigured, online };
}

export default function AppShell({
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
  activeEscrowId,
  // Page-supplied header content.
  breadcrumb = [],
  title,
  subtitle,
  actions,
  elevated = false,
  children
}) {
  const { configured: gatewayConfigured, online: oracleOnline } = useGatewayHealth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A route change closes the drawer; leaving it open over the new page is the
  // classic mobile-nav bug.
  useEffect(() => {
    setDrawerOpen(false);
  }, [view, activeEscrowId]);

  const sidebarProps = {
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
    gatewayConfigured,
    activeEscrowId
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-beige text-navy">
      {/* Desktop rail */}
      <div className="hidden lg:flex">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Below 1024px the rail becomes an off-canvas drawer rather than
          disappearing, so every destination stays reachable on a phone. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-navy/40"
          />
          <div className="absolute inset-y-0 left-0 shadow-elevated">
            <Sidebar {...sidebarProps} onDismiss={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-sky bg-surface px-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-panel border border-sky text-ink-dim transition-colors duration-150 hover:bg-surface-soft hover:text-navy lg:hidden"
            >
              <Menu size={17} aria-hidden="true" />
            </button>

            <Breadcrumb trail={breadcrumb} onNavigate={onNavigate} />

            {elevated ? (
              <Tag tone="pending" icon={ShieldCheck} className="hidden shrink-0 sm:inline-flex">
                Elevated session
              </Tag>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <Tag
              tone={
                !gatewayConfigured
                  ? "pending"
                  : oracleOnline
                    ? "attested"
                    : oracleOnline === null
                      ? "neutral"
                      : "disputed"
              }
              dot
              className="hidden xl:inline-flex"
            >
              {!gatewayConfigured
                ? "Oracle gateway not configured"
                : oracleOnline === null
                  ? "Checking oracle gateway"
                  : oracleOnline
                    ? "Oracle gateway synced"
                    : "Oracle gateway offline"}
            </Tag>

            {/* Notifications are not wired to a feed yet, so the control is
                present and honest rather than present and pretending. */}
            <button
              type="button"
              disabled
              aria-label="Notifications (not available yet)"
              title="Notifications are not available in this build"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-panel border border-sky text-ink-faint opacity-60"
            >
              <Bell size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-workspace px-5 py-6 lg:px-8 lg:py-8">
            {title ? (
              <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-[28px] font-bold leading-tight text-navy lg:text-[32px]">
                    {title}
                  </h1>
                  {subtitle ? (
                    <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-ink-dim">
                      {subtitle}
                    </p>
                  ) : null}
                </div>
                {actions ? (
                  <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
                ) : null}
              </div>
            ) : null}

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Breadcrumb. Entries with a `view` are buttons; the last one is the current
 * page and is never a link. Truncation happens on the middle entries so the
 * page you are on stays legible on a narrow header.
 */
function Breadcrumb({ trail, onNavigate }) {
  if (!trail.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1;
        return (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? (
              <ChevronRight size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
            ) : null}
            {crumb.view && !last ? (
              <button
                type="button"
                onClick={() => onNavigate(crumb.view)}
                className="hidden cursor-pointer whitespace-nowrap text-[13px] text-ink-dim transition-colors duration-150 hover:text-navy sm:block"
              >
                {crumb.label}
              </button>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={`truncate text-[13px] ${
                  last ? "font-semibold text-navy" : "hidden text-ink-dim sm:block"
                }`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
