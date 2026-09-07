import { useMemo } from "react";
import type { CalEvent, Todo } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { deadline } from "../todo/store";
import { eventsOn, monthGrid, monthOf, WEEKDAY_KO } from "./calendar";
import type { Month } from "./calendar";

type Props = {
  month: Month;
  onMonthChange: (m: Month) => void;
  selected: string;
  onSelect: (date: string) => void;
  events: CalEvent[];
  todos: Todo[];
  onEventClick: (ev: CalEvent) => void;
};

const MAX_ROWS = 4; // 칸 하나에 보여 줄 줄 수. 넘치면 "+n"

// 날짜 칸마다 그날 일정 제목이 목록으로 보이는 월간 달력 (구글 캘린더 월 보기 느낌)
export default function MonthGrid({
  month,
  onMonthChange,
  selected,
  onSelect,
  events,
  todos,
  onEventClick,
}: Props) {
  const today = todayStr();
  const grid = useMemo(() => monthGrid(month.year, month.month0), [month]);
  const prefix = `${month.year}-${String(month.month0 + 1).padStart(2, "0")}`;

  // 날짜별 할 일 마감 (완료 제외)
  const todosByDay = useMemo(() => {
    const m = new Map<string, Todo[]>();
    for (const t of todos) {
      const d = deadline(t);
      if (!d || t.done) continue;
      m.set(d, [...(m.get(d) ?? []), t]);
    }
    return m;
  }, [todos]);

  const shift = (n: number) => {
    const d = new Date(month.year, month.month0 + n, 1);
    onMonthChange({ year: d.getFullYear(), month0: d.getMonth() });
  };

  return (
    <div className="month-grid">
      <div className="mini-cal-head">
        <button onClick={() => shift(-1)} aria-label="이전 달">
          ‹
        </button>
        <span className="mini-cal-title">
          {month.year}년 {month.month0 + 1}월
        </span>
        <button onClick={() => shift(1)} aria-label="다음 달">
          ›
        </button>
        <button
          className="mini-cal-today"
          onClick={() => {
            onMonthChange(monthOf(today));
            onSelect(today);
          }}
        >
          오늘
        </button>
      </div>
      <div className="mg-weekdays">
        {[...WEEKDAY_KO].map((w, i) => (
          <div key={w} className={"mini-cal-wd" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
            {w}
          </div>
        ))}
      </div>
      <div className="mg-cells">
        {grid.flat().map((date, i) => {
          const inMonth = date.startsWith(prefix);
          const col = i % 7;
          // 종일이 먼저, 그다음 시각순
          const evs = eventsOn(events, date).sort(
            (a, b) => (a.time ?? "").localeCompare(b.time ?? ""),
          );
          const dayTodos = todosByDay.get(date) ?? [];
          const total = evs.length + dayTodos.length;
          const shown = evs.slice(0, MAX_ROWS);
          const todoRoom = Math.max(0, MAX_ROWS - shown.length);
          const shownTodos = dayTodos.slice(0, todoRoom);
          const more = total - shown.length - shownTodos.length;
          return (
            <div
              key={date}
              className={
                "mg-cell" +
                (inMonth ? "" : " out") +
                (date === today ? " today" : "") +
                (date === selected ? " selected" : "") +
                (col === 0 ? " sun" : col === 6 ? " sat" : "")
              }
              onClick={() => {
                if (!inMonth) onMonthChange(monthOf(date));
                onSelect(date);
              }}
            >
              <div className="mg-day">
                <span>{Number(date.slice(8, 10))}</span>
              </div>
              <div className="mg-list">
                {shown.map((ev) => (
                  <button
                    key={ev.id}
                    className={"mg-ev" + (ev.time ? "" : " allday")}
                    style={{ ["--c" as string]: ev.color ?? "var(--accent)" }}
                    title={`${ev.title}${ev.google ? ` · ${ev.google.calendar}` : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(date);
                      onEventClick(ev);
                    }}
                  >
                    {ev.time && <span className="mg-time">{ev.time}</span>}
                    {ev.title}
                  </button>
                ))}
                {shownTodos.map((t) => (
                  <div key={t.id} className="mg-ev todo" title={t.text}>
                    ☑ {t.text}
                  </div>
                ))}
                {more > 0 && <div className="mg-more">+{more}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
