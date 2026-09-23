import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import AccountMenu from "./components/AccountMenu.jsx";
import sternLogo from "./assets/stern-logo.png";
import SessionBoot from "./components/SessionBoot.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import NewEscrow from "./pages/NewEscrow.jsx";
import EscrowDetail from "./pages/EscrowDetail.jsx";
import OpsConsole from "./pages/OpsConsole.jsx";
import Security from "./pages/Security.jsx";
import Account from "./pages/Account.jsx";
import CompanyTeam from "./pages/CompanyTeam.jsx";
import { claimDemoBalance as mockClaim, getDemoBalance as mockBalance } from "./lib/mockBackend.js";
import * as api from "./lib/sternApi.js";
import { sourceIsLive } from "./lib/escrowSource.js";
import { AUTH, useSternAuth } from "./lib/useSternAuth.js";
import { getIdrtBalance, onChainConfigured } from "./lib/sternContract.js";
import { useLanguage } from "./lib/language.jsx";
import { clearCompanySession, readCompanySession, writeCompanySession } from "./lib/companySession.js";
import { getCompanyMe } from "./lib/sternApi.js";

// The old standalone marketing documents are intentionally retired. Public
// navigation always resolves to the one coherent landing experience instead
// of dropping someone into a visually unrelated legacy page.
const MARKETING = { landing: Landing, instrument: Landing, settlement: Landing, oracles: Landing };

// Who can actually hand this wallet demo tokens.
//
// The gateway can: POST /demo-balance/claim mints through a wallet holding
// MINTER_ROLE. The mock ledger can too, because nothing is real there. The one
// case with no faucet is contracts configured but no gateway — the browser
// cannot mint, so the only route is minting by hand from the deployer.
//
// This used to be keyed on onChainConfigured, which hid the button for exactly
// the setup that CAN claim: Particle + contracts + gateway all configured.
const canClaim = sourceIsLive || !onChainConfigured;

// Where you were, kept across a refresh.
//
// The view lived only in React state, so every reload dropped you back on the
// marketing page — mid-demo, mid-escrow, it did not matter. Reloading is what
// people do when something looks wrong, which is exactly when losing your place
// is most costly.
//
// Only the view name and escrow id are stored. Nothing about the session:
// Particle restores that itself, and the ops console key is deliberately wiped
// by a reload.
const VIEW_KEY = "stern-view";
const VIEW_PATHS = {
  login: "/access",
  overview: "/workspace/escrows",
  create: "/workspace/new-escrow",
  ops: "/workspace/operations",
  security: "/workspace/security",
  account: "/workspace/account",
  team: "/workspace/company-team"
};
const KNOWN_VIEWS = new Set([
  "landing", "instrument", "settlement", "oracles",
  "login", "overview", "create", "escrow", "ops", "security", "account", "team"
]);

const BOOTSTRAP = {
  BOOTING: "booting",
  RESTORING: "restoring session",
  AUTHENTICATED: "authenticated",
  UNAUTHENTICATED: "unauthenticated",
  ERROR: "error"
};
const RESTORE_TIMEOUT_MS = 12000;

function viewFromPath(pathname = window.location.pathname) {
  if (pathname === "/workspace" || pathname === VIEW_PATHS.overview) return { name: "overview" };
  const escrowMatch = pathname.match(/^\/workspace\/escrows\/([^/]+)$/);
  if (escrowMatch) return { name: "escrow", id: decodeURIComponent(escrowMatch[1]) };
  const entry = Object.entries(VIEW_PATHS).find(([, path]) => path !== VIEW_PATHS.overview && path === pathname);
  return entry ? { name: entry[0] } : null;
}

function pathFromView(view) {
  if (MARKETING[view.name] || view.name === "landing") return "/";
  if (view.name === "escrow" && view.id != null) return `/workspace/escrows/${encodeURIComponent(view.id)}`;
  return VIEW_PATHS[view.name] || "/";
}

