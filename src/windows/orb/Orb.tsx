import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { todayStr } from "../../shared/dates";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { eventsOn } from "../../modules/calendar/calendar";
import Clock from "../../modules/calendar/Clock";

type Props = {
  onActivate: () => void;
  onHover: (hovering: boolean) => void;
};

const DRAG_THRESHOLD = 4; // px. 이보다 덜 움직였으면 클릭으로 본다

// 오브. 클릭하면 Orbit 창을 열고, 끌면 창을 옮긴다.
// startDragging()이 마우스를 가져가 버려 mouseup이 오지 않으므로, 끌기 시작 전에 클릭 여부를 판정한다.
export default function Orb({ onActivate, onHover }: Props) {
  const pending = useTodos((s) => pendingNow(s.todos)); // 노란 배지 = 당장 할 일만
  const events = useAllEvents();
  const todayEvents = eventsOn(events, todayStr()).length;
  const down = useRef<{ x: number; y: number } | null>(null);
  const tip =
    `Orbit — 클릭해서 열기, 끌어서 옮기기` +
    (pending ? `\n당장 할 일 ${pending}` : "") +
    (todayEvents ? `\n오늘 일정 ${todayEvents}` : "");

  return (
    <div
      className="orb-root"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button
        className="orb"
        title={tip}
        aria-label="Orbit 열기"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onMouseMove={(e) => {
          const d = down.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < DRAG_THRESHOLD) return;
          down.current = null;
          void getCurrentWindow().startDragging();
        }}
        onMouseUp={(e) => {
          if (e.button !== 0 || !down.current) return;
          down.current = null;
          onActivate();
        }}
        onMouseLeave={() => {
          down.current = null;
        }}
      >
        {/* 앱 아이콘과 같은 행성: 구체 위로 기울어진 궤도 고리가 앞뒤로 지나가고 작은 위성이 돈다 */}
        <svg className="orb-planet" viewBox="0 0 72 72" aria-hidden="true">
          <defs>
            <radialGradient id="orb-sphere" cx="0.36" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#a797ff" />
              <stop offset="0.45" stopColor="#5b4bd6" />
              <stop offset="1" stopColor="#1f1852" />
            </radialGradient>
            <linearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd166" />
              <stop offset="1" stopColor="#ff8c42" />
            </linearGradient>
          </defs>
          <g transform="rotate(-24 36 36)">
            {/* 고리 뒤쪽 절반 (구체에 가려지는 쪽) */}
            <path d="M5 36 a31 9.5 0 0 1 62 0" fill="none" stroke="#b8924a" strokeWidth="3" strokeLinecap="round" />
          </g>
          <circle cx="36" cy="36" r="23" fill="url(#orb-sphere)" />
          <ellipse cx="28" cy="27" rx="8.5" ry="5" fill="#fff" opacity="0.22" transform="rotate(-30 28 27)" />
          <g transform="rotate(-24 36 36)">
            <path d="M5 36 a31 9.5 0 0 0 62 0" fill="none" stroke="url(#orb-ring)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="67" cy="36" r="3.4" fill="#ffd166" />
          </g>
        </svg>
        <Clock size="orb" />
        {pending > 0 && <span className="orb-badge">{pending > 99 ? "99+" : pending}</span>}
        {todayEvents > 0 && <span className="orb-badge events">{todayEvents}</span>}
      </button>
    </div>
  );
}
