// Bridges Particle Connect Kit to the `user` shape the rest of the app already
// consumes ({ smartAccountAddress, eoaOwnerAddress, email, hasClaimedDemoBalance }).
//
// Everything downstream of this file — Sidebar, Overview, NewEscrow,
// EscrowDetail — is untouched by the Particle migration. They only ever needed
// an address.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useModal, useParticleAuth as useParticleAuthCore, useWallets } from "@particle-network/connectkit";
import { particleEnabled } from "./particle.js";
import { createSternSmartAccount, gaslessConfigured } from "./smartAccount.js";
import { signOut as mockSignOut } from "./mockBackend.js";

const PARTICLE_RESTORE_RETRY_MS = 300;
const PARTICLE_NOT_READY = /current wallet is not a particle wallet|particle is not initialized/i;

function readParticleUserInfo(fallback) {
  // ConnectKit's hook captures `window.particle` at render time. During a
  // browser restore its first render can happen before that runtime attaches,
  // leaving the captured method permanently stale even after Particle is ready.
  // Read the live runtime first, then retain the hook as the normal fallback.
  const internal = typeof window === "undefined" ? null : window.particle?._internal;
  if (typeof internal?.getUserInfo === "function") return internal.getUserInfo();
  return fallback();
}

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
  const { getUserInfo } = useParticleAuthCore();

  const [user, setUser] = useState(null);
  const [particleIdentity, setParticleIdentity] = useState(null);
  const [error, setError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  // permissionless SmartAccountClient. Null until the Safe is built, and stays
  // null when no Pimlico key is configured — the address still resolves.
  const [smartAccountClient, setSmartAccountClient] = useState(null);
  // Guards against re-deriving the account for the same Particle identity when
  // React StrictMode double-invokes the effect or an incidental render occurs.
  const registeredFor = useRef(null);
  const getUserInfoRef = useRef(getUserInfo);
  getUserInfoRef.current = getUserInfo;

  const connected = account.status === "connected";

  useEffect(() => {
    if (!connected || !primaryWallet) return;

    let cancelled = false;

    (async () => {
      try {
        // Check Particle first. Safe derivation touches the RPC, so it must not
        // run repeatedly while ConnectKit is still restoring its own session.
        const info = readParticleUserInfo(getUserInfoRef.current);
        if (!info?.uuid || !info?.token) {
          throw new Error("Particle is still restoring your sign-in session.");
        }

        // The Safe address is derived asynchronously and is NOT account.address
        // — that one is the social-login EOA that owns the Safe.
        const walletClient = primaryWallet.getWalletClient();
        const { address: smartAccountAddress, client } = await createSternSmartAccount(walletClient);
        if (cancelled) return;
        setSmartAccountClient(client);

        const identityKey = `${info.uuid}:${smartAccountAddress.toLowerCase()}`;
        if (registeredFor.current === identityKey) return;
        registeredFor.current = identityKey;

        if (cancelled) return;
        setUser({
          smartAccountAddress,
          eoaOwnerAddress: account.address,
          email: info.email || info.google_email || info.apple_email || info.facebook_email || info.github_email || info.linkedin_email || "",
          hasClaimedDemoBalance: false
        });
        setParticleIdentity({ uuid: info.uuid, token: info.token });
        setError("");
      } catch (err) {
        if (cancelled) return;
        // Particle can report a connected wallet before its browser runtime is
        // attached. Keep the saved STERN session in place and retry that brief
        // initialization window instead of forcing an unnecessary sign-in.
        if (PARTICLE_NOT_READY.test(String(err?.message)) || /still restoring your sign-in session/i.test(String(err?.message))) {
          window.setTimeout(() => {
            if (!cancelled) setRestoreAttempt((attempt) => attempt + 1);
          }, PARTICLE_RESTORE_RETRY_MS);
          return;
        }
        registeredFor.current = null;
        setError(err?.message || "Could not finish signing you in.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, primaryWallet, account.address, account.connector, restoreAttempt]);

  useEffect(() => {
    if (account.status === "disconnected") {
      registeredFor.current = null;
      setUser(null);
      setParticleIdentity(null);
      setSmartAccountClient(null);
      setRestoreAttempt(0);
    }
  }, [account.status]);

  const connect = useCallback(() => {
    setError("");
    // Must be called from a user gesture or the browser blocks Particle's popup.
    setOpen(true);
  }, [setOpen]);

  const refreshParticleIdentity = useCallback(() => {
    if (!connected || !user?.smartAccountAddress) throw new Error("Connect with Particle before checking company access.");
    const info = readParticleUserInfo(getUserInfoRef.current);
    if (!info?.uuid || !info?.token) throw new Error("Particle session expired. Reconnect your account to continue.");
    if (particleIdentity?.uuid && particleIdentity.uuid !== info.uuid) {
      throw new Error("Particle account changed. Reconnect before accessing a STERN company.");
    }
    setParticleIdentity((current) => current?.uuid === info.uuid && current?.token === info.token
      ? current
      : { uuid: info.uuid, token: info.token });
    return { uuid: info.uuid, token: info.token };
  }, [connected, user?.smartAccountAddress, particleIdentity?.uuid]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectAsync();
    } finally {
      registeredFor.current = null;
      setUser(null);
      setParticleIdentity(null);
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
    particleIdentity,
    error,
    connect,
    refreshParticleIdentity,
    disconnect,
    setUser,
    smartAccountClient,
    gasless: gaslessConfigured
  };
}

// Missing Particle configuration is a setup error, never a mock company login.
function useUnavailableAuth() {
  return {
    status: AUTH.ERROR,
    user: null,
    particleIdentity: null,
    error: "Particle Auth is not configured. Set the Particle project, client, and app IDs before accessing the workspace.",
    connect: null,
    refreshParticleIdentity: null,
    disconnect: async () => {},
    setUser: () => {},
    smartAccountClient: null,
    gasless: false
  };
}

// Chosen once at module load, so hook order stays stable for the session.
export const useSternAuth = particleEnabled ? useParticleAuth : useUnavailableAuth;
