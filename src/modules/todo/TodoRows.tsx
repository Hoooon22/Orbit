import { useRef, useState } from "react";
import type { Todo } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { diffDays, weekdayKo } from "../calendar/calendar";
import DuePopover from "./DuePopover";
import { deadline, isNow, useTodos } from "./store";

type Props = {
  items: Todo[];
  empty?: string; // 비었을 때 한 줄. 없으면 아무것도 안 그린다
  className?: string;
  onDraggingChange?: (id: string | null) => void; // 전체 화면이 휴지통을 띄우는 데 쓴다
};

// "2026-11-03" → "11/3"
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 가까운 날은 말로(오늘·내일·요일), 그 밖은 11/3
function dayLabel(d: string, today: string): string {
  const n = diffDays(today, d);
  if (n === 0) return "오늘";
  if (n === 1) return "내일";
  if (n > 1 && n < 7) return weekdayKo(d) + "요일";
  return md(d);
}

// 날짜 칸 글자: "내일 15:00", "11/3~11/5". 날짜가 없으면 빈 문자열.
function dueText(t: Todo, today: string): string {
  const d = deadline(t);
  if (!d) return "";
  let s = t.start && t.end && t.end !== t.start ? `${md(t.start)}~${md(t.end)}` : dayLabel(d, today);
  if (t.time) s += ` ${t.time}`;
  return s;
}

// 본문을 그 자리에서 고친다. Enter·포커스 아웃으로 확정, Esc로 되돌림. 저장은 확정할 때 한 번만.
function TodoText({ text, onCommit }: { text: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null이면 편집 중 아님
  const cancel = useRef(false);
  return (
    <input
      className="todo-row-text"
      value={draft ?? text}
      spellCheck={false}
      onFocus={() => setDraft(text)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft?.trim();
        if (!cancel.current && v && v !== text) onCommit(v);
        cancel.current = false;
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// 할 일 목록 한 묶음 (홈·펫 패널·전체 화면 공통). 행은 체크 · 본문 · 날짜 칸이고,
// 마우스를 올리면 끌기 손잡이와 묶음 이동·삭제가 나타난다. 날짜 칸을 누르면 날짜 창이 뜬다.
export default function TodoRows({ items, empty, className, onDraggingChange }: Props) {
  const patch = useTodos((s) => s.patch);
  const remove = useTodos((s) => s.remove);
  const reorder = useTodos((s) => s.reorder);
  const [dragId, setDragIdState] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);
  const [due, setDueFor] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const today = todayStr();

  const setDragId = (id: string | null) => {
    setDragIdState(id);
    onDraggingChange?.(id);
  };
  const dueTodo = due && items.find((t) => t.id === due.id);

  return (
    <ul className={"todo-rows" + (className ? " " + className : "")}>
      {items.map((t) => {
        const d = deadline(t);
        const urgency = t.done || !d ? "" : d < today ? " overdue" : d === today ? " today" : "";
        const label = dueText(t, today);
        return (
          <li
            key={t.id}
            className={
              "todo-row" +
              (t.done ? " done" : "") +
              urgency +
              (dropAt?.id === t.id ? (dropAt.before ? " drop-before" : " drop-after") : "")
            }
            onDragOver={(e) => {
              if (!dragId || dragId === t.id) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt({ id: t.id, before: e.clientY < r.top + r.height / 2 });
            }}
            onDragLeave={() => setDropAt((x) => (x?.id === t.id ? null : x))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== t.id && dropAt?.id === t.id) reorder(dragId, t.id, dropAt.before);
              setDragId(null);
              setDropAt(null);
            }}
          >
            <span
              className="todo-row-handle"
              title="끌어서 순서 바꾸기"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-todo", t.id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(t.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropAt(null);
              }}
            >
              ⠿
            </span>
            <input
              type="checkbox"
              checked={t.done}
              onChange={(e) => patch(t.id, { done: e.target.checked })}
              aria-label={`완료: ${t.text || "(내용 없음)"}`}
            />
            <TodoText text={t.text} onCommit={(v) => patch(t.id, { text: v })} />
            <button
              className={"todo-row-due" + (label ? "" : " empty") + (due?.id === t.id ? " open" : "")}
              title={label ? "날짜·시각·알림 바꾸기" : "날짜 정하기"}
              onClick={(e) =>
                setDueFor(due?.id === t.id ? null : { id: t.id, anchor: e.currentTarget })
              }
            >
              {label || "📅"}
              {t.remindAt !== undefined && <span className="todo-row-bell">🔔</span>}
            </button>
            <button
              className="todo-row-act"
              title={isNow(t) ? "기억해야 할 일로 옮기기" : "당장 할 일로 옮기기"}
              onClick={() => patch(t.id, { kind: isNow(t) ? "later" : undefined })}
            >
              {isNow(t) ? "🗂" : "⚡"}
            </button>
            <button
              className="todo-row-act del"
              title="삭제"
              aria-label={`할 일 삭제: ${t.text || "(내용 없음)"}`}
              onClick={() => remove(t.id)}
            >
              ✕
            </button>
          </li>
        );
      })}
      {items.length === 0 && empty && <li className="todo-rows-empty">{empty}</li>}
      {dueTodo && due && <DuePopover todo={dueTodo} anchor={due.anchor} onClose={() => setDueFor(null)} />}
    </ul>
  );
}
