import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkLogItem, WorkTimer } from "../../shared/api";
import { elapsedOf, formatElapsed, useTimers } from "./store";

const NOTE_WIDTH = 300;

// 기록 한 줄의 메모 창: 메모 버튼 아래(자리가 없으면 위)에 뜨는 작은 글상자.
// 바깥을 누르거나 Esc로 닫히고, 닫힐 때와 포커스를 잃을 때 바뀐 글을 저장한다.
function NotePopover({ item, anchor, onClose }: { item: WorkLogItem; anchor: HTMLElement; onClose: () => void }) {
  const patchLog = useTimers((s) => s.patchLog);
  const ref = useRef<HTMLDivElement>(null);
  const draft = useRef(item.note ?? "");
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const commit = () => {
    const v = draft.current.trim();
    if (v !== (item.note ?? "")) patchLog(item.id, { note: v || undefined });
  };
  const commitRef = useRef(commit);
  commitRef.current = commit; // 닫기 이벤트 핸들러가 늘 최신 item을 보도록

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - NOTE_WIDTH - 8);
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top });
    ref.current?.querySelector("textarea")?.focus();
  }, [anchor]);

  useEffect(() => {
    const close = () => {
      commitRef.current();
      onClose();
    };
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (ref.current?.contains(el) || anchor.contains(el)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // 창을 숨기는 Esc 처리보다 먼저 받아 이 창만 닫는다
      e.stopPropagation();
      close();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div className="note-pop" ref={ref} style={pos}>
      <div className="note-pop-title">{item.title || "(제목 없음)"}</div>
      <textarea
        defaultValue={item.note ?? ""}
        placeholder="무슨 일을 했는지 적어 두세요"
        spellCheck={false}
        onChange={(e) => (draft.current = e.target.value)}
        onBlur={commit}
      />
    </div>,
    document.body,
  );
}

// 글자처럼 보이다가 누르면 그 자리에서 고치는 칸. Enter·포커스 아웃으로 확정, Esc로 되돌림.
function Field({
  value,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  className?: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null이면 편집 중 아님
  const cancel = useRef(false);
  return (
    <input
      className={"todo-row-text" + (className ? " " + className : "")}
      value={draft ?? value}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft?.trim() ?? "";
        if (!cancel.current && v !== value) onCommit(v);
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

// 타이머 한 장. 돌고 있는 동안만 1초 간격으로 다시 그리고, 멈추면 간격을 없앤다.
// 시간은 시작 시각에서 계산하므로 간격이 밀려도 어긋나지 않는다.
function TimerTile({ timer }: { timer: WorkTimer }) {
  const toggle = useTimers((s) => s.toggle);
  const reset = useTimers((s) => s.reset);
  const remove = useTimers((s) => s.removeTimer);
  const patch = useTimers((s) => s.patchTimer);
  const running = !!timer.startedAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  return (
    <div className={"timer-tile" + (running ? " running" : "")}>
      <Field value={timer.name} placeholder="이름" className="timer-name" onCommit={(v) => v && patch(timer.id, { name: v })} />
      <div className="timer-time">{formatElapsed(elapsedOf(timer, running ? now : 0))}</div>
      <div className="timer-btns">
        <button className={"timer-btn" + (running ? "" : " go")} onClick={() => toggle(timer.id)}>
          {running ? "❚❚ 일시정지" : "▶ 시작"}
        </button>
        <button className="timer-btn" onClick={() => reset(timer.id)} title="0으로 초기화">
          ↺
        </button>
        <button className="timer-x" onClick={() => remove(timer.id)} title="타이머 삭제" aria-label="타이머 삭제">
          ×
        </button>
      </div>
    </div>
  );
}

// 타이머 화면: 왼쪽은 "제목 : 총시간(h)"을 직접 적는 작업 기록, 오른쪽은 작업 타이머 보드.
// 시간은 스토어(시작 시각)에 있으므로 다른 화면으로 가서 이 컴포넌트가 사라져도 계속 센다.
export default function TimerView() {
  const timers = useTimers((s) => s.timers);
  const log = useTimers((s) => s.log);
  const addTimer = useTimers((s) => s.addTimer);
  const addLog = useTimers((s) => s.addLog);
  const patchLog = useTimers((s) => s.patchLog);
  const removeLog = useTimers((s) => s.removeLog);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const noteItem = note && log.find((x) => x.id === note.id);

  const submit = () => {
    if (!draft.trim()) return;
    addTimer(draft);
    setDraft("");
  };

  return (
    <div className="timer-view">
      <div className="worklog">
        <div className="worklog-head">
          <span>제목 : 총시간(h)</span>
          <button className="home-link" onClick={addLog}>
            + 추가
          </button>
        </div>
        <ul className="worklog-rows">
          {log.length === 0 && <li className="clip-empty">"+ 추가"로 작업과 총시간을 적어 두세요</li>}
          {log.map((item) => (
            <li key={item.id} className="worklog-row">
              <Field value={item.title} placeholder="제목" onCommit={(v) => patchLog(item.id, { title: v })} />
              <span className="worklog-sep">:</span>
              <Field
                value={item.hours ? String(item.hours) : ""}
                placeholder="0"
                className="worklog-hours"
                onCommit={(v) => {
                  const n = Number(v);
                  if (Number.isFinite(n) && n >= 0) patchLog(item.id, { hours: n });
                }}
              />
              <span className="worklog-sep">h</span>
              <button
                className={"worklog-note" + (item.note ? " has" : "") + (note?.id === item.id ? " open" : "")}
                title={item.note || "무슨 일을 했는지 메모"}
                onClick={(e) => setNote(note?.id === item.id ? null : { id: item.id, anchor: e.currentTarget })}
              >
                메모
              </button>
              <button className="timer-x" onClick={() => removeLog(item.id)} title="삭제" aria-label="삭제">
                ×
              </button>
            </li>
          ))}
        </ul>
        {noteItem && <NotePopover item={noteItem} anchor={note.anchor} onClose={() => setNote(null)} />}
      </div>
      <div className="timer-board">
        <div className="orb-todo-add">
          <input
            value={draft}
            placeholder="타이머 이름 입력 후 Enter"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape" && draft) {
                e.stopPropagation();
                setDraft("");
              }
            }}
          />
        </div>
        <div className="timer-grid">
          {timers.length === 0 && <div className="clip-empty">작업 이름을 적고 Enter를 누르면 타이머가 생깁니다</div>}
          {timers.map((t) => (
            <TimerTile key={t.id} timer={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
