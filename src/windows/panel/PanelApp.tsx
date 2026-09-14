import { useEffect, useState } from "react";
import { captureStart, hidePanel, showDashboard } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useGoogle } from "../../modules/calendar/googleStore";
import { useClipboard } from "../../modules/clipboard/store";
import { useLauncher } from "../../modules/launcher/store";
import TodoPanel from "../../modules/todo/TodoPanel";
import Agenda from "../../modules/calendar/Agenda";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";
import Launcher from "../../modules/launcher/Launcher";
import type { CommandId } from "../../modules/launcher/commands";
import PetSettings from "../orb/pet/PetSettings";

type Tab = "todo" | "today" | "launcher" | "clipboard" | "pet";

// 펫을 클릭하면 옆에 뜨는 작은 패널 (WorkPet의 패널 자리). 탭마다 Orbit 창의 모듈을 그대로 쓰고,
// 더 보려면 머리의 "Orbit 열기"로 큰 창에 간다. 다른 곳을 클릭하면 Rust가 숨긴다.
export default function PanelApp() {
  const loaded = useSettings((s) => s.loaded);
  const pending = useTodos((s) => pendingNow(s.todos));
  const [tab, setTab] = useState<Tab>("todo");

  useEffect(() => {
    void useSettings.getState().init();
    useTodos.getState().init();
    useEvents.getState().init();
    useGoogle.getState().init();
    useClipboard.getState().init();
    useLauncher.getState().init();
  }, []);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hidePanel().catch(reportError);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openDashboard = (view?: string) => {
    hidePanel().catch(reportError);
    showDashboard(view).catch(reportError);
  };

  // 런처의 "/" 명령: 화면 이동은 Orbit 창에서, 캡처·동기화는 바로
  const runCommand = (id: CommandId) => {
    if (id === "hide") return void hidePanel().catch(reportError);
    if (id === "sync") return void useGoogle.getState().sync();
    if (id === "capture") return void captureStart("region").catch(reportError);
    if (id === "color") return void captureStart("color").catch(reportError);
    openDashboard(id);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "todo", label: pending > 0 ? `할 일 ${pending}` : "할 일" },
    { id: "today", label: "오늘" },
    { id: "launcher", label: "실행" },
    { id: "clipboard", label: "클립보드" },
    { id: "pet", label: "펫" },
  ];

  if (!loaded) return null;

  return (
    <div className="panel">
      <header className="panel-head">
        <span className="dash-logo">
          <span className="dash-logo-orb" />
          Orbit
        </span>
        <button className="panel-open" onClick={() => openDashboard()} title="Orbit 창 (Alt+Space)">
          Orbit 열기 ›
        </button>
        <button className="dash-head-btn" onClick={() => hidePanel().catch(reportError)} title="닫기 (Esc)" aria-label="닫기">
          ×
        </button>
      </header>
      <nav className="panel-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={"panel-tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === "todo" && <TodoPanel onOpenView={() => openDashboard("todo")} />}
        {tab === "today" && <Agenda onOpen={(date) => openDashboard(`calendar@${date}`)} />}
        {tab === "launcher" && <Launcher onLaunched={() => hidePanel().catch(reportError)} onCommand={runCommand} />}
        {tab === "clipboard" && <ClipboardPanel layout="compact" />}
        {tab === "pet" && (
          <div className="panel-pet">
            <PetSettings />
          </div>
        )}
      </div>
    </div>
  );
}
