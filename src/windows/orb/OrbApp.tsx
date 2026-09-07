import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { setOrbBounds, setWindowOpacity } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { useMemoStore } from "../../modules/memo/store";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useClipboard } from "../../modules/clipboard/store";
import { useLauncher } from "../../modules/launcher/store";
import Orb from "./Orb";
import Panel from "./Panel";
import type { PanelTab } from "./Panel";

const FADE_MS = 120;

// 오브 창의 상태 기계: 접힘(오브) ↔ 펼침(패널).
// 펼칠 때는 창을 먼저 키운 뒤 패널을 서서히 보이고, 접을 때는 패널을 먼저 지운 뒤 창을 줄여
// 리사이즈 순간 잘린 화면이 보이지 않게 한다. 포커스를 잃거나 Esc를 누르면 접힌다.
export default function OrbApp() {
  const loaded = useSettings((s) => s.loaded);
  const [expanded, setExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const [hover, setHover] = useState(false);
  const [requestedTab, setRequestedTab] = useState<{ tab: PanelTab; seq: number } | null>(null);
  const expandedRef = useRef(false);
  const opacity = useSettings((s) => s.settings.orbOpacity);

  useEffect(() => {
    void useSettings.getState().init();
    useMemoStore.getState().init();
    useTodos.getState().init();
    useEvents.getState().init();
    useClipboard.getState().init();
    useLauncher.getState().init();
  }, []);

  const expand = useCallback(async () => {
    if (expandedRef.current) return;
    expandedRef.current = true;
    try {
      await setOrbBounds(true);
    } catch (e) {
      reportError(e);
    }
    setExpanded(true);
    void getCurrentWindow().setFocus();
  }, []);

  const collapse = useCallback(() => {
    if (!expandedRef.current) return;
    expandedRef.current = false;
    setClosing(true);
    window.setTimeout(() => {
      setExpanded(false);
      setClosing(false);
      setRequestedTab(null);
      setOrbBounds(false).catch(reportError);
    }, FADE_MS);
  }, []);

  // 포커스를 잃으면 접기, Rust(Alt+F4 가드)가 접으라고 하면 접기, 접힌 채 옮기면 위치 저장,
  // 전역 단축키(Alt+Space)로 런처 탭 열기
  useEffect(() => {
    const win = getCurrentWindow();
    let moveTimer: number | undefined;
    const unFocus = win.onFocusChanged(({ payload }) => {
      if (!payload) collapse();
    });
    const unCollapse = listen("orb-collapse", collapse);
    const unLauncher = listen("open-launcher", () => {
      setRequestedTab((r) => ({ tab: "launcher", seq: (r?.seq ?? 0) + 1 }));
      void expand();
    });
    const unMoved = win.onMoved(() => {
      if (expandedRef.current) return; // 펼침·접힘 리사이즈로 생기는 이동은 저장하지 않는다
      if (moveTimer !== undefined) window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => {
        if (expandedRef.current) return;
        win
          .outerPosition()
          .then((p) => useSettings.getState().update({ orbX: p.x, orbY: p.y }))
          .catch(() => {});
      }, 500);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      void unFocus.then((f) => f());
      void unCollapse.then((f) => f());
      void unLauncher.then((f) => f());
      void unMoved.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, [collapse, expand]);

  // 접힌 오브만 반투명. 마우스를 올리거나 펼치면 또렷하게.
  useEffect(() => {
    if (!loaded) return;
    setWindowOpacity(expanded || hover ? 1 : opacity).catch(() => {});
  }, [loaded, expanded, hover, opacity]);

  if (!loaded) return null;
  return expanded ? (
    <Panel closing={closing} requestedTab={requestedTab} onCollapse={collapse} />
  ) : (
    <Orb onActivate={() => void expand()} onHover={setHover} />
  );
}
