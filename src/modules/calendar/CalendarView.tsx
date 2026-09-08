import { useEffect, useMemo, useState } from "react";
import type { CalEvent } from "../../shared/api";
import { relativeTime, todayStr } from "../../shared/dates";
import { useMemoStore } from "../memo/store";
import { flattenNotes, noteName } from "../memo/flatten";
import { deadline, useTodos } from "../todo/store";
import { useEvents } from "./store";
import { hideTitle, useAllEvents, useGoogle } from "./googleStore";
import MonthGrid from "./MonthGrid";
import { dday, ddayLabel, eventsOn, monthOf, shortLabel } from "./calendar";

type Props = {
  initialDate?: string | null; // 오브 등에서 특정 날짜로 열 때
  onOpenNote: (path: string) => void;
  onOpenSettings?: () => void; // 구글 계정 연결 안내
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

// 캘린더 화면: 왼쪽은 날짜 칸마다 일정 제목이 보이는 월간 달력, 오른쪽은 고른 날의 목록과 편집 폼.
// 구글 일정은 읽기 전용이라 고르면 내용만 보여 준다.
export default function CalendarView({ initialDate, onOpenNote, onOpenSettings }: Props) {
  const events = useAllEvents();
  const add = useEvents((s) => s.add);
  const patch = useEvents((s) => s.patch);
  const remove = useEvents((s) => s.remove);
  const todos = useTodos((s) => s.todos);
  const tree = useMemoStore((s) => s.tree);
  const notes = useMemo(() => flattenNotes(tree), [tree]);
  const google = useGoogle((s) => s.status);
  const syncing = useGoogle((s) => s.syncing);
  const sync = useGoogle((s) => s.sync);

  const today = todayStr();
  const [selected, setSelected] = useState(initialDate ?? today);
  const [month, setMonth] = useState(monthOf(initialDate ?? today));
  const [editing, setEditing] = useState<string | null>(null); // 편집 중인 로컬 일정 id
  const [detail, setDetail] = useState<CalEvent | null>(null); // 보고 있는 구글 일정
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialDate ?? today));

  useEffect(() => {
    if (!initialDate) return;
    setSelected(initialDate);
    setMonth(monthOf(initialDate));
  }, [initialDate]);

  const select = (date: string) => {
    setSelected(date);
    setDetail(null);
    if (!editing) setDraft((d) => ({ ...d, date }));
  };

  const dayEvents = eventsOn(events, selected).sort(
    (a, b) => (a.time ?? "").localeCompare(b.time ?? ""),
  );
  const dayTodos = todos.filter((t) => !t.done && deadline(t) === selected);

  const open = (ev: CalEvent) => {
    if (ev.google) {
      setDetail(ev);
      return;
    }
    setDetail(null);
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
  const hasGoogle = (google?.accounts.length ?? 0) > 0;

  return (
    <section className="calendar-view">
      <header className="editor-header">
        <span className="todo-title">캘린더</span>
        <span className="calendar-tools">
          {hasGoogle ? (
            <>
              <span className="calendar-sync-info">
                {google?.error
                  ? "⚠ 구글 동기화 오류 (설정 참고)"
                  : google?.lastSync
                    ? `구글 ${relativeTime(google.lastSync)} 동기화`
                    : "구글 연결됨"}
              </span>
              <button onClick={() => void sync()} disabled={syncing} title="구글 캘린더에서 지금 다시 받기">
                {syncing ? "받는 중…" : "⟳ 동기화"}
              </button>
            </>
          ) : (
            onOpenSettings && (
              <button onClick={onOpenSettings} title="설정에서 Google 계정을 연결합니다">
                구글 캘린더 연결
              </button>
            )
          )}
        </span>
      </header>
      <div className="calendar-body">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={select}
          events={events}
          todos={todos}
          onEventClick={open}
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
                className={
                  "calendar-item" +
                  (editing === ev.id || detail?.id === ev.id ? " editing" : "")
                }
                onClick={() => open(ev)}
              >
                <span className="calendar-color" style={{ background: ev.color ?? "var(--accent)" }} />
                <span className="agenda-when">
                  {ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "종일"}
                </span>
                <span className="agenda-title">
                  {ev.title}
                  {ev.repeat === "yearly" && <small> 매년</small>}
                  {ev.endDate && <small> ~{ev.endDate.slice(5).replace("-", "/")}</small>}
                  {ev.google && <small> {ev.google.calendar}</small>}
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

          {detail ? (
            <div className="calendar-form calendar-detail">
              <h4>구글 일정</h4>
              <div className="calendar-detail-title">{detail.title}</div>
              <div className="calendar-detail-row">
                {shortLabel(detail.date)}
                {detail.endDate ? ` ~ ${shortLabel(detail.endDate)}` : ""}
                {detail.time ? ` · ${detail.time}${detail.endTime ? `–${detail.endTime}` : ""}` : " · 종일"}
              </div>
              <div className="calendar-detail-row">
                <span className="calendar-color" style={{ background: detail.color ?? "var(--accent)" }} />
                {detail.google?.calendar} · {detail.google?.account}
              </div>
              <p className="settings-note">구글 캘린더에서 온 일정은 여기서 고칠 수 없습니다. 구글에서 바꾸면 다음 동기화 때 반영됩니다.</p>
              <div className="calendar-form-actions">
                <button type="button" onClick={() => setDetail(null)}>
                  닫기
                </button>
                <button
                  type="button"
                  className="danger"
                  title="같은 제목의 구글 일정을 Orbit에서 모두 숨깁니다 (구글에는 그대로). 설정에서 되돌릴 수 있습니다."
                  onClick={() => {
                    hideTitle(detail.title);
                    setDetail(null);
                  }}
                >
                  이 제목 숨기기
                </button>
              </div>
            </div>
          ) : (
            <form
              className="calendar-form"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <h4>{editing ? "일정 수정" : "새 일정 (Orbit에 저장)"}</h4>
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
          )}
        </div>
      </div>
    </section>
  );
}
