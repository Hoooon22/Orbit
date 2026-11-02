import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HomeTimers from "./HomeTimers";
import { useTimers } from "./store";

type Props = { onOpenTimer: () => void };

const WIDTH = 300;

// Orbit 머리줄의 타이머 버튼: 돌고 있는 타이머가 있으면 강조색 점이 붙고,
// 누르면 그 아래 팝업으로 홈의 타이머 목록(이름·시간·시작/일시정지)이 뜬다.
export default function TimerHeadButton({ onOpenTimer }: Props) {
  const running = useTimers((s) => s.timers.some((t) => !!t.startedAt));
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (popRef.current?.contains(el) || btnRef.current?.contains(el)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // 창을 닫는 Esc보다 먼저 받아 팝업만 닫는다
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const r = btnRef.current?.getBoundingClientRect();
  const left = r ? Math.min(Math.max(8, r.right - WIDTH), window.innerWidth - WIDTH - 8) : 0;
  const top = r ? r.bottom + 6 : 0;

  return (
    <>
      <button
        ref={btnRef}
        className={"dash-head-btn dash-timer-btn" + (running ? " running" : "")}
        onClick={() => setOpen((o) => !o)}
        title="타이머"
        aria-label="타이머"
        aria-expanded={open}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="9" r="5.5" />
          <path d="M8 6v3l2 1.5M6.5 2h3" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div ref={popRef} className="timer-pop" style={{ left, top }}>
            <div className="timer-pop-head">
              타이머
              <button
                className="home-link"
                onClick={() => {
                  setOpen(false);
                  onOpenTimer();
                }}
              >
                전체 보기 ›
              </button>
            </div>
            <HomeTimers />
          </div>,
          document.body,
        )}
    </>
  );
}
