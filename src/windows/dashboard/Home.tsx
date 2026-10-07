import { useMemo, useRef, useState } from "react";
import { QUICK_MEMO } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { useSettings } from "../../shared/stores/settings";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";
import Editor from "../../modules/memo/Editor";
import { collectNotePaths, useMemoStore } from "../../modules/memo/store";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { monthOf } from "../../modules/calendar/calendar";
import Agenda from "../../modules/calendar/Agenda";
import MiniCalendar from "../../modules/calendar/MiniCalendar";
import TodoPanel from "../../modules/todo/TodoPanel";
import ClipboardPanel from "../../modules/clipboard/ClipboardPanel";

type Props = {
  onOpenCalendar: (date: string) => void;
  onOpenTodos: () => void;
  onOpenMemo: (path: string) => void;
};

function noteName(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

// 대시보드 홈: 한 화면에 오늘·이번 주 / 할 일 / 즐겨찾기·클립보드
export default function Home({ onOpenCalendar, onOpenTodos, onOpenMemo }: Props) {
  const todos = useTodos((s) => s.todos);
  const addTodo = useTodos((s) => s.add);
  const events = useAllEvents();
  const [month, setMonth] = useState(() => monthOf(todayStr()));
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<"now" | "later">("now");
  const preview = describeParsed(parseTodoInput(draft));
  const todoInput = useRef<HTMLInputElement>(null);
  const pending = pendingNow(todos);
  // 당장 할 일 아래의 빠른 메모 칸. 접힘/펼침은 설정에 남아 다음 실행에도 이어진다
  const quickOpen = useSettings((s) => s.settings.homeQuickMemoOpen);
  const updateSettings = useSettings((s) => s.update);

  // 즐겨찾기 중 실제로 있는 메모만 (메모 화면의 목록과 같은 순서)
  const tree = useMemoStore((s) => s.tree);
  const favorites = useMemoStore((s) => s.favorites);
  const visibleFavorites = useMemo(() => {
    const paths = new Set<string>();
    collectNotePaths(tree, paths);
    return favorites.filter((p) => paths.has(p));
  }, [tree, favorites]);

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
        <div className={"home-card home-quick" + (quickOpen ? " open" : "")}>
          <button
            className="home-quick-toggle"
            onClick={() => updateSettings({ homeQuickMemoOpen: !quickOpen })}
            title={quickOpen ? "빠른 메모 접기" : "빠른 메모 펼치기"}
          >
            <span className="todo-panel-fold">{quickOpen ? "▾" : "▴"}</span>
            빠른 메모
          </button>
          {quickOpen && (
            <Editor
              path={QUICK_MEMO}
              compact
              onRename={async () => false}
              isFavorite={false}
              onToggleFavorite={() => {}}
            />
          )}
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
    </div>
  );
}
