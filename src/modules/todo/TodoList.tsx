import { useState } from "react";
import { deadline, dueMs, sortDoneLast } from "./store";
import type { Todo } from "../../shared/api";

type Props = {
  todos: Todo[];
  onAdd: (text: string) => void;
  onPatch: (id: string, p: Partial<Todo>) => void;
  onRemove: (id: string) => void;
  onReorder: (dragged: string, target: string, before: boolean) => void;
  onSetDue: (id: string, start?: string, end?: string, time?: string) => void;
  onSetReminder: (id: string, offsetMin: number | null) => void;
};

// 알림 선택지: 마감 몇 분 전
const REMIND_OPTIONS: [number, string][] = [
  [0, "정각"],
  [10, "10분 전"],
  [60, "1시간 전"],
  [1440, "하루 전"],
];

// 현재 알림이 선택지 중 무엇인지. 스누즈 등으로 임의 시각이면 "custom".
function reminderValue(t: Todo): string {
  if (t.remindAt === undefined) return "";
  const due = dueMs(t);
  if (due === undefined) return "";
  const offset = Math.round((due - t.remindAt) / 60_000);
  return REMIND_OPTIONS.some(([o]) => o === offset) ? String(offset) : "custom";
}

// 날짜 편집·완료 항목 확인용 전체 화면. 일상적인 추가·체크는 사이드바
// 패널과 Ctrl+T 창에서 하고, 여기는 관리 화면 역할이다.
export default function TodoList({
  todos,
  onAdd,
  onPatch,
  onRemove,
  onReorder,
  onSetDue,
  onSetReminder,
}: Props) {
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [trashOver, setTrashOver] = useState(false);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);

  const remove = (id: string) => {
    setDragging(null);
    setTrashOver(false);
    onRemove(id);
  };

  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };

  const sorted = sortDoneLast(todos);

  return (
    <section className="todo-view">
      <header className="editor-header">
        <span className="todo-title">☑ Todo</span>
      </header>
      <div className="todo-add">
        <input
          value={draft}
          placeholder="할 일 입력 후 Enter (예: 금요일 오후 2시 보고서)"
          spellCheck={false}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
      </div>
      <ul className="todo-list">
        {sorted.map((t) => {
          const hasDue = !!deadline(t);
          return (
            <li
              key={t.id}
              className={
                "todo-item" +
                (t.done ? " done" : "") +
                (dropAt?.id === t.id ? (dropAt.before ? " drop-before" : " drop-after") : "")
              }
              onDragOver={(e) => {
                if (!dragging || dragging === t.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt({ id: t.id, before: e.clientY < r.top + r.height / 2 });
              }}
              onDragLeave={() => setDropAt((d) => (d?.id === t.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== t.id && dropAt?.id === t.id)
                  onReorder(dragging, t.id, dropAt.before);
                setDragging(null);
                setDropAt(null);
              }}
            >
              <span
                className="todo-handle"
                title="드래그해서 순서 변경, 휴지통에 놓으면 삭제"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", "todo:" + t.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragging(t.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropAt(null);
                }}
              >
                ⠿
              </span>
              <input
                type="checkbox"
                checked={t.done}
                onChange={(e) => onPatch(t.id, { done: e.target.checked })}
              />
              <input
                className="todo-text"
                value={t.text}
                spellCheck={false}
                onChange={(e) => onPatch(t.id, { text: e.target.value })}
              />
              <input
                className="todo-date"
                type="date"
                value={t.start ?? ""}
                title="시작일"
                onChange={(e) => onSetDue(t.id, e.target.value || undefined, t.end, t.time)}
              />
              <span className="todo-tilde">~</span>
              <input
                className="todo-date"
                type="date"
                value={t.end ?? ""}
                min={t.start}
                title="종료일 (선택)"
                onChange={(e) => onSetDue(t.id, t.start, e.target.value || undefined, t.time)}
              />
              <input
                className="todo-time"
                type="time"
                value={t.time ?? ""}
                disabled={!hasDue}
                title={hasDue ? "마감 시각" : "먼저 날짜를 정하세요"}
                onChange={(e) => onSetDue(t.id, t.start, t.end, e.target.value || undefined)}
              />
              <select
                className="todo-remind"
                value={reminderValue(t)}
                disabled={!hasDue}
                title={hasDue ? "알림 — 마감 몇 분 전에 알릴지" : "먼저 날짜를 정하세요"}
                onChange={(e) =>
                  onSetReminder(t.id, e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">🔕 알림 없음</option>
                {REMIND_OPTIONS.map(([o, label]) => (
                  <option key={o} value={o}>
                    🔔 {label}
                  </option>
                ))}
                <option value="custom" disabled>
                  🔔 직접 지정
                </option>
              </select>
              <button
                className="todo-del"
                title="삭제"
                aria-label={`할 일 삭제: ${t.text || "(제목 없음)"}`}
                onClick={() => remove(t.id)}
              >
                ✕
              </button>
            </li>
          );
        })}
        {todos.length === 0 && <li className="todo-empty">할 일이 없습니다</li>}
      </ul>
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
            const d = e.dataTransfer.getData("text/plain");
            if (d.startsWith("todo:")) remove(d.slice(5));
          }}
        >
          🗑️
        </div>
      )}
    </section>
  );
}
