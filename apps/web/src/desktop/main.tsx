import React from "react";
import ReactDOM from "react-dom/client";
// Self-hosted fonts (the website loads these from Google Fonts, which the desktop
// app's CSP forbids and which can't work offline).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";
import "../lib/i18n";
import "../index.css";
import DesktopApp from "./DesktopApp";

document.documentElement.dataset.theme = "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
);
