import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/styles.css";

// 오브 창의 진입점. 창 자체는 다음 단계에서 붙고, 지금은 번들 구성만 갖춰 둔다.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ padding: 12, fontSize: 13 }}>Orbit</div>
  </StrictMode>,
);
