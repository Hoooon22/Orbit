import { useEffect, useMemo, useState } from "react";
import type { CalEvent } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { useMemoStore } from "../memo/store";
import { flattenNotes, noteName } from "../memo/flatten";
import { deadline, useTodos } from "../todo/store";
import { useEvents } from "./store";
import MiniCalendar from "./MiniCalendar";
import { dday, ddayLabel, eventsOn, monthOf, shortLabel } from "./calendar";

type Props = {
  initialDate?: string | null; // 오브 등에서 특정 날짜로 열 때
  onOpenNote: (path: string) => void;
};

type Draft = {
  title: string;
  date: string;
  endDate: string;
  allDay: boolean;
  time: string;
  endTime: string;
  yearly: boolean;
  note: string;
};

const emptyDraft = (date: string): Draft => ({
  title: "",
  date,
  endDate: "",
  allDay: true,
  time: "09:00",
  endTime: "",
  yearly: false,
  note: "",
});

const draftOf = (ev: CalEvent): Draft => ({
  title: ev.title,
  date: ev.date,
  endDate: ev.endDate ?? "",
  allDay: !ev.time,
  time: ev.time ?? "09:00",
  endTime: ev.endTime ?? "",
  yearly: ev.repeat === "yearly",
  note: ev.note ?? "",
});

// 워크스페이스 캘린더: 왼쪽 월간 달력, 오른쪽 고른 날의 일정·할 일과 편집 폼
export default function CalendarView({ initialDate, onOpenNote }: Props) {
  const events = useEvents((s) => s.events);
  const add = useEvents((s) => s.add);
  const patch = useEvents((s) => s.patch);
  const remove = useEvents((s) => s.remove);
  const todos = useTodos((s) => s.todos);
  const tree = useMemoStore((s) => s.tree);
  const notes = useMemo(() => flattenNotes(tree), [tree]);

  const today = todayStr();
  const [selected, setSelected] = useState(initialDate ?? today);
  const [month, setMonth] = useState(monthOf(initialDate ?? today));
  const [editing, setEditing] = useState<string | null>(null); // 편집 중인 일정 id, null이면 새 일정
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialDate ?? today));

  useEffect(() => {
    if (!initialDate) return;
    setSelected(initialDate);
    setMonth(monthOf(initialDate));
  }, [initialDate]);

  const select = (date: string) => {
    setSelected(date);
    if (!editing) setDraft((d) => ({ ...d, date }));
  };

  const dayEvents = eventsOn(events, selected);
  const dayTodos = todos.filter((t) => !t.done && deadline(t) === selected);

  const startEdit = (ev: CalEvent) => {
    setEditing(ev.id);
    setDraft(draftOf(ev));
  };

  const cancel = () => {
    setEditing(null);
    setDraft(emptyDraft(selected));
  };

  const save = () => {
    const title = draft.title.trim();
    if (!title || !draft.date) return;
    const body = {
      title,
      date: draft.date,
      endDate: draft.endDate && draft.endDate > draft.date ? draft.endDate : undefined,
      time: draft.allDay ? undefined : draft.time || undefined,
      endTime: draft.allDay || !draft.endTime ? undefined : draft.endTime,
      repeat: draft.yearly ? ("yearly" as const) : undefined,
      note: draft.note || undefined,
    };
    if (editing) patch(editing, body);
    else add(body);
    cancel();
  };

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <section className="calendar-view">
      <header className="editor-header">
        <span className="todo-title">📅 캘린더</span>
      </header>
      <div className="calendar-body">
        <MiniCalendar
          size="large"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={select}
          events={events}
          todos={todos}
        />
        <div className="calendar-side">
          <h3 className="calendar-day-title">
            {shortLabel(selected)}
            <span className="calendar-dday">{ddayLabel(dday(selected, today))}</span>
          </h3>
          <ul className="calendar-day-list">
            {dayEvents.length === 0 && dayTodos.length === 0 && (
              <li className="agenda-empty">일정 없음</li>
            )}
            {dayEvents.map((ev) => (
              <li
                key={ev.id}
                className={"calendar-item" + (editing === ev.id ? " editing" : "")}
                onClick={() => startEdit(ev)}
              >
                <span className="agenda-when">
                  {ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "종일"}
                </span>
                <span className="agenda-title">
                  {ev.title}
                  {ev.repeat === "yearly" && <small> 매년</small>}
                  {ev.endDate && <small> ~{ev.endDate.slice(5).replace("-", "/")}</small>}
                </span>
                {ev.note && (
                  <button
                    className="calendar-note-btn"
                    title={ev.note}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenNote(ev.note!);
                    }}
                  >
                    📄 {noteName(ev.note)}
                  </button>
                )}
              </li>
            ))}
            {dayTodos.map((t) => (
              <li key={t.id} className="calendar-item todo">
                <span className="agenda-when">{t.time ?? "마감"}</span>
                <span className="agenda-title">☑ {t.text}</span>
              </li>
            ))}
          </ul>

          <form
            className="calendar-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h4>{editing ? "일정 수정" : "새 일정"}</h4>
            <input
              value={draft.title}
              placeholder="제목"
              spellCheck={false}
              onChange={(e) => set({ title: e.target.value })}
            />
            <div className="calendar-form-row">
              <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
              <span>~</span>
              <input
                type="date"
                value={draft.endDate}
                min={draft.date}
                title="마지막 날 (여러 날 일정)"
                onChange={(e) => set({ endDate: e.target.value })}
              />
            </div>
            <div className="calendar-form-row">
              <label>
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(e) => set({ allDay: e.target.checked })}
                />
                종일
              </label>
              {!draft.allDay && (
                <>
                  <input type="time" value={draft.time} onChange={(e) => set({ time: e.target.value })} />
                  <span>~</span>
                  <input
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => set({ endTime: e.target.value })}
                  />
                </>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={draft.yearly}
                  onChange={(e) => set({ yearly: e.target.checked })}
                />
                매년 (생일·기념일)
              </label>
            </div>
            <select value={draft.note} onChange={(e) => set({ note: e.target.value })}>
              <option value="">연결할 메모 없음</option>
              {notes.map((n) => (
                <option key={n.path} value={n.path}>
                  {n.path.replace(/\.md$/i, "")}
                </option>
              ))}
            </select>
            <div className="calendar-form-actions">
              <button type="submit" className="primary" disabled={!draft.title.trim()}>
                {editing ? "저장" : "추가"}
              </button>
              {editing && (
                <>
                  <button type="button" onClick={cancel}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      remove(editing);
                      cancel();
                    }}
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
