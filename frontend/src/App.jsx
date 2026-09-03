import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import SessionBoot from "./components/SessionBoot.jsx";
import Landing from "./pages/Landing.jsx";
import Instrument from "./pages/Instrument.jsx";
import Settlement from "./pages/Settlement.jsx";
import Oracles from "./pages/Oracles.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import NewEscrow from "./pages/NewEscrow.jsx";
import EscrowDetail from "./pages/EscrowDetail.jsx";
import OpsConsole from "./pages/OpsConsole.jsx";
import { claimDemoBalance as mockClaim, getDemoBalance as mockBalance } from "./lib/mockBackend.js";
import * as api from "./lib/sternApi.js";
import { sourceIsLive } from "./lib/escrowSource.js";
import { AUTH, useSternAuth } from "./lib/useSternAuth.js";
import { getIdrtBalance, onChainConfigured } from "./lib/sternContract.js";

const MARKETING = { landing: Landing, instrument: Instrument, settlement: Settlement, oracles: Oracles };

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

export default function App() {
  const { status, user, error, connect, disconnect, setUser, smartAccountClient } = useSternAuth();
  const [balance, setBalance] = useState("0.00");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [view, setView] = useState({ name: "landing" });
  const [escrows, setEscrows] = useState([]);

  const address = user?.smartAccountAddress;

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
    await disconnect();
    setBalance("0.00");
    setView({ name: "landing" });
  }, [disconnect]);

  // Once authenticated, "login" stops being a destination. Deriving this rather
  // than setting state on sign-in avoids a frame where the workspace is ready
  // but the router still points at the login screen.
  const activeView = status === AUTH.READY && view.name === "login" ? { name: "overview" } : view;

  const activeEscrow = useMemo(
    () => (activeView.name === "escrow" ? escrows.find((escrow) => escrow.id === activeView.id) : null),
    [activeView, escrows]
  );

  // Ops is checked before the Particle gate: the arbiter and admin sign in with
  // their own keys, so requiring a Particle session first would be nonsense.
  if (activeView.name === "ops") {
    return <OpsConsole onExit={() => setView({ name: status === AUTH.READY ? "overview" : "landing" })} />;
  }

  // Marketing surface — no login required, shares the dark chrome.
  const MarketingPage = MARKETING[activeView.name];
  if (MarketingPage) {
    return (
      <div className="h-dvh overflow-y-auto">
        <MarketingPage
          onNavigate={(name) => setView({ name })}
          onEnter={() => setView({ name: status === AUTH.READY ? "overview" : "login" })}
        />
      </div>
    );
  }

  // Particle restores a session asynchronously. Without this branch the app
  // renders Login for a beat on every refresh, even for a signed-in user.
  if (status === AUTH.LOADING) {
    return <SessionBoot label="Restoring your session" />;
  }

  // Connected, but the smart account address is still being derived. Entering
  // the workspace here would show an empty wallet and a zero balance.
  if (status === AUTH.AUTHENTICATING) {
    return <SessionBoot label="Preparing your wallet" detail="Creating your Smart Account — this happens once." />;
  }

  if (status !== AUTH.READY) {
    return <Login onConnect={connect} error={error} busy={false} />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-beige text-navy">
      <Sidebar
        view={activeView.name}
        onNavigate={(name) => setView({ name })}
        user={user}
        balance={balance}
        claiming={claiming}
        claimError={claimError}
        onClaim={handleClaim}
        canClaim={canClaim}
        onOpenOps={() => setView({ name: "ops" })}
        onSignOut={handleSignOut}
        isOnChainReady={sourceIsLive}
      />

      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
        {activeView.name === "create" ? (
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
      </main>
    </div>
  );
}
