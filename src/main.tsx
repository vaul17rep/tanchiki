import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/russo-one/cyrillic-400.css";
import "@fontsource/russo-one/latin-400.css";
import "@fontsource/rubik/cyrillic-400.css";
import "@fontsource/rubik/cyrillic-600.css";
import "@fontsource/rubik/cyrillic-800.css";
import "@fontsource/rubik/latin-400.css";
import "@fontsource/rubik/latin-600.css";
import "@fontsource/rubik/latin-800.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
