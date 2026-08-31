import { useCallback, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Landing from "./pages/Landing.jsx";
import Instrument from "./pages/Instrument.jsx";
import Settlement from "./pages/Settlement.jsx";
import Oracles from "./pages/Oracles.jsx";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import NewEscrow from "./pages/NewEscrow.jsx";
import EscrowDetail from "./pages/EscrowDetail.jsx";
import { claimDemoBalance, signOut } from "./lib/mockBackend.js";

const MARKETING = { landing: Landing, instrument: Instrument, settlement: Settlement, oracles: Oracles };

export default function App() {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [claiming, setClaiming] = useState(false);
  const [role, setRole] = useState("importer");
  const [view, setView] = useState({ name: "landing" });

  const handleClaim = useCallback(async () => {
    if (!user) return;
    setClaiming(true);
    try {
      const result = await claimDemoBalance(user.smartAccountAddress);
      setBalance(result.newBalance);
      setUser((current) => ({ ...current, hasClaimedDemoBalance: true }));
    } catch (error) {
      console.warn(error.message);
    } finally {
      setClaiming(false);
    }
  }, [user]);

  const handleSignOut = useCallback(() => {
    signOut();
    setUser(null);
    setBalance("0.00");
    setView({ name: "landing" });
  }, []);

  // Marketing surface — no login required, shares the dark chrome.
  const MarketingPage = MARKETING[view.name];
  if (MarketingPage) {
    return (
      <div className="h-dvh overflow-y-auto">
        <MarketingPage
          onNavigate={(name) => setView({ name })}
          onEnter={() => setView({ name: user ? "overview" : "login" })}
        />
      </div>
    );
  }

  if (view.name === "login" || !user) {
    return (
      <Login
        onAuthenticated={(authedUser) => {
          setUser(authedUser);
          setView({ name: "overview" });
        }}
      />
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-beige text-navy">
      <Sidebar
        view={view.name}
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
        {view.name === "create" ? (
          <NewEscrow
            role={role}
            balance={balance}
            onCreated={(escrowId) => setView({ name: "escrow", id: escrowId })}
            onBack={() => setView({ name: "overview" })}
          />
        ) : view.name === "escrow" ? (
          <EscrowDetail escrowId={view.id} role={role} onBack={() => setView({ name: "overview" })} />
        ) : (
          <Overview onOpen={(id) => setView({ name: "escrow", id })} onCreate={() => setView({ name: "create" })} />
        )}
      </main>
    </div>
  );
}
