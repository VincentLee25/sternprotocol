import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import sternLogo from "./assets/stern-logo.png";
import SessionBoot from "./components/SessionBoot.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import NewEscrow from "./pages/NewEscrow.jsx";
import EscrowDetail from "./pages/EscrowDetail.jsx";
import OpsConsole from "./pages/OpsConsole.jsx";
import Security from "./pages/Security.jsx";
import { claimDemoBalance as mockClaim, getDemoBalance as mockBalance } from "./lib/mockBackend.js";
import * as api from "./lib/sternApi.js";
import { sourceIsLive } from "./lib/escrowSource.js";
import { AUTH, useSternAuth } from "./lib/useSternAuth.js";
import { getIdrtBalance, onChainConfigured } from "./lib/sternContract.js";
import { LanguageProvider } from "./lib/language.jsx";
import { clearCompanySession, readCompanySession, writeCompanySession } from "./lib/companySession.js";

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
const KNOWN_VIEWS = new Set([
  "landing", "instrument", "settlement", "oracles",
  "login", "overview", "create", "escrow", "ops", "security"
]);

function readStoredView() {
  // The public introduction is the entry point, not a persisted private route.
  // Previously a stored `login` value made a fresh browser visit look as if the
  // landing page did not exist. Workspace state is still held while the app is
  // open; a new visit starts with the product story and asks for sign-in only
  // after the visitor chooses to enter.
  return { name: "landing" };
}

export default function App() {
  return <LanguageProvider><SternApp /></LanguageProvider>;
}

function SternApp() {
  const { status, user, error, connect, connectGoogle, disconnect, setUser, smartAccountClient } = useSternAuth();
  const [balance, setBalance] = useState("0.00");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [view, setView] = useState(readStoredView);
  const [escrows, setEscrows] = useState([]);
  const [navOpen, setNavOpen] = useState(false);
  const [companySession, setCompanySession] = useState(readCompanySession);

  const address = user?.smartAccountAddress;
  const expectedAddress = companySession?.user?.walletAddress?.toLowerCase();
  const accountMatches = !expectedAddress || !address || expectedAddress === address.toLowerCase();
  const workspaceReady = Boolean(companySession && status === AUTH.READY && address && accountMatches);

  const updateCompanySession = useCallback((session) => {
    setCompanySession(session);
    writeCompanySession(session);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Storage being unavailable is not worth interrupting anyone over; the
      // app simply goes back to forgetting.
    }
  }, [view]);

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
    await disconnect();
    setBalance("0.00");
    setView({ name: "landing" });
  }, [disconnect]);

  const handleClearCompanyAccess = useCallback(async () => {
    clearCompanySession();
    setCompanySession(null);
    await disconnect();
  }, [disconnect]);

  // Once authenticated, "login" stops being a destination. Deriving this rather
  // than setting state on sign-in avoids a frame where the workspace is ready
  // but the router still points at the login screen.
  const activeView = workspaceReady && view.name === "login" ? { name: "overview" } : view;

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
  if (MarketingPage) {
    return (
      <div className="h-dvh overflow-y-auto">
        <MarketingPage
          onNavigate={(name) => setView({ name })}
          onEnter={() => setView({ name: workspaceReady ? "overview" : "login" })}
        />
      </div>
    );
  }

  // Particle restores a session asynchronously. Without this branch the app
  // renders Login for a beat on every refresh, even for a signed-in user.
  if (companySession && activeView.name !== "login" && status === AUTH.LOADING) {
    return <SessionBoot label="Restoring your workspace" />;
  }

  // Connected, but the smart account address is still being derived. Entering
  // the workspace here would show an empty wallet and a zero balance.
  if (companySession && activeView.name !== "login" && status === AUTH.AUTHENTICATING) {
    return <SessionBoot label="Preparing your workspace" detail="Loading your company access and settlement permissions." />;
  }

  if (!workspaceReady) {
    return (
      <Login
        companySession={companySession}
        onCompanyAuthenticated={updateCompanySession}
        onClearCompanySession={handleClearCompanyAccess}
        accountStatus={status}
        accountAddress={address}
        onPrepareAccount={connect}
        onGoogleSignIn={connectGoogle}
        onDisconnectAccount={disconnect}
        accountError={error}
        onBack={() => setView({ name: "landing" })}
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
        user={user}
        balance={balance}
        claiming={claiming}
        claimError={claimError}
        onClaim={handleClaim}
        canClaim={canClaim}
        onOpenOps={() => { setView({ name: "ops" }); setNavOpen(false); }}
        onSignOut={handleSignOut}
        isOnChainReady={sourceIsLive}
        companySession={companySession}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On a phone the sidebar cannot simply sit there: at 238px fixed it took
            most of a 390px screen and the workspace was clipped rather than
            narrowed — the page title itself was cut in half. It becomes a drawer,
            and this bar is what opens it. */}
        <header className="flex items-center gap-3 border-b border-sky/70 bg-surface/90 px-4 py-3 shadow-card backdrop-blur-xl lg:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-panel border border-sky text-navy transition-colors duration-150 hover:border-teal/40"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
          {/* `invert` matches the sidebar: the asset is light-on-transparent, so
              without it the mark is almost invisible on the light chrome. */}
          <img src={sternLogo} alt="STERN" className="h-4 w-auto invert dark:invert-0" />
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
        ) : activeView.name === "create" ? (
          <NewEscrow
            balance={balance}
            smartAccountClient={smartAccountClient}
            importerAddress={address}
            onCreated={(escrowId) => { refresh(); setView({ name: "escrow", id: escrowId }); }}
            onBack={() => setView({ name: "overview" })}
          />
        ) : activeView.name === "escrow" && activeEscrow ? (
          <EscrowDetail
            escrow={activeEscrow}
            walletAddress={address}
            isOnChainReady={sourceIsLive}
            smartAccountClient={smartAccountClient}
            onRefresh={refresh}
            onUpdate={updateEscrow}
            onBack={() => setView({ name: "overview" })}
          />
        ) : (
          <Overview
            walletAddress={address}
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