function readStoredView() {
  if (new URLSearchParams(window.location.search).has("invite")) return { name: "login" };
  const routedView = viewFromPath();
  if (routedView) return routedView;
  if (readCompanySession()) {
    try {
      const stored = JSON.parse(localStorage.getItem(VIEW_KEY));
      if (stored && KNOWN_VIEWS.has(stored.name) && !MARKETING[stored.name] && stored.name !== "login") {
        return stored.name === "escrow"
          ? stored.id == null ? { name: "overview" } : { name: "escrow", id: String(stored.id) }
          : stored;
      }
    } catch {
      // A missing or malformed preference should not interrupt session restore.
    }
    return { name: "overview" };
  }
  return { name: "landing" };
}

export default function App() {
  return <SternApp />;
}

function SternApp() {
  const { t } = useLanguage();
  const { status, user, particleIdentity, error, connect, disconnect, refreshParticleIdentity, setUser, smartAccountClient } = useSternAuth();
  const [balance, setBalance] = useState("0.00");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [view, setView] = useState(readStoredView);
  const [escrows, setEscrows] = useState([]);
  const [navOpen, setNavOpen] = useState(false);
  const [companySession, setCompanySession] = useState(readCompanySession);
  const [companySessionValidated, setCompanySessionValidated] = useState(false);
  const [restoreTimedOut, setRestoreTimedOut] = useState(false);
  const [sessionRestoreError, setSessionRestoreError] = useState("");
  const [authRecoveryMessage, setAuthRecoveryMessage] = useState("");
  const [sessionRestoreRetry, setSessionRestoreRetry] = useState(0);
  const inviteCode = new URLSearchParams(window.location.search).get("invite");

  const address = user?.smartAccountAddress;
  const expectedAddress = companySession?.user?.walletAddress?.toLowerCase();
  const accountMatches = !expectedAddress || !address || expectedAddress === address.toLowerCase();
  const companyIdentityMatches = Boolean(companySession?.user?.particleUserId && particleIdentity?.uuid === companySession.user.particleUserId);
  const workspaceReady = Boolean(companySession && companySessionValidated && companyIdentityMatches && status === AUTH.READY && address && accountMatches);
  const isWorkspaceRoute = !MARKETING[view.name] && view.name !== "landing" && view.name !== "login" && view.name !== "ops";
  const shouldRestoreWorkspace = isWorkspaceRoute && !workspaceReady && (Boolean(companySession) || status === AUTH.LOADING || status === AUTH.AUTHENTICATING);
  const bootstrapState = workspaceReady
    ? BOOTSTRAP.AUTHENTICATED
    : restoreTimedOut || sessionRestoreError || status === AUTH.ERROR
      ? BOOTSTRAP.ERROR
      : shouldRestoreWorkspace
        ? status === AUTH.LOADING ? BOOTSTRAP.BOOTING : BOOTSTRAP.RESTORING
        : BOOTSTRAP.UNAUTHENTICATED;

  useEffect(() => {
    if (!shouldRestoreWorkspace) {
      setRestoreTimedOut(false);
      return undefined;
    }
    if (restoreTimedOut || sessionRestoreError || status === AUTH.ERROR) return undefined;
    const timer = window.setTimeout(() => setRestoreTimedOut(true), RESTORE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [shouldRestoreWorkspace, restoreTimedOut, sessionRestoreError, status, sessionRestoreRetry]);

  const updateCompanySession = useCallback((session) => {
    setSessionRestoreError("");
    setAuthRecoveryMessage("");
    setCompanySessionValidated((current) => current && companySession?.accessToken === session?.accessToken);
    setCompanySession(session);
    writeCompanySession(session);
  }, [companySession?.accessToken]);

  useEffect(() => {
    if (!companySession?.accessToken || status !== AUTH.READY || !address || !particleIdentity?.uuid) {
      setCompanySessionValidated(false);
      return undefined;
    }

    let cancelled = false;
    setCompanySessionValidated(false);
    setSessionRestoreError("");
    const controller = new AbortController();
    const requestTimeout = window.setTimeout(() => controller.abort(), 10000);
    getCompanyMe(companySession.accessToken, { signal: controller.signal })
      .then(({ user: verifiedUser, company }) => {
        if (cancelled) return;
        const sameParticleUser = verifiedUser?.particleUserId === particleIdentity.uuid;
        const sameSettlementAccount = verifiedUser?.walletAddress?.toLowerCase() === address.toLowerCase();
        if (!sameParticleUser || !sameSettlementAccount) {
          clearCompanySession();
          setCompanySession(null);
          return;
        }
        setCompanySession((current) => current?.accessToken === companySession.accessToken
          ? { ...current, user: verifiedUser, company }
          : current);
        setCompanySessionValidated(true);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause?.status === 401 || cause?.status === 403) {
          clearCompanySession();
          setCompanySession(null);
        } else {
          // A temporary gateway outage is not a sign-out. Keep the Particle and
          // company sessions intact so the operator can retry in place.
          setSessionRestoreError(cause?.name === "AbortError"
            ? "Workspace restoration took too long. Please retry or return to sign in."
            : cause?.message || "Company access could not be verified");
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [companySession?.accessToken, status, address, particleIdentity?.uuid, sessionRestoreRetry]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Storage being unavailable is not worth interrupting anyone over; the
      // app simply goes back to forgetting.
    }
  }, [view]);

  useEffect(() => {
    function restoreRoute() {
      const routedView = viewFromPath();
      setView(routedView || (readCompanySession() ? readStoredView() : { name: "landing" }));
    }
    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);

  // Bumping this re-runs Overview's load. Used after a transaction or a fault
  // simulation, so the list reflects the new state without a page reload.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  // A restored session arrives with a wallet that may already hold a balance,
  // so read it rather than starting every session at zero.
  useEffect(() => {
    if (!address) {
      setBalance("0.00");
      return;
    }
    let cancelled = false;
    // Once the token is deployed the balance is a fact on chain, not something
    // the mock ledger should be inventing.
    //
    // The gateway also reports whether this wallet has already drawn from the
    // faucet. That ledger lives on the gateway, so it is the only thing that
    // knows — the mock session row cannot, and assuming "not yet" would offer a
    // claim that comes straight back as a 409.
    const read = sourceIsLive
      ? api.getDemoBalance(address).then((r) => ({
          balance: r.balance ?? r.formatted ?? "0.00",
          hasClaimed: r.hasClaimed
        }))
      : onChainConfigured
        ? getIdrtBalance(address).then((balance) => ({ balance }))
        : mockBalance(address).then((result) => ({
            balance: result.balance,
            hasClaimed: result.hasClaimed
          }));

    read
      .then(({ balance: value, hasClaimed }) => {
        if (cancelled) return;
        if (value != null) setBalance(value);
        if (hasClaimed != null) {
          setUser((current) =>
            current ? { ...current, hasClaimedDemoBalance: hasClaimed } : current
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address, setUser, refreshKey]);

  const handleClaim = useCallback(async () => {
    if (!address) return;
    setClaiming(true);
    setClaimError("");
    try {
      // The real faucet mints through the backend's minter wallet; MINTER_ROLE
      // makes this impossible from the browser, so the gateway does it for us.
      const result = sourceIsLive
        ? await api.claimDemoBalance(address, "importer")
        : await mockClaim(address);
      setBalance(result.newBalance ?? result.balance ?? "0.00");
      setUser((current) => (current ? { ...current, hasClaimedDemoBalance: true } : current));
    } catch (err) {
      // A failed mint used to go to console.warn only: the button simply stopped
      // spinning and nothing said why. The reasons are all actionable — already
      // claimed, minter lacks MINTER_ROLE, gateway unreachable — so show them.
      setClaimError(err?.message || "Could not claim the demo balance.");
    } finally {
      setClaiming(false);
    }
  }, [address, setUser]);

  const updateEscrow = useCallback((id, updater) => {
    setEscrows((current) =>
      current.map((escrow) => (escrow.id === id ? updater(escrow) : escrow))
    );
  }, []);

  // Registry rows arrive complete (milestones + activity already fetched), so
  // they replace the mock set wholesale rather than going through the chain
  // merge below, which deliberately blanks activity for rows it has not seen.
  const loadRegistryEscrows = useCallback((rows) => {
    setEscrows((current) => [...current.filter((e) => e.source === "chain"), ...rows]);
  }, []);

  // Merge chain rows into the registry, keeping any local session data
  // (activity log, harness state) for escrows we already know about.
  const syncChainEscrows = useCallback((rows) => {
    setEscrows((current) => {
      const known = new Map(current.map((escrow) => [escrow.id, escrow]));
      const merged = rows.map((row) => {
        const existing = known.get(row.id);
        return existing
          ? { ...existing, ...row, activity: existing.activity, votes: existing.votes }
          : {
              ...row,
              createdAt: null,
              verification: null,
              votes: { importer: null, exporter: null, arbiter: null },
              pendingExtension: null,
              activity: []
            };
      });
      const mockOnly = current.filter(
        (escrow) => escrow.source === "mock" && !rows.some((row) => row.id === escrow.id)
      );
      return [...mockOnly, ...merged];
    });
  }, []);

  const resetDemo = useCallback(() => {
    setEscrows((current) => current.filter((escrow) => escrow.source === "chain"));
    setView({ name: "overview" });
  }, []);

  const handleSignOut = useCallback(async () => {
    clearCompanySession();
    setCompanySession(null);
    setSessionRestoreError("");
    await disconnect();
    setBalance("0.00");
    setView({ name: "landing" });
  }, [disconnect]);

  const handleClearCompanyAccess = useCallback(async () => {
    clearCompanySession();
    setCompanySessionValidated(false);
    setCompanySession(null);
    setSessionRestoreError("");
    await disconnect();
  }, [disconnect]);

  const retryWorkspaceRestore = useCallback(() => {
    setRestoreTimedOut(false);
    setSessionRestoreError("");
    setCompanySessionValidated(false);
    setSessionRestoreRetry((count) => count + 1);
  }, []);

  const returnToSignIn = useCallback(() => {
    clearCompanySession();
    setCompanySession(null);
    setCompanySessionValidated(false);
    setRestoreTimedOut(false);
    setAuthRecoveryMessage("Your saved session could not be restored. Sign in again to continue.");
    setView({ name: "login" });
  }, []);

  // Once authenticated, "login" stops being a destination. Deriving this rather
  // than setting state on sign-in avoids a frame where the workspace is ready
  // but the router still points at the login screen.
  const activeView = workspaceReady && view.name === "login" && !inviteCode ? { name: "overview" } : view;

  useEffect(() => {
    const targetPath = pathFromView(activeView);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ sternView: activeView }, "", `${targetPath}${window.location.search}${window.location.hash}`);
    }
  }, [activeView.name, activeView.id]);

  const activeEscrow = useMemo(
    () => (activeView.name === "escrow" ? escrows.find((escrow) => escrow.id === activeView.id) : null),
    [activeView, escrows]
  );

  // Ops is checked before the Particle gate: the arbiter and admin sign in with
  // their own keys, so requiring a Particle session first would be nonsense.
  if (activeView.name === "ops") {
    return <OpsConsole onExit={() => setView({ name: workspaceReady ? "overview" : "landing" })} />;
  }

  // Marketing surface — no login required, shares the dark chrome.
  const MarketingPage = MARKETING[activeView.name];
  if (MarketingPage && !inviteCode) {
    return (
      <div className="h-dvh overflow-y-auto">
        <MarketingPage
          onNavigate={(name) => setView({ name })}
          onEnter={() => setView({ name: workspaceReady ? "overview" : "login" })}
        />
      </div>
    );
  }

  // A workspace route always has an explicit bootstrap state. This holds the
  // route while Particle restores, but never forever: timeout or API failure
  // moves to a recovery state with retry and sign-in actions.
  if (isWorkspaceRoute && !workspaceReady && bootstrapState !== BOOTSTRAP.UNAUTHENTICATED) {
    const isError = bootstrapState === BOOTSTRAP.ERROR;
    return (
      <SessionBoot
        label={isError ? "We could not restore your workspace" : "Restoring your workspace"}
        detail={isError
          ? "Your saved session could not be restored."
          : bootstrapState === BOOTSTRAP.BOOTING
            ? "Restoring your secure sign-in session."
            : "Restoring your company access and settlement account."}
        error={isError ? sessionRestoreError || error || "Please retry or return to sign in." : ""}
        onRetry={isError ? retryWorkspaceRestore : undefined}
        onSignIn={isError ? returnToSignIn : undefined}
      />
    );
  }

  if (inviteCode || !workspaceReady) {
    return (
      <Login
        companySession={companySession}
        onCompanyAuthenticated={updateCompanySession}
        accountStatus={status}
        accountAddress={address}
        particleIdentity={particleIdentity}
        onPrepareAccount={connect}
        onRefreshParticleIdentity={refreshParticleIdentity}
        onDisconnectAccount={disconnect}
        accountError={authRecoveryMessage || error}
        onBack={() => {
          if (inviteCode) {
            const url = new URL(window.location.href);
            url.searchParams.delete("invite");
            window.history.replaceState(null, "", url);
          }
          setView({ name: "landing" });
        }}
      />
    );
  }

  return (
    <div className="stern-workspace-shell flex h-dvh overflow-hidden text-navy">
      {/* Backdrop for the mobile drawer. Tapping it closes the nav, which is the
          gesture people try first — a drawer that only closes from its own
          button feels stuck. */}
      {navOpen ? (
        <div
          role="presentation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-30 bg-onyx/50 lg:hidden"
        />
      ) : null}

      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        view={activeView.name}
        onNavigate={(name) => { setView({ name }); setNavOpen(false); }}
        onOpenOps={() => { setView({ name: "ops" }); setNavOpen(false); }}
        isOnChainReady={sourceIsLive}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On a phone the sidebar cannot simply sit there: at 238px fixed it took
            most of a 390px screen and the workspace was clipped rather than
            narrowed — the page title itself was cut in half. It becomes a drawer,
            and this bar is what opens it. */}
        <header className="stern-workspace-topbar flex shrink-0 items-center gap-3 border-b border-sky/70 bg-surface/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:justify-end lg:px-9 xl:px-12">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label={t("Open navigation")}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-panel border border-sky text-navy transition-colors duration-150 hover:border-teal/40 lg:hidden"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          {/* `invert` matches the sidebar: the asset is light-on-transparent, so
              without it the mark is almost invisible on the light chrome. */}
          <img src={sternLogo} alt="STERN" className="h-4 w-auto invert lg:hidden" />
          <AccountMenu session={companySession} onNavigate={(name) => setView({ name })} onSessionChange={updateCompanySession} onSignOut={handleSignOut} />
        </header>

      {/* `relative` is load-bearing, not decoration. Without a positioned
          ancestor, absolutely-positioned descendants resolve against the initial
          containing block and escape this element's overflow entirely — the
          screen-reader labels on the explorer links did exactly that, stretching
          the document 324px past the viewport and leaving a band of dead space
          below the app that scrolled but showed nothing. */}
        <main className="stern-workspace-main relative flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-9 lg:py-8 xl:px-12">
        <div key={`${activeView.name}-${activeView.id ?? ""}`} className="stern-workspace-page mx-auto w-full max-w-[1600px]">
        {activeView.name === "security" ? (
          <Security session={companySession} onSessionChange={updateCompanySession} />
        ) : activeView.name === "account" ? (
          <Account session={companySession} onSessionChange={updateCompanySession} />
        ) : activeView.name === "team" ? (
          <CompanyTeam session={companySession} />
        ) : activeView.name === "create" ? (
          <NewEscrow
            balance={balance}
            smartAccountClient={smartAccountClient}
            importerAddress={address}
            onCreated={(escrowId) => { refresh(); setView({ name: "escrow", id: String(escrowId) }); }}
            onBack={() => setView({ name: "overview" })}
          />
        ) : activeView.name === "escrow" && activeEscrow ? (
          <EscrowDetail
            escrow={activeEscrow}
            walletAddress={address}
            particleOwnerAddress={user?.eoaOwnerAddress}
            companyAccessToken={companySession?.accessToken}
            isOnChainReady={sourceIsLive}
            smartAccountClient={smartAccountClient}
            onRefresh={refresh}
            onUpdate={updateEscrow}
            onBack={() => setView({ name: "overview" })}
          />
        ) : (
          <Overview
            walletAddress={address}
            user={user}
            balance={balance}
            claiming={claiming}
            claimError={claimError}
            canClaim={canClaim}
            onClaim={handleClaim}
            refreshKey={refreshKey}
            onOpen={(id) => setView({ name: "escrow", id })}
            onCreate={() => setView({ name: "create" })}
            onRegistryLoad={loadRegistryEscrows}
          />
        )}
        </div>
        </main>
      </div>
    </div>
  );
}
