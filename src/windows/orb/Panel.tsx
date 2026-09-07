import { useRef, useState } from "react";
import { QUICK_MEMO, showWorkspace, TODO_VIEW } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import Editor from "../../modules/memo/Editor";
import TodoPanel from "../../modules/todo/TodoPanel";
import { useTodos } from "../../modules/todo/store";
import Clock from "../../modules/calendar/Clock";

type Props = {
  closing: boolean; // 접히는 중 (페이드아웃)
  onCollapse: () => void;
};

type Tab = "memo" | "todo";

// compact 편집기에는 헤더가 없어 제목·즐겨찾기 props가 쓰이지 않는다
const noRename = async () => false;
const noop = () => {};

// 펼친 오브. 빠른 메모와 할 일을 바로 다루고, 더 넓게 보려면 워크스페이스를 연다.
export default function Panel({ closing, onCollapse }: Props) {
  const [tab, setTab] = useState<Tab>("memo");
  const [draft, setDraft] = useState("");
  const addTodo = useTodos((s) => s.add);
  const addInput = useRef<HTMLInputElement>(null);

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
          ⚡ 빠른 메모
        </button>
        <button className={tab === "todo" ? "on" : ""} onClick={() => setTab("todo")}>
          ☑️ 할 일
        </button>
      </nav>
      <div className="orb-body">
        {tab === "memo" ? (
          <Editor
            path={QUICK_MEMO}
            compact
            onRename={noRename}
            isFavorite={false}
            onToggleFavorite={noop}
          />
        ) : (
          <>
            <div className="orb-todo-add">
              <input
                ref={addInput}
                value={draft}
                placeholder="할 일 입력 후 Enter"
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
            </div>
            <TodoPanel
              compact
              active={false}
              onOpenView={() => void open(TODO_VIEW)}
              onQuickAdd={() => addInput.current?.focus()}
            />
          </>
        )}
      </div>
    </div>
  );
}
