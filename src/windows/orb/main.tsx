import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/styles.css";
import OrbApp from "./OrbApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrbApp />
  </StrictMode>,
);
