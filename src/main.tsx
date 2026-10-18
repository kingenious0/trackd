import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "./index.css";
import { getAnalyticsInstance, trackEvent } from "./lib/firebase";

// Immediately initialize Firebase Analytics stream on web
if (typeof window !== "undefined") {
  getAnalyticsInstance().then(() => {
    trackEvent("page_view", { page_path: window.location.pathname });
  }).catch(() => undefined);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
