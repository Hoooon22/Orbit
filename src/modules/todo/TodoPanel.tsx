import { useState } from "react";
import { isNow, useTodos } from "./store";
import TodoRows from "./TodoRows";

type Props = {
  only?: "now" | "later"; // 펫 패널: 당장 할 일 탭 / 기억해야 할 일 탭에 한 묶음만. 없으면 둘 다(장기는 접힘)
};

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
// 완료 항목은 전체 할 일 화면에서 확인·되돌린다. 순서는 드래그로 정한 수동 순서.
export default function TodoPanel({ only }: Props) {
  const todos = useTodos((s) => s.todos);
  const fired = useTodos((s) => s.fired);
  const patch = useTodos((s) => s.patch);
  const snooze = useTodos((s) => s.snooze);
  const dismissFired = useTodos((s) => s.dismissFired);
  const [laterOpen, setLaterOpen] = useState(false);

  const pending = todos.filter((t) => !t.done && isNow(t));
  const later = todos.filter((t) => !t.done && !isNow(t));

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
      {only === "later" ? (
        <TodoRows items={later} empty="기억해야 할 일 없음" className="later" />
      ) : (
        <TodoRows items={pending} empty="당장 할 일 없음" />
      )}
      {only === undefined && later.length > 0 && (
        <>
          <button className="todo-later-head" onClick={() => setLaterOpen((v) => !v)}>
            {laterOpen ? "▾" : "▸"} 🗂 기억해야 할 일 {later.length}
          </button>
          {laterOpen && <TodoRows items={later} className="later" />}
        </>
      )}
    </div>
  );
}
