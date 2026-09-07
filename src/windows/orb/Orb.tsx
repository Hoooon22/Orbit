import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { todayStr } from "../../shared/dates";
import { useTodos } from "../../modules/todo/store";
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
  const pending = useTodos((s) => s.todos.filter((t) => !t.done).length);
  const events = useAllEvents();
  const todayEvents = eventsOn(events, todayStr()).length;
  const down = useRef<{ x: number; y: number } | null>(null);
  const tip =
    `Orbit — 클릭해서 열기, 끌어서 옮기기` +
    (pending ? `\n남은 할 일 ${pending}` : "") +
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
        <Clock size="orb" />
        {pending > 0 && <span className="orb-badge">{pending > 99 ? "99+" : pending}</span>}
        {todayEvents > 0 && <span className="orb-badge events">{todayEvents}</span>}
      </button>
    </div>
  );
}
