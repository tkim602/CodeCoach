import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getLocaleFromPath } from "./content";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("CodeCoach landing root was not found");
}

const locale = getLocaleFromPath(window.location.pathname);
document.documentElement.lang = locale;

createRoot(root).render(
  <StrictMode>
    <App locale={locale} />
  </StrictMode>,
);
