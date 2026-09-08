import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { captureReferralFromUrl } from "./referral.js";
import "./styles.css";

captureReferralFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
