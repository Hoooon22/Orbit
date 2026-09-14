import { useEffect } from "react";
import { setWindowOpacity, togglePanel } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useGoogle } from "../../modules/calendar/googleStore";
import { useBubble } from "./bubbleStore";
import { useOrbStatus } from "./status";
import { startPetLoops } from "./petLoop";
import Pet from "./Pet";

// 오브 창: 화면 바닥을 걸어 다니는 펫 한 마리. 클릭하면 옆에 패널 창을 열고 닫는다.
export default function OrbApp() {
  const loaded = useSettings((s) => s.loaded);
  const opacity = useSettings((s) => s.settings.orbOpacity);

  useEffect(() => {
    void useSettings.getState().init();
    useTodos.getState().init(); // 배지의 남은 할 일 개수
    useEvents.getState().init(); // 오브의 오늘 일정 개수
    useGoogle.getState().init();
    useBubble.getState().init(); // 알림 말풍선
    useOrbStatus.getState().init(); // 자리 비움·회의 표시
  }, []);

  // 투명도는 창(레이어드 윈도우)이 아니라 펫 그림(CSS)에 건다.
  // 투명 창에 레이어드 알파를 씌우면 WebView2 뒤에 어두운 사각 배경이 생긴다.
  // 예전 버전이 남긴 레이어드 상태가 있을 수 있어 시작할 때 한 번 되돌린다.
  useEffect(() => {
    if (!loaded) return;
    setWindowOpacity(1).catch(() => {});
  }, [loaded]);

  // 배회·던지기 등 이동 루프. 설정(돌아다니기 빈도·크기)이 읽힌 뒤에 시작한다.
  // 위치 저장은 루프가 드래그를 끝낼 때만 한다 — onMoved는 배회 걸음에도 오기 때문
  useEffect(() => {
    if (!loaded) return;
    return startPetLoops();
  }, [loaded]);

  if (!loaded) return null;
  return <Pet opacity={opacity} onActivate={() => togglePanel().catch(reportError)} />;
}
