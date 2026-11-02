import { useMemo, useState } from "react";
import { QUICK_MEMO } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";
import Editor from "../../modules/memo/Editor";
import { collectNotePaths, useMemoStore } from "../../modules/memo/store";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { monthOf } from "../../modules/calendar/calendar";
import MiniCalendar from "../../modules/calendar/MiniCalendar";
import TodoPanel from "../../modules/todo/TodoPanel";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";
import TimerSection from "../../modules/timer/TimerSection";

type Props = {
  onOpenCalendar: (date: string) => void;
  onOpenTodos: () => void;
  onOpenMemo: (path: string) => void;
};

function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

// 대시보드 홈: 한 화면에 할 일·달력 / 빠른 메모 / 즐겨찾기·클립보드, 그 아래 작업 타이머
export default function Home({ onOpenCalendar, onOpenTodos, onOpenMemo }: Props) {
  const todos = useTodos((s) => s.todos);
  const addTodo = useTodos((s) => s.add);
  const events = useAllEvents();
  const [month, setMonth] = useState(() => monthOf(todayStr()));
  const [draft, setDraft] = useState("");
  const preview = describeParsed(parseTodoInput(draft));
  const pending = pendingNow(todos);

  // 즐겨찾기 중 실제로 있는 메모만 (메모 화면의 목록과 같은 순서)
  const tree = useMemoStore((s) => s.tree);
  const favorites = useMemoStore((s) => s.favorites);
  const visibleFavorites = useMemo(() => {
    const paths = new Set<string>();
    collectNotePaths(tree, paths);
    return favorites.filter((p) => paths.has(p));
  }, [tree, favorites]);

  // 홈의 입력은 늘 당장 할 일로 들어간다. 장기로 보내는 건 행의 🗂로.
  const submitTodo = () => {
    if (!draft.trim()) return;
    addTodo(draft);
    setDraft("");
  };

  return (
    <div className="home">
      <section className="home-col">
        <h2 className="home-title">
          당장 할 일 {pending > 0 && <span className="home-count">{pending}</span>}
          <button className="home-link" onClick={onOpenTodos}>
            전체 보기 ›
          </button>
        </h2>
        <div className="home-card home-todo">
          <div className="orb-todo-add">
            <input
              value={draft}
              placeholder="할 일 입력 후 Enter (예: 내일 3시 회의)"
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
          <TodoPanel />
        </div>
        <div className="home-card home-cal">
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
        <h2 className="home-title">빠른 메모</h2>
        <div className="home-card home-quick">
          <Editor
            path={QUICK_MEMO}
            compact
            onRename={async () => false}
            isFavorite={false}
            onToggleFavorite={() => {}}
          />
        </div>
      </section>

      <section className="home-col">
        <h2 className="home-title">즐겨찾기</h2>
        <div className="home-card home-fav">
          {visibleFavorites.length === 0 ? (
            <div className="clip-empty">메모 화면에서 ⭐를 누르면 여기에 모입니다</div>
          ) : (
            <ul className="fav-list">
              {visibleFavorites.map((path) => (
                <li key={path} className="fav-item">
                  <button className="fav-row" onClick={() => onOpenMemo(path)} title={path}>
                    <span className="pinned-icon">⭐</span>
                    <span className="fav-label">{noteName(path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <h2 className="home-title">클립보드</h2>
        <div className="home-card home-clip">
          <ClipboardPanel layout="compact" />
        </div>
      </section>

      <section className="home-timer">
        <h2 className="home-title">작업 타이머</h2>
        <TimerSection />
      </section>
    </div>
  );
}
