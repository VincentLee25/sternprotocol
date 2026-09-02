import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ConnectKitProvider } from "@particle-network/connectkit";
import App from "./App.jsx";
import SessionBoot from "./components/SessionBoot.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { particleConfig } from "./lib/particle.js";
import "./styles.css";

// With no credentials `particleConfig` is null and we mount App bare — the app
// then runs on the mock layer instead of crashing inside the provider.
const withProvider = particleConfig ? (
  <ConnectKitProvider config={particleConfig}>
    <App />
  </ConnectKitProvider>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* ConnectKit lazy-loads parts of its modal. If one of those suspends
          while React is responding to a click, React 18 throws "A component
          suspended while responding to synchronous input" and unmounts the
          whole tree — which looks like a blank page. This boundary turns that
          into a normal loading state. */}
      <Suspense fallback={<SessionBoot label="Loading STERN" />}>{withProvider}</Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
