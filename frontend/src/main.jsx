import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { ConnectKitProvider } from "@particle-network/connectkit";
import App from "./App.jsx";
import SessionBoot from "./components/SessionBoot.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { particleConfig } from "./lib/particle.js";
import { LanguageProvider } from "./lib/language.jsx";
import "./styles.css";

// With no credentials, render a clear setup error instead of fabricating an
// authenticated company session.
const withProvider = particleConfig ? (
  <ConnectKitProvider config={particleConfig}>
    <App />
  </ConnectKitProvider>
) : (
  <App />
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        {/* Both the app and this Suspense fallback use the shared language
            context, so the provider must sit above the boundary. */}
        <Suspense fallback={<SessionBoot label="Loading STERN" />}>{withProvider}</Suspense>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>
);
