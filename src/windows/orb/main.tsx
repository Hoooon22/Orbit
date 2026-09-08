import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource-variable/jetbrains-mono";
import "../../shared/styles.css";
import OrbApp from "./OrbApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OrbApp />
  </StrictMode>,
);
