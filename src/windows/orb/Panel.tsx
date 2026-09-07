import { useRef, useState } from "react";
import { CALENDAR_VIEW, QUICK_MEMO, showWorkspace, TODO_VIEW } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";
import { todayStr } from "../../shared/dates";
import Editor from "../../modules/memo/Editor";
import TodoPanel from "../../modules/todo/TodoPanel";
import { useTodos } from "../../modules/todo/store";
import { useEvents } from "../../modules/calendar/store";
import Clock from "../../modules/calendar/Clock";
import Agenda from "../../modules/calendar/Agenda";
import MiniCalendar from "../../modules/calendar/MiniCalendar";
import { monthOf } from "../../modules/calendar/calendar";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";

type Props = {
  closing: boolean; // 접히는 중 (페이드아웃)
  onCollapse: () => void;
};

type Tab = "memo" | "todo" | "calendar" | "clipboard";

// compact 편집기에는 헤더가 없어 제목·즐겨찾기 props가 쓰이지 않는다
const noRename = async () => false;
const noop = () => {};

// 펼친 오브. 빠른 메모·할 일·일정을 바로 다루고, 더 넓게 보려면 워크스페이스를 연다.
export default function Panel({ closing, onCollapse }: Props) {
  const [tab, setTab] = useState<Tab>("memo");
  const [draft, setDraft] = useState("");
  const addTodo = useTodos((s) => s.add);
  const todos = useTodos((s) => s.todos);
  const events = useEvents((s) => s.events);
  const addInput = useRef<HTMLInputElement>(null);
  const preview = describeParsed(parseTodoInput(draft));
  const [month, setMonth] = useState(() => monthOf(todayStr()));

  const open = (target?: string) => showWorkspace(target).catch(reportError);

  const submitTodo = () => {
    if (!draft.trim()) return;
    addTodo(draft);
    setDraft("");
  };

  return (
    <div className={"orb-panel" + (closing ? " closing" : "")}>
      <header className="orb-head">
        <Clock size="panel" />
        <button
          className="orb-head-btn"
          title="워크스페이스 열기"
          aria-label="워크스페이스 열기"
          onClick={() => void open()}
        >
          ⧉
        </button>
        <button className="orb-head-btn" title="접기 (Esc)" aria-label="접기" onClick={onCollapse}>
          ×
        </button>
      </header>
      <nav className="orb-tabs">
        <button className={tab === "memo" ? "on" : ""} onClick={() => setTab("memo")}>
          ⚡ 메모
        </button>
        <button className={tab === "todo" ? "on" : ""} onClick={() => setTab("todo")}>
          ☑️ 할 일
        </button>
        <button className={tab === "calendar" ? "on" : ""} onClick={() => setTab("calendar")}>
          📅 일정
        </button>
        <button className={tab === "clipboard" ? "on" : ""} onClick={() => setTab("clipboard")}>
          📋 클립
        </button>
      </nav>
      <div className="orb-body">
        {tab === "memo" && (
          <Editor
            path={QUICK_MEMO}
            compact
            onRename={noRename}
            isFavorite={false}
            onToggleFavorite={noop}
          />
        )}
        {tab === "todo" && (
          <>
            <div className="orb-todo-add">
              <input
                ref={addInput}
                value={draft}
                placeholder="할 일 입력 후 Enter (예: 내일 3시 회의)"
                spellCheck={false}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTodo();
                  if (e.key === "Escape") {
                    // 입력 중 Esc는 패널을 접지 않고 입력만 비운다
                    e.stopPropagation();
                    setDraft("");
                  }
                }}
              />
              {preview && <div className="orb-todo-preview">→ {preview}</div>}
            </div>
            <TodoPanel
              compact
              active={false}
              onOpenView={() => void open(TODO_VIEW)}
              onQuickAdd={() => addInput.current?.focus()}
            />
          </>
        )}
        {tab === "clipboard" && <ClipboardPanel layout="compact" />}
        {tab === "calendar" && (
          <div className="orb-calendar">
            <Agenda onOpen={(date) => void open(`${CALENDAR_VIEW}@${date}`)} />
            <MiniCalendar
              month={month}
              onMonthChange={setMonth}
              selected={null}
              onSelect={(date) => void open(`${CALENDAR_VIEW}@${date}`)}
              events={events}
              todos={todos}
            />
          </div>
        )}
      </div>
    </div>
  );
}
