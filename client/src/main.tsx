import { Analytics } from "@vercel/analytics/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { captureReferralFromUrl } from "./referral.js";
import "./styles.css";

captureReferralFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Last resort. App mounts its own narrower boundary around the match
        screens so a board crash costs one match rather than the whole app;
        this one only fires for something App itself could not survive. */}
    <ErrorBoundary where="root">
      <App />
    </ErrorBoundary>
    <Analytics />
  </React.StrictMode>,
);
