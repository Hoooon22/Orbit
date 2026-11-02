import { useEffect, useRef, useState } from "react";
import type { WorkTimer } from "../../shared/api";
import { elapsedOf, formatElapsed, useTimers } from "./store";

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
          {running ? "멈춤" : "시작"}
        </button>
        <button className="timer-btn" onClick={() => reset(timer.id)} title="0으로">
          ↺
        </button>
        <button className="timer-x" onClick={() => remove(timer.id)} title="타이머 삭제" aria-label="타이머 삭제">
          ×
        </button>
      </div>
    </div>
  );
}

// 홈 아래 칸: 왼쪽은 "제목 : 총시간(h)"을 직접 적는 작업 기록, 오른쪽은 작업 타이머 보드.
export default function TimerSection() {
  const timers = useTimers((s) => s.timers);
  const log = useTimers((s) => s.log);
  const addTimer = useTimers((s) => s.addTimer);
  const addLog = useTimers((s) => s.addLog);
  const patchLog = useTimers((s) => s.patchLog);
  const removeLog = useTimers((s) => s.removeLog);
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim()) return;
    addTimer(draft);
    setDraft("");
  };

  return (
    <div className="home-card timer-card">
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
              <button className="timer-x" onClick={() => removeLog(item.id)} title="삭제" aria-label="삭제">
                ×
              </button>
            </li>
          ))}
        </ul>
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
