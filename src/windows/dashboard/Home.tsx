import { useEffect, useRef, useState } from "react";
import { todayStr } from "../../shared/dates";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { monthOf } from "../../modules/calendar/calendar";
import Agenda from "../../modules/calendar/Agenda";
import MiniCalendar from "../../modules/calendar/MiniCalendar";
import TodoPanel from "../../modules/todo/TodoPanel";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";
import Launcher from "../../modules/launcher/Launcher";
import type { CommandId } from "../../modules/launcher/commands";

type Props = {
  launcherFocus: number; // 값이 바뀌면 런처 입력창에 포커스 (Alt+Space)
  onOpenCalendar: (date: string) => void;
  onOpenTodos: () => void;
  onLaunched: () => void;
  onCommand: (id: CommandId) => void;
};

// 대시보드 홈: 한 화면에 오늘·이번 주 / 할 일 / 런처·클립보드
export default function Home({ launcherFocus, onOpenCalendar, onOpenTodos, onLaunched, onCommand }: Props) {
  const todos = useTodos((s) => s.todos);
  const addTodo = useTodos((s) => s.add);
  const events = useAllEvents();
  const [month, setMonth] = useState(() => monthOf(todayStr()));
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<"now" | "later">("now");
  const preview = describeParsed(parseTodoInput(draft));
  const todoInput = useRef<HTMLInputElement>(null);
  const pending = pendingNow(todos);

  useEffect(() => {
    if (launcherFocus === 0) return;
    document.querySelector<HTMLInputElement>(".launcher-search input")?.focus();
  }, [launcherFocus]);

  const submitTodo = () => {
    if (!draft.trim()) return;
    addTodo(draft, draftKind);
    setDraft("");
  };

  return (
    <div className="home">
      <section className="home-col">
        <h2 className="home-title">오늘 · 이번 주</h2>
        <div className="home-card home-agenda">
          <Agenda onOpen={onOpenCalendar} />
        </div>
        <div className="home-card">
          <MiniCalendar
            month={month}
            onMonthChange={setMonth}
            selected={null}
            onSelect={onOpenCalendar}
            events={events}
            todos={todos}
          />
        </div>
      </section>

      <section className="home-col">
        <h2 className="home-title">
          당장 할 일 {pending > 0 && <span className="home-count">{pending}</span>}
          <button className="home-link" onClick={onOpenTodos}>
            전체 보기 ›
          </button>
        </h2>
        <div className="home-card home-todo">
          <div className="orb-todo-add">
            <button
              className={"todo-kind-pick" + (draftKind === "later" ? " later" : "")}
              title="추가할 묶음 (클릭해서 바꾸기): 당장 할 일 / 기억해야 할 일"
              onClick={() => setDraftKind((k) => (k === "now" ? "later" : "now"))}
            >
              {draftKind === "now" ? "⚡" : "🗂"}
            </button>
            <input
              ref={todoInput}
              value={draft}
              placeholder={
                draftKind === "now" ? "당장 할 일 입력 후 Enter (예: 내일 3시 회의)" : "기억해야 할 일 입력 후 Enter"
              }
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTodo();
                if (e.key === "Escape" && draft) {
                  e.stopPropagation(); // 입력이 있으면 창을 닫지 않고 입력만 비운다
                  setDraft("");
                }
              }}
            />
            {preview && <div className="orb-todo-preview">→ {preview}</div>}
          </div>
          <TodoPanel onOpenView={onOpenTodos} />
        </div>
      </section>

      <section className="home-col">
        <h2 className="home-title">실행</h2>
        <div className="home-card home-launcher">
          <Launcher onLaunched={onLaunched} onCommand={onCommand} />
        </div>
        <h2 className="home-title">클립보드</h2>
        <div className="home-card home-clip">
          <ClipboardPanel layout="compact" />
        </div>
      </section>
    </div>
  );
}
