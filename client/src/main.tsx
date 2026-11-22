import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";
import "./dark-theme.css";

// Service worker only in production builds (none in dev)
if (import.meta.env.PROD) registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
