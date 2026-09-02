// Particle Connect Kit configuration.
//
// Connect Kit is the umbrella package: it bundles Auth Core (social login, now
// published as @particle-network/authkit), the wallet connectors, and the
// ERC-4337 account-abstraction plugin behind one provider. See
// docs/03_PARTICLE_INTEGRATION.md §1 for who owns which piece.
//
// Pin the version. The `latest` dist-tag on @particle-network/connectkit points
// at a 3.0.0 alpha; 2.1.3 is the newest stable.
import { createConfig } from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { polygonAmoy } from "@particle-network/connectkit/chains";

const projectId = import.meta.env.VITE_PARTICLE_PROJECT_ID;
const clientKey = import.meta.env.VITE_PARTICLE_CLIENT_KEY;
const appId = import.meta.env.VITE_PARTICLE_APP_ID;

// Two independent reasons to stay on the mock layer: the operator turned
// Particle off, or the credentials simply are not present. Treat both the same
// so a missing .env degrades to a working demo instead of a blank screen.
const flagEnabled = import.meta.env.VITE_PARTICLE_ENABLED !== "false";
const hasCredentials = Boolean(projectId && clientKey && appId);

export const particleEnabled = flagEnabled && hasCredentials;

export const missingCredentials = flagEnabled && !hasCredentials;

export const particleConfig = particleEnabled
  ? createConfig({
      projectId,
      clientKey,
      appId,
      chains: [polygonAmoy],
      walletConnectors: [
        // Social login only. Institutional verifiers deliberately stay on plain
        // EOAs managed by the backend (docs/03 §2), so no external-wallet
        // connector is registered here.
        authWalletConnectors({
          authTypes: ["google", "email"]
        })
      ],
      // No `aa()` plugin. The smart account is built in lib/smartAccount.js
      // with Safe + Pimlico instead — see the note there for why.
      plugins: [],
      appearance: {
        mode: "light",
        // Particle renders its own modal; these are the only levers over it.
        splitEmailAndPhone: false,
        collapseWalletList: true,
        hideContinueButton: false
      }
    })
  : null;

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 80002);
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
export const IDRT_TOKEN_ADDRESS = import.meta.env.VITE_IDRT_TOKEN_ADDRESS || "";
export const ORACLE_API = import.meta.env.VITE_ORACLE_API || "";
