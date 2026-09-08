import { useState } from "react";
import { deadline, dueMs, isNow, sortDoneLast } from "./store";
import type { Todo } from "../../shared/api";
import { describeParsed, parseTodoInput } from "../../shared/todoParse";

type Props = {
  todos: Todo[];
  onAdd: (text: string, kind?: "now" | "later") => void;
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

// 할 일 전체 화면. "당장 할 일"과 "기억해야 할 일(장기)" 두 묶음으로 나뉘고,
// 항목마다 시각·알림을 정하고 묶음 사이를 옮긴다. 일상적인 추가·체크는 홈에서 한다.
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
  const [draftKind, setDraftKind] = useState<"now" | "later">("now");
  const [dragging, setDragging] = useState<string | null>(null);
  const [trashOver, setTrashOver] = useState(false);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);
  const preview = describeParsed(parseTodoInput(draft));

  const remove = (id: string) => {
    setDragging(null);
    setTrashOver(false);
    onRemove(id);
  };

  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft, draftKind);
    setDraft("");
  };

  const nowItems = sortDoneLast(todos.filter(isNow));
  const laterItems = sortDoneLast(todos.filter((t) => !isNow(t)));

  const renderItem = (t: Todo) => {
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
          onChange={(e) => onSetReminder(t.id, e.target.value === "" ? null : Number(e.target.value))}
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
          className="todo-kind"
          title={isNow(t) ? "기억해야 할 일(장기)로 옮기기" : "당장 할 일로 옮기기"}
          onClick={() => onPatch(t.id, { kind: isNow(t) ? "later" : undefined })}
        >
          {isNow(t) ? "장기로 →" : "← 당장으로"}
        </button>
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
  };

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
        <ul className="todo-list">
          {nowItems.map(renderItem)}
          {nowItems.length === 0 && <li className="todo-empty">당장 할 일이 없습니다</li>}
        </ul>
        <h3 className="todo-section-title">
          🗂 기억해야 할 일 <span className="todo-section-count dim">{laterItems.filter((t) => !t.done).length}</span>
          <small>급하지 않지만 잊으면 안 되는 것. 배지에는 세지 않습니다.</small>
        </h3>
        <ul className="todo-list">
          {laterItems.map(renderItem)}
          {laterItems.length === 0 && <li className="todo-empty">기억해야 할 일이 없습니다</li>}
        </ul>
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
