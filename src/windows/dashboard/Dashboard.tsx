import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettings } from "../../shared/stores/settings";
import { useError } from "../../shared/stores/error";
import { useMemoStore } from "../../modules/memo/store";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import { useGoogle } from "../../modules/calendar/googleStore";
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
import type { CommandId } from "../../modules/launcher/commands";

export type View = "home" | "memo" | "todo" | "calendar" | "clipboard" | "launcher" | "settings";

const NAV: [View, string][] = [
  ["home", "홈"],
  ["memo", "메모"],
  ["todo", "할 일"],
  ["calendar", "캘린더"],
  ["clipboard", "클립보드"],
  ["launcher", "런처"],
  ["settings", "설정"],
];

// 레일 아이콘: 16×16 단색 선 (색·굵기는 바깥 svg 속성). 이모지는 흑백 디자인과 어긋나 쓰지 않는다.
const ICON: Record<View, JSX.Element> = {
  home: (
    <>
      <path d="M2.5 8 8 3l5.5 5" />
      <path d="M4 7.5V13h8V7.5" />
    </>
  ),
  memo: (
    <>
      <rect x="3" y="2.5" width="10" height="11" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </>
  ),
  todo: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" />
      <path d="m5 8 2 2 4-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="2.5" y="3.5" width="11" height="10" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </>
  ),
  clipboard: (
    <>
      <rect x="3.5" y="3" width="9" height="11" />
      <path d="M6 3V2h4v1M5.5 7h5M5.5 9.5h5" />
    </>
  ),
  launcher: (
    <>
      <path d="m3 4 4 4-4 4" />
      <path d="M8.5 12H13" />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
      <circle cx="10" cy="4.5" r="1.5" fill="currentColor" />
      <circle cx="6" cy="8" r="1.5" fill="currentColor" />
      <circle cx="9" cy="11.5" r="1.5" fill="currentColor" />
    </>
  ),
};

const isView = (s: string): s is View => NAV.some(([v]) => v === s);

// Orbit 창. 왼쪽 레일로 화면을 고른다. 이 창 하나가 앱의 전부이고, 닫으면 오브와 트레이만 남는다.
export default function Dashboard() {
  const loaded = useSettings((s) => s.loaded);
  const pinned = useSettings((s) => s.settings.pinned);
  const [view, setView] = useState<View>("home");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [memoPath, setMemoPath] = useState<{ path: string; seq: number } | null>(null);
  const [launcherFocus, setLauncherFocus] = useState(0); // Alt+Space로 들어오면 런처 입력창에 포커스
  const [maximized, setMaximized] = useState(false);
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
    useGoogle.getState().init();
    useClipboard.getState().init();
    useLauncher.getState().init();
  }, []);

  const openMemo = (path: string) => {
    setMemoPath((m) => ({ path, seq: (m?.seq ?? 0) + 1 }));
    setView("memo");
  };

  // Rust(오브·트레이·단축키)가 보내는 "이 화면으로" 요청: "calendar@2026-09-08", "home@launcher", "memo@QuickMemo.md"
  useEffect(() => {
    const un = listen<string>("navigate", (e) => {
      const at = e.payload.indexOf("@");
      const v = at === -1 ? e.payload : e.payload.slice(0, at);
      const arg = at === -1 ? "" : e.payload.slice(at + 1);
      if (!isView(v)) return;
      if (v === "memo" && arg) {
        openMemo(arg);
        return;
      }
      setView(v);
      if (v === "calendar" && arg) setCalendarDate(arg);
      if (v === "home" && arg === "launcher") setLauncherFocus((n) => n + 1);
    }).catch(() => () => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void getCurrentWindow().hide();
    };
    window.addEventListener("keydown", onKey);
    // 최대화 여부에 따라 둥근 모서리·테두리를 뺀다 (최대화 창에 모서리가 남으면 어색하다)
    const win = getCurrentWindow();
    const syncMax = () => void win.isMaximized().then(setMaximized).catch(() => {});
    syncMax();
    const unResized = win.onResized(syncMax);
    return () => {
      void un.then((f) => f());
      void unResized.then((f) => f());
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // 항상 위에 고정
  useEffect(() => {
    if (!loaded) return;
    void getCurrentWindow().setAlwaysOnTop(pinned).catch(() => {});
  }, [loaded, pinned]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(clearError, 6000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  const hide = () => void getCurrentWindow().hide();
  const toggleMax = () => void getCurrentWindow().toggleMaximize();

  // 런처의 "/" 명령
  const runCommand = (id: CommandId) => {
    if (id === "hide") return hide();
    if (id === "sync") return void useGoogle.getState().sync();
    setView(id);
  };

  // 프레임이 없으므로 머리줄을 잡아 창을 옮기고, 더블클릭으로 최대화한다 (버튼 위에서는 제외)
  const onHead = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input")) return;
    if (e.detail === 2) toggleMax();
    else void getCurrentWindow().startDragging();
  };

  if (!loaded) return null;

  return (
    <div className={"dash" + (maximized ? " maximized" : "")}>
      <header className="dash-head" onMouseDown={onHead}>
        <span className="dash-logo">
          <span className="dash-logo-orb" />
          Orbit
        </span>
        <Clock size="panel" />
        <button
          className="dash-head-btn"
          onClick={() => void getCurrentWindow().minimize()}
          title="최소화"
          aria-label="최소화"
        >
          –
        </button>
        <button
          className="dash-head-btn"
          onClick={toggleMax}
          title={maximized ? "이전 크기로" : "최대화 (머리줄 더블클릭)"}
          aria-label={maximized ? "이전 크기로" : "최대화"}
        >
          {maximized ? "❐" : "▢"}
        </button>
        <button className="dash-head-btn" onClick={hide} title="닫기 (Esc) — 오브를 누르면 다시 열림" aria-label="닫기">
          ×
        </button>
      </header>
      <div className="dash-body">
        <nav className="dash-rail">
          {NAV.map(([v, label]) => (
            <button
              key={v}
              className={"dash-rail-btn" + (view === v ? " on" : "")}
              onClick={() => setView(v)}
              title={label}
            >
              <svg
                className="dash-rail-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
                strokeLinejoin="miter"
                aria-hidden="true"
              >
                {ICON[v]}
              </svg>
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
              onCommand={runCommand}
            />
          )}
          {view === "memo" && <MemoView requested={memoPath} />}
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
            <CalendarView
              initialDate={calendarDate}
              onOpenNote={openMemo}
              onOpenSettings={() => setView("settings")}
            />
          )}
          {view === "clipboard" && <ClipboardPanel layout="full" />}
          {view === "launcher" && <LauncherSettings />}
          {view === "settings" && <SettingsView onOpenLauncher={() => setView("launcher")} />}
        </main>
      </div>
    </div>
  );
}
