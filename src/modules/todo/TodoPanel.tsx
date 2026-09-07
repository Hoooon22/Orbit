import { useState } from "react";
import { todayStr } from "../../shared/dates";
import { deadline, useTodos } from "./store";

type Props = {
  onOpenView: () => void; // 항목 이름을 누르면 전체 할 일 화면으로
};

// "2026-08-03" → "8/3"
function dateLabel(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const timeLabel = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 내일 09:00 (스누즈 "내일")
function tomorrowMorning(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0).getTime();
}

// 남은 할 일 목록 + 울린 알림 스트립. 체크하면 목록에서 사라지고,
// 완료 항목은 전체 할 일 화면에서 확인·되돌린다. 순서는 전체 화면에서 드래그로 정한 수동 순서.
export default function TodoPanel({ onOpenView }: Props) {
  const todos = useTodos((s) => s.todos);
  const fired = useTodos((s) => s.fired);
  const patch = useTodos((s) => s.patch);
  const reorder = useTodos((s) => s.reorder);
  const snooze = useTodos((s) => s.snooze);
  const dismissFired = useTodos((s) => s.dismissFired);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; before: boolean } | null>(null);

  const today = todayStr();
  const pending = todos.filter((t) => !t.done);

  return (
    <div className="todo-panel compact">
      {/* 울린 알림: Windows 토스트는 눌러도 앱에 신호가 오지 않으므로 스누즈·완료는 여기서 */}
      {fired.length > 0 && (
        <ul className="todo-alerts">
          {fired.map((f) => (
            <li key={f.id} className="todo-alert">
              <div className="todo-alert-text" title={f.text}>
                🔔 {f.text}
                <span className="todo-alert-time">
                  {f.missed ? "놓침 · " : ""}
                  {timeLabel(f.remindAt)}
                </span>
              </div>
              <div className="todo-alert-actions">
                <button onClick={() => snooze(f.id, Date.now() + 10 * 60_000)}>10분 후</button>
                <button onClick={() => snooze(f.id, Date.now() + 60 * 60_000)}>1시간 후</button>
                <button onClick={() => snooze(f.id, tomorrowMorning())}>내일 9시</button>
                <button
                  onClick={() => {
                    patch(f.id, { done: true });
                    dismissFired(f.id);
                  }}
                >
                  완료
                </button>
                <button onClick={() => dismissFired(f.id)} aria-label="알림 닫기">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ul className="todo-panel-list">
        {pending.map((t) => {
          const d = deadline(t);
          const urgency = !d ? "" : d < today ? " overdue" : d === today ? " today" : "";
          return (
            <li
              key={t.id}
              className={
                "todo-panel-item" +
                urgency +
                (dropAt?.id === t.id ? (dropAt.before ? " drop-before" : " drop-after") : "")
              }
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-todo", t.id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(t.id);
              }}
              onDragOver={(e) => {
                if (!dragId || dragId === t.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt({ id: t.id, before: e.clientY < r.top + r.height / 2 });
              }}
              onDragLeave={() => setDropAt((d) => (d?.id === t.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== t.id && dropAt?.id === t.id)
                  reorder(dragId, t.id, dropAt.before);
                setDragId(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropAt(null);
              }}
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => patch(t.id, { done: true })}
                aria-label={`완료 처리: ${t.text || "(내용 없음)"}`}
              />
              <button className="todo-panel-label" onClick={onOpenView} title={t.text}>
                {t.text || "(내용 없음)"}
              </button>
              {d && (
                <span
                  className="todo-panel-date"
                  title={t.remindAt !== undefined ? `알림 ${timeLabel(t.remindAt)}` : undefined}
                >
                  {dateLabel(d)}
                  {t.time ? ` ${t.time}` : ""}
                  {t.remindAt !== undefined ? " 🔔" : ""}
                </span>
              )}
            </li>
          );
        })}
        {pending.length === 0 && <li className="todo-panel-empty">남은 할 일 없음</li>}
      </ul>
    </div>
  );
}
