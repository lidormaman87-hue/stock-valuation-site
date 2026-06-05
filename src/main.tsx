import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AccessGate } from "./components/AccessGate.tsx";

createRoot(document.getElementById("root")!).render(
  <AccessGate>
    <App />
  </AccessGate>
);
