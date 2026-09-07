import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { showWorkspace } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { useError } from "../../shared/stores/error";
import { reportError } from "../../shared/stores/error";
import { useMemoStore } from "../../modules/memo/store";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useClipboard } from "../../modules/clipboard/store";
import { useLauncher } from "../../modules/launcher/store";
import Clock from "../../modules/calendar/Clock";
import CalendarView from "../../modules/calendar/CalendarView";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";
import LauncherSettings from "../../modules/launcher/LauncherSettings";
import TodoList from "../../modules/todo/TodoList";
import SettingsView from "./SettingsView";
import MemoView from "./MemoView";
import Home from "./Home";

export type View = "home" | "memo" | "todo" | "calendar" | "clipboard" | "launcher" | "settings";

const NAV: [View, string, string][] = [
  ["home", "🏠", "홈"],
  ["memo", "📝", "메모"],
  ["todo", "☑️", "할 일"],
  ["calendar", "📅", "캘린더"],
  ["clipboard", "📋", "클립보드"],
  ["launcher", "🚀", "런처"],
  ["settings", "⚙️", "설정"],
];

const isView = (s: string): s is View => NAV.some(([v]) => v === s);

// Orbit 대시보드 창. 왼쪽 레일로 화면을 고르고, 메모는 "메모 열기"로 예전 UI 창을 띄운다.
export default function Dashboard() {
  const loaded = useSettings((s) => s.loaded);
  const [view, setView] = useState<View>("home");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [launcherFocus, setLauncherFocus] = useState(0); // Alt+Space로 들어오면 런처 입력창에 포커스
  const error = useError((s) => s.error);
  const clearError = useError((s) => s.clear);

  const todos = useTodos((s) => s.todos);
  const addTodo = useTodos((s) => s.add);
  const patchTodo = useTodos((s) => s.patch);
  const removeTodo = useTodos((s) => s.remove);
  const reorderTodo = useTodos((s) => s.reorder);
  const setTodoDue = useTodos((s) => s.setDue);
  const setTodoReminder = useTodos((s) => s.setReminder);

  useEffect(() => {
    void useSettings.getState().init();
    useMemoStore.getState().init();
    useTodos.getState().init();
    useEvents.getState().init();
    useClipboard.getState().init();
    useLauncher.getState().init();
  }, []);

  // Rust(오브·트레이·단축키)가 보내는 "이 화면으로" 요청: "calendar@2026-09-08", "home@launcher"
  useEffect(() => {
    const un = listen<string>("navigate", (e) => {
      const [v, arg] = e.payload.split("@");
      if (!isView(v)) return;
      setView(v);
      if (v === "calendar" && arg) setCalendarDate(arg);
      if (v === "home" && arg === "launcher") setLauncherFocus((n) => n + 1);
    }).catch(() => () => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      void un.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(clearError, 6000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  const hide = () => void getCurrentWindow().hide();
  const openMemo = (target?: string) => showWorkspace(target).catch(reportError);

  // 프레임이 없으므로 머리줄을 잡아 창을 옮긴다 (버튼 위에서는 제외)
  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    void getCurrentWindow().startDragging();
  };

  if (!loaded) return null;

  return (
    <div className="dash">
      <header className="dash-head" onMouseDown={startDrag}>
        <span className="dash-logo">
          <span className="dash-logo-orb" />
          Orbit
        </span>
        <Clock size="panel" />
        <button
          className="dash-memo-btn"
          onClick={() => void openMemo()}
          title="탭·분할·검색이 있는 원래 메모 창 열기"
        >
          ⧉ 메모 창
        </button>
        <button className="dash-head-btn" onClick={hide} title="닫기 (Esc) — 오브를 누르면 다시 열림" aria-label="닫기">
          ×
        </button>
      </header>
      <div className="dash-body">
        <nav className="dash-rail">
          {NAV.map(([v, icon, label]) => (
            <button
              key={v}
              className={"dash-rail-btn" + (view === v ? " on" : "")}
              onClick={() => setView(v)}
              title={label}
            >
              <span className="dash-rail-icon">{icon}</span>
              <span className="dash-rail-label">{label}</span>
            </button>
          ))}
        </nav>
        <main className="dash-main">
          {error && (
            <div className="error" onClick={clearError}>
              {error}
            </div>
          )}
          {view === "home" && (
            <Home
              launcherFocus={launcherFocus}
              onOpenCalendar={(date) => {
                setCalendarDate(date);
                setView("calendar");
              }}
              onOpenTodos={() => setView("todo")}
              onLaunched={hide}
            />
          )}
          {view === "memo" && <MemoView />}
          {view === "todo" && (
            <TodoList
              todos={todos}
              onAdd={addTodo}
              onPatch={patchTodo}
              onRemove={removeTodo}
              onReorder={reorderTodo}
              onSetDue={setTodoDue}
              onSetReminder={setTodoReminder}
            />
          )}
          {view === "calendar" && (
            <CalendarView initialDate={calendarDate} onOpenNote={(path) => void openMemo(path)} />
          )}
          {view === "clipboard" && <ClipboardPanel layout="full" />}
          {view === "launcher" && <LauncherSettings />}
          {view === "settings" && <SettingsView onOpenLauncher={() => setView("launcher")} />}
        </main>
      </div>
    </div>
  );
}
