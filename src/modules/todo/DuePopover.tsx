import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Todo } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { addDays, monthOf } from "../calendar/calendar";
import { useAllEvents } from "../calendar/googleStore";
import MiniCalendar from "../calendar/MiniCalendar";
import { REMIND_OPTIONS, reminderOffset, useTodos } from "./store";

type Props = {
  todo: Todo;
  anchor: HTMLElement; // 날짜 칸. 이 아래(자리가 없으면 위)에 붙는다
  onClose: () => void;
};

const WIDTH = 268;

// Todoist·MS To Do식 날짜 창: 자주 쓰는 날짜 네 개 → 달력 → 시각·알림 → 종료일·지우기.
// 고르는 즉시 저장되므로 확인 버튼이 없다. 바깥을 누르거나 Esc로 닫는다.
export default function DuePopover({ todo, anchor, onClose }: Props) {
  const setDue = useTodos((s) => s.setDue);
  const setReminder = useTodos((s) => s.setReminder);
  const events = useAllEvents();
  const today = todayStr();
  const [month, setMonth] = useState(() => monthOf(todo.start ?? today));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // 자리 잡기: 날짜 칸 오른쪽에 맞춰 아래로, 화면을 넘치면 위로
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(8, r.right - WIDTH), window.innerWidth - WIDTH - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (ref.current?.contains(el) || anchor.contains(el)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // 창·패널을 닫는 Esc 처리보다 먼저 받아 이 창만 닫는다
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  const pick = (start: string) => {
    // 시작일이 종료일을 넘어가면 종료일은 지운다
    const end = todo.end && todo.end < start ? undefined : todo.end;
    setDue(todo.id, start, end, todo.time);
    setMonth(monthOf(start));
  };

  const dow = new Date().getDay();
  const presets: [string, string][] = [
    ["오늘", today],
    ["내일", addDays(today, 1)],
    ["이번 주말", addDays(today, (6 - dow + 7) % 7)], // 다가오는 토요일 (오늘이 토요일이면 오늘)
    ["다음 주", addDays(today, (1 - dow + 7) % 7 || 7)], // 다음 월요일
  ];
  const hasDue = !!todo.start;
  const offset = reminderOffset(todo);

  return createPortal(
    <div className="due-pop" ref={ref} style={pos}>
      <div className="due-pop-presets">
        {presets.map(([label, d]) => (
          <button key={label} className={todo.start === d ? "on" : ""} onClick={() => pick(d)}>
            {label}
          </button>
        ))}
      </div>
      <MiniCalendar
        month={month}
        onMonthChange={setMonth}
        selected={todo.start ?? null}
        onSelect={pick}
        events={events}
      />
      <div className="due-pop-row">
        <label>
          시각
          <input
            type="time"
            value={todo.time ?? ""}
            disabled={!hasDue}
            onChange={(e) => setDue(todo.id, todo.start, todo.end, e.target.value || undefined)}
          />
        </label>
        <label>
          알림
          <select
            value={offset === undefined ? "" : String(offset)}
            disabled={!hasDue}
            onChange={(e) => setReminder(todo.id, e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">없음</option>
            {REMIND_OPTIONS.map(([o, label]) => (
              <option key={o} value={o}>
                {label}
              </option>
            ))}
            <option value="custom" disabled>
              직접 지정
            </option>
          </select>
        </label>
      </div>
      <div className="due-pop-row">
        <label>
          종료일
          <input
            type="date"
            value={todo.end ?? ""}
            min={todo.start}
            disabled={!hasDue}
            onChange={(e) => setDue(todo.id, todo.start, e.target.value || undefined, todo.time)}
          />
        </label>
        <button className="due-pop-clear" disabled={!hasDue} onClick={() => setDue(todo.id)}>
          날짜 지우기
        </button>
      </div>
    </div>,
    document.body,
  );
}
