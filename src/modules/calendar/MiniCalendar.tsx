import { useMemo } from "react";
import type { CalEvent, Todo } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { deadline } from "../todo/store";
import { eventsOn, monthGrid, monthOf, WEEKDAY_KO } from "./calendar";
import type { Month } from "./calendar";

type Props = {
  month: Month;
  onMonthChange: (m: Month) => void;
  selected: string | null;
  onSelect: (date: string) => void;
  events: CalEvent[];
  todos?: Todo[]; // 마감이 있는 할 일도 점으로 표시
  size?: "small" | "large";
};

// 월간 달력. 일정이 있는 날은 강조색 점, 할 일 마감은 흐린 점.
export default function MiniCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  events,
  todos = [],
  size = "small",
}: Props) {
  const today = todayStr();
  const grid = useMemo(() => monthGrid(month.year, month.month0), [month]);
  const todoDays = useMemo(() => {
    const s = new Set<string>();
    for (const t of todos) {
      const d = deadline(t);
      if (d && !t.done) s.add(d);
    }
    return s;
  }, [todos]);

  const shift = (n: number) => {
    const d = new Date(month.year, month.month0 + n, 1);
    onMonthChange({ year: d.getFullYear(), month0: d.getMonth() });
  };
  const prefix = `${month.year}-${String(month.month0 + 1).padStart(2, "0")}`;

  return (
    <div className={"mini-cal " + size}>
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
      <div className="mini-cal-grid">
        {[...WEEKDAY_KO].map((w, i) => (
          <div key={w} className={"mini-cal-wd" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>
            {w}
          </div>
        ))}
        {grid.flat().map((date, i) => {
          const inMonth = date.startsWith(prefix);
          const hasEvent = eventsOn(events, date).length > 0;
          const hasTodo = todoDays.has(date);
          const col = i % 7;
          return (
            <button
              key={date}
              className={
                "mini-cal-day" +
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
              <span>{Number(date.slice(8, 10))}</span>
              {(hasEvent || hasTodo) && (
                <span className="mini-cal-dots">
                  {hasEvent && <i className="dot ev" />}
                  {hasTodo && <i className="dot todo" />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
