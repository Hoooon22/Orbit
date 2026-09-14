import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource-variable/jetbrains-mono";
import "../../shared/styles.css";
import CaptureOverlay from "./CaptureOverlay";

// StrictMode를 쓰지 않는다: 마운트 효과가 두 번 돌면 수 MB짜리 스냅샷을 두 번 받아 온다
createRoot(document.getElementById("root")!).render(<CaptureOverlay />);
