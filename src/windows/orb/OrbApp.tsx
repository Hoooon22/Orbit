import { useEffect, useState } from "react";
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
  const [hover, setHover] = useState(false);
  const opacity = useSettings((s) => s.settings.orbOpacity);

  useEffect(() => {
    void useSettings.getState().init();
    useTodos.getState().init(); // 배지의 남은 할 일 개수
    useEvents.getState().init(); // 오브의 오늘 일정 개수
    useGoogle.getState().init();
  }, []);

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

  // 오브는 반투명. 마우스를 올리면 또렷하게.
  useEffect(() => {
    if (!loaded) return;
    setWindowOpacity(hover ? 1 : opacity).catch(() => {});
  }, [loaded, hover, opacity]);

  if (!loaded) return null;
  return <Orb onActivate={() => toggleDashboard().catch(reportError)} onHover={setHover} />;
}
