import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setWindowOpacity, toggleDashboard } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useGoogle } from "../../modules/calendar/googleStore";
import Orb from "./Orb";

// 오브 창: 화면 구석의 구슬 하나. 클릭하면 Orbit 대시보드 창을 열고 닫는다.
export default function OrbApp() {
  const loaded = useSettings((s) => s.loaded);
  const opacity = useSettings((s) => s.settings.orbOpacity);

  useEffect(() => {
    void useSettings.getState().init();
    useTodos.getState().init(); // 배지의 남은 할 일 개수
    useEvents.getState().init(); // 오브의 오늘 일정 개수
    useGoogle.getState().init();
  }, []);

  // 투명도는 창(레이어드 윈도우)이 아니라 구슬 그림(CSS)에 건다.
  // 투명 창에 레이어드 알파를 씌우면 WebView2 뒤에 어두운 사각 배경이 생긴다.
  // 예전 버전이 남긴 레이어드 상태가 있을 수 있어 시작할 때 한 번 되돌린다.
  useEffect(() => {
    if (!loaded) return;
    setWindowOpacity(1).catch(() => {});
  }, [loaded]);

  // 끌어 옮기면 위치 저장 (이동이 멈추고 500ms 뒤)
  useEffect(() => {
    const win = getCurrentWindow();
    let moveTimer: number | undefined;
    const unMoved = win.onMoved(() => {
      if (moveTimer !== undefined) window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => {
        win
          .outerPosition()
          .then((p) => useSettings.getState().update({ orbX: p.x, orbY: p.y }))
          .catch(() => {});
      }, 500);
    });
    return () => {
      void unMoved.then((f) => f());
    };
  }, []);

  if (!loaded) return null;
  return <Orb opacity={opacity} onActivate={() => toggleDashboard().catch(reportError)} />;
}
