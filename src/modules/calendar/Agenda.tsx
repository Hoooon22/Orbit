import { useMemo } from "react";
import { todayStr } from "../../shared/dates";
import { deadline, useTodos } from "../todo/store";
import { useAllEvents } from "./googleStore";
import { addDays, dday, ddayLabel, diffDays, eventsOn, shortLabel, upcoming } from "./calendar";

type Row = {
  key: string;
  date: string;
  time?: string;
  title: string;
  kind: "event" | "todo";
  color?: string;
};

type Props = {
  onOpen: (date: string) => void; // 행을 누르면 워크스페이스 캘린더의 그 날짜로
};

// 오늘 + 앞으로 일주일. 일정과 마감 있는 할 일을 한 줄씩, 시각순.
export default function Agenda({ onOpen }: Props) {
  const events = useAllEvents();
  const todos = useTodos((s) => s.todos);
  const today = todayStr();

  const { todayRows, weekRows } = useMemo(() => {
    const rows: Row[] = [];
    for (const ev of eventsOn(events, today))
      rows.push({ key: "e" + ev.id, date: today, time: ev.time, title: ev.title, kind: "event", color: ev.color });
    for (const { ev, date } of upcoming(events, addDays(today, 1), 6))
      rows.push({ key: "e" + ev.id, date, time: ev.time, title: ev.title, kind: "event", color: ev.color });
    for (const t of todos) {
      const d = deadline(t);
      if (t.done || !d) continue;
      const n = diffDays(today, d);
      if (n < 0 || n > 7) continue;
      rows.push({ key: "t" + t.id, date: d, time: t.time, title: t.text, kind: "todo" });
    }
    rows.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""),
    );
    return {
      todayRows: rows.filter((r) => r.date === today),
      weekRows: rows.filter((r) => r.date !== today),
    };
  }, [events, todos, today]);

  const renderRow = (r: Row, withDate: boolean) => (
    <li key={r.key} className={"agenda-row " + r.kind} onClick={() => onOpen(r.date)}>
      <span className="agenda-when">
        {withDate ? shortLabel(r.date) : ""}
        {withDate && r.time ? " " : ""}
        {r.time ?? (withDate ? "" : "종일")}
      </span>
      <span className="agenda-title" title={r.title}>
        {r.kind === "todo" ? (
          "☑ "
        ) : (
          <span className="calendar-color" style={{ background: r.color ?? "var(--accent)" }} />
        )}
        {r.title}
      </span>
      {withDate && <span className="agenda-dday">{ddayLabel(dday(r.date, today))}</span>}
    </li>
  );

  return (
    <div className="agenda">
      <div className="agenda-section">오늘 · {shortLabel(today)}</div>
      <ul className="agenda-list">
        {todayRows.length === 0 && <li className="agenda-empty">오늘 일정 없음</li>}
        {todayRows.map((r) => renderRow(r, false))}
      </ul>
      <div className="agenda-section">이번 주</div>
      <ul className="agenda-list">
        {weekRows.length === 0 && <li className="agenda-empty">앞으로 일주일 비어 있음</li>}
        {weekRows.map((r) => renderRow(r, true))}
      </ul>
    </div>
  );
}
