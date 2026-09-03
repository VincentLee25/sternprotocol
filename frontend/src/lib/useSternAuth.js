// Bridges Particle Connect Kit to the `user` shape the rest of the app already
// consumes ({ smartAccountAddress, eoaOwnerAddress, email, hasClaimedDemoBalance }).
//
// Everything downstream of this file — Sidebar, Overview, NewEscrow,
// EscrowDetail — is untouched by the Particle migration. They only ever needed
// an address.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useModal, useWallets } from "@particle-network/connectkit";
import { particleEnabled } from "./particle.js";
import { createSternSmartAccount, gaslessConfigured } from "./smartAccount.js";
import { postAuthSession, signOut as mockSignOut } from "./mockBackend.js";
import { adoptDemoEscrows } from "./mockRegistry.js";

// Status the UI switches on. Deliberately not the same vocabulary as Particle's:
// "loading" folds together two different waits that look identical to a user
// (restoring a session, and deriving the smart account address).
export const AUTH = {
  LOADING: "loading",
  ANONYMOUS: "anonymous",
  AUTHENTICATING: "authenticating",
  READY: "ready",
  ERROR: "error"
};

function useParticleAuth() {
  const account = useAccount();
  const [primaryWallet] = useWallets();
  const { setOpen } = useModal();
  const { disconnectAsync } = useDisconnect();

  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  // permissionless SmartAccountClient. Null until the Safe is built, and stays
  // null when no Pimlico key is configured — the address still resolves.
  const [smartAccountClient, setSmartAccountClient] = useState(null);
  // Guards against a second registration when React StrictMode double-invokes
  // the effect, and against re-registering on every incidental re-render.
  const registeredFor = useRef(null);

  const connected = account.status === "connected";

  useEffect(() => {
    if (!connected || !primaryWallet) return;

    let cancelled = false;

    (async () => {
      try {
        // The Safe address is derived asynchronously and is NOT account.address
        // — that one is the social-login EOA that owns the Safe.
        const walletClient = primaryWallet.getWalletClient();
        const { address: smartAccountAddress, client } = await createSternSmartAccount(walletClient);
        if (cancelled) return;
        setSmartAccountClient(client);

        if (registeredFor.current === smartAccountAddress) return;
        registeredFor.current = smartAccountAddress;

        // Register/lookup the user in our own backend (docs/03 §5 step 3).
        // Particle authenticates; it does not know about STERN's user table.
        const session = await postAuthSession({
          authType: account.connector?.id || "particle",
          email: undefined,
          smartAccountAddress,
          eoaOwnerAddress: account.address
        });

        if (cancelled) return;
        setUser({
          ...session,
          smartAccountAddress,
          eoaOwnerAddress: account.address
        });
        setError("");
      } catch (err) {
        if (cancelled) return;
        registeredFor.current = null;
        setError(err?.message || "Could not finish signing you in.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, primaryWallet, account.address, account.connector]);

  useEffect(() => {
    if (account.status === "disconnected") {
      registeredFor.current = null;
      setUser(null);
      setSmartAccountClient(null);
    }
  }, [account.status]);

  const connect = useCallback(() => {
    setError("");
    // Must be called from a user gesture or the browser blocks Particle's popup.
    setOpen(true);
  }, [setOpen]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
    } finally {
      registeredFor.current = null;
      setUser(null);
      setSmartAccountClient(null);
      mockSignOut();
    }
  }, [disconnectAsync]);

  let status;
  if (error) status = AUTH.ERROR;
  else if (account.status === "reconnecting") status = AUTH.LOADING;
  else if (account.status === "connecting") status = AUTH.AUTHENTICATING;
  // Connected but the smart account address has not resolved yet. Showing the
  // workspace here would render a sidebar with no wallet and a balance of 0.
  else if (connected && !user) status = AUTH.AUTHENTICATING;
  else if (connected && user) status = AUTH.READY;
  else status = AUTH.ANONYMOUS;

  return {
    status,
    user,
    error,
    connect,
    disconnect,
    setUser,
    smartAccountClient,
    gasless: gaslessConfigured
  };
}

// Mock path: no Particle credentials, or VITE_PARTICLE_ENABLED=false. Same
// return shape so App.jsx and Login.jsx never branch on which one is active.
function useMockAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(AUTH.ANONYMOUS);
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    setStatus(AUTH.AUTHENTICATING);
    setError("");
    try {
      const session = await postAuthSession({ authType: "google", email: "buyer@example.com" });
      // The seeded escrows name fixed demo addresses. Now that the role is read
      // off the escrow rather than picked in the sidebar, leaving them that way
      // would make this wallet a party to nothing and the whole demo read-only.
      adoptDemoEscrows(session.smartAccountAddress);
      setUser(session);
      setStatus(AUTH.READY);
    } catch (err) {
      setError(err?.message || "Login failed");
      setStatus(AUTH.ERROR);
    }
  }, []);

  const disconnect = useCallback(async () => {
    mockSignOut();
    setUser(null);
    setStatus(AUTH.ANONYMOUS);
  }, []);

  return {
    status,
    user,
    error,
    connect,
    disconnect,
    setUser,
    smartAccountClient: null,
    gasless: false
  };
}

// Chosen once at module load, so hook order stays stable for the session.
export const useSternAuth = particleEnabled ? useParticleAuth : useMockAuth;
