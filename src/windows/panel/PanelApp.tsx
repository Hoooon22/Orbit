import { useEffect, useState } from "react";
import { hidePanel, QUICK_MEMO, showDashboard } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";
import { pendingNow, useTodos } from "../../modules/todo/store";
import TodoPanel from "../../modules/todo/TodoPanel";
import Editor from "../../modules/memo/Editor";
import TerminalView from "../../modules/terminal/TerminalView";
import PetSettings from "../orb/pet/PetSettings";

type Tab = "memo" | "todo" | "later" | "ai" | "pet";

const TABS: { id: Tab; label: string }[] = [
  { id: "memo", label: "빠른 메모" },
  { id: "todo", label: "할 일" },
  { id: "later", label: "장기" },
  { id: "ai", label: "AI" },
  { id: "pet", label: "펫" },
];

// 할 일 탭 위의 입력줄. Orbit 창 홈과 같은 자연어 파서(날짜·시각)를 쓴다
function TodoAdd({ kind }: { kind: "now" | "later" }) {
  const add = useTodos((s) => s.add);
  const [draft, setDraft] = useState("");
  const preview = describeParsed(parseTodoInput(draft));
  const submit = () => {
    if (!draft.trim()) return;
    add(draft, kind);
    setDraft("");
  };
  return (
    <div className="orb-todo-add">
      <input
        value={draft}
        placeholder={kind === "now" ? "당장 할 일 입력 후 Enter (예: 내일 3시 회의)" : "기억해야 할 일 입력 후 Enter"}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape" && draft) {
            e.stopPropagation(); // 입력이 있으면 패널을 닫지 않고 입력만 비운다
            setDraft("");
          }
        }}
      />
      {preview && <div className="orb-todo-preview">→ {preview}</div>}
    </div>
  );
}

// 펫을 클릭하면 옆에 뜨는 작은 패널 (WorkPet의 패널 자리). 탭마다 Orbit 창의 모듈을 그대로 쓰고,
// 더 보려면 머리의 "Orbit 열기"로 큰 창에 간다. 다른 곳을 클릭하면 Rust가 숨긴다.
export default function PanelApp() {
  const loaded = useSettings((s) => s.loaded);
  const pending = useTodos((s) => pendingNow(s.todos));
  const [tab, setTab] = useState<Tab>("memo");

  useEffect(() => {
    void useSettings.getState().init();
    useTodos.getState().init();
  }, []);

  // Esc로 닫기 (입력창이 stopPropagation으로 막지 않았을 때만)
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
        {TABS.map((t) => (
          <button key={t.id} className={"panel-tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "todo" && pending > 0 && <span className="panel-tab-count">{pending}</span>}
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {tab === "memo" && (
          <Editor path={QUICK_MEMO} compact onRename={async () => false} isFavorite={false} onToggleFavorite={() => {}} />
        )}
        {tab === "todo" && (
          <>
            <TodoAdd kind="now" />
            <TodoPanel only="now" onOpenView={() => openDashboard("todo")} />
          </>
        )}
        {tab === "later" && (
          <>
            <TodoAdd kind="later" />
            <TodoPanel only="later" onOpenView={() => openDashboard("todo")} />
          </>
        )}
        {tab === "ai" && <TerminalView />}
        {tab === "pet" && (
          <div className="panel-pet">
            <PetSettings />
          </div>
        )}
      </div>
    </div>
  );
}
