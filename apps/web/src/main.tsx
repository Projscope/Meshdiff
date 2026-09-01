import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { AuthProvider } from "./lib/AuthProvider";
import { initAnalytics } from "./lib/analytics";
import "./lib/i18n";
import { initLanguage } from "./lib/language";
import "./index.css";

initAnalytics();
initLanguage();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
