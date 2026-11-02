import { useState } from "react";
import { isNow, sortDoneLast, useTodos } from "./store";
import TodoRows from "./TodoRows";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";

// 할 일 전체 화면. "당장 할 일"과 "기억해야 할 일(장기)" 두 묶음으로 나뉘고 완료 항목도 남아
// 되돌릴 수 있다. 행 자체(본문 고치기·날짜 창·묶음 이동·삭제)는 홈과 같다.
export default function TodoList() {
  const todos = useTodos((s) => s.todos);
  const onAdd = useTodos((s) => s.add);
  const onRemove = useTodos((s) => s.remove);
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<"now" | "later">("now");
  const [dragging, setDragging] = useState<string | null>(null);
  const [trashOver, setTrashOver] = useState(false);
  const preview = describeParsed(parseTodoInput(draft));

  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft, draftKind);
    setDraft("");
  };

  const nowItems = sortDoneLast(todos.filter(isNow));
  const laterItems = sortDoneLast(todos.filter((t) => !isNow(t)));

  return (
    <section className="todo-view">
      <header className="editor-header">
        <span className="todo-title">할 일</span>
      </header>
      <div className="todo-add">
        <button
          className={"todo-kind-pick" + (draftKind === "later" ? " later" : "")}
          title="추가할 묶음 (클릭해서 바꾸기)"
          onClick={() => setDraftKind((k) => (k === "now" ? "later" : "now"))}
        >
          {draftKind === "now" ? "⚡ 당장" : "🗂 기억"}
        </button>
        <input
          value={draft}
          placeholder={
            draftKind === "now"
              ? "당장 할 일 입력 후 Enter (예: 금요일 오후 2시 보고서)"
              : "기억해야 할 일 입력 후 Enter (예: 언젠가 읽을 책)"
          }
          spellCheck={false}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        {preview && <span className="quick-add-preview">→ {preview}</span>}
      </div>
      <div className="todo-sections">
        <h3 className="todo-section-title">
          ⚡ 당장 할 일 <span className="todo-section-count">{nowItems.filter((t) => !t.done).length}</span>
        </h3>
        <TodoRows items={nowItems} empty="당장 할 일이 없습니다" onDraggingChange={setDragging} />
        <h3 className="todo-section-title">
          🗂 기억해야 할 일 <span className="todo-section-count dim">{laterItems.filter((t) => !t.done).length}</span>
          <small>급하지 않지만 잊으면 안 되는 것. 배지에는 세지 않습니다.</small>
        </h3>
        <TodoRows
          items={laterItems}
          empty="기억해야 할 일이 없습니다"
          className="later"
          onDraggingChange={setDragging}
        />
      </div>
      {dragging && (
        <div
          className={"trash-target" + (trashOver ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setTrashOver(true);
          }}
          onDragLeave={() => setTrashOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("application/x-todo");
            if (id) onRemove(id);
            setDragging(null);
            setTrashOver(false);
          }}
        >
          🗑️
        </div>
      )}
    </section>
  );
}
