import React from "react";
import ReactDOM from "react-dom/client";
import "../lib/i18n";
import "../index.css";
import DesktopApp from "./DesktopApp";

document.documentElement.dataset.theme = "dark";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
);
