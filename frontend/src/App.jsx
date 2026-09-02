import { useCallback, useEffect, useState } from "react";
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
import { claimDemoBalance, getDemoBalance } from "./lib/mockBackend.js";
import { AUTH, useSternAuth } from "./lib/useSternAuth.js";
import { getIdrtBalance, onChainConfigured } from "./lib/sternContract.js";

const MARKETING = { landing: Landing, instrument: Instrument, settlement: Settlement, oracles: Oracles };

export default function App() {
  const { status, user, error, connect, disconnect, setUser, smartAccountClient } = useSternAuth();
  const [balance, setBalance] = useState("0.00");
  const [claiming, setClaiming] = useState(false);
  const [role, setRole] = useState("importer");
  const [view, setView] = useState({ name: "landing" });

  const address = user?.smartAccountAddress;

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
    const read = onChainConfigured
      ? getIdrtBalance(address)
      : getDemoBalance(address).then((result) => result.balance);

    read
      .then((value) => {
        if (!cancelled && value != null) setBalance(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleClaim = useCallback(async () => {
    if (!address) return;
    setClaiming(true);
    try {
      const result = await claimDemoBalance(address);
      setBalance(result.newBalance);
      setUser((current) => (current ? { ...current, hasClaimedDemoBalance: true } : current));
    } catch (err) {
      console.warn(err.message);
    } finally {
      setClaiming(false);
    }
  }, [address, setUser]);

  const handleSignOut = useCallback(async () => {
    await disconnect();
    setBalance("0.00");
    setView({ name: "landing" });
  }, [disconnect]);

  // Once authenticated, "login" stops being a destination. Deriving this rather
  // than setting state on sign-in avoids a frame where the workspace is ready
  // but the router still points at the login screen.
  const activeView = status === AUTH.READY && view.name === "login" ? { name: "overview" } : view;

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
        role={role}
        onRoleChange={setRole}
        user={user}
        balance={balance}
        claiming={claiming}
        onClaim={handleClaim}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 overflow-y-auto px-6 py-6 lg:px-10 lg:py-8">
        {activeView.name === "create" ? (
          <NewEscrow
            role={role}
            balance={balance}
            smartAccountClient={smartAccountClient}
            importerAddress={address}
            onCreated={(escrowId) => setView({ name: "escrow", id: escrowId })}
            onBack={() => setView({ name: "overview" })}
          />
        ) : activeView.name === "escrow" ? (
          <EscrowDetail escrowId={activeView.id} role={role} onBack={() => setView({ name: "overview" })} />
        ) : (
          <Overview onOpen={(id) => setView({ name: "escrow", id })} onCreate={() => setView({ name: "create" })} />
        )}
      </main>
    </div>
  );
}
