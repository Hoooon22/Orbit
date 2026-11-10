import { showDashboard } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import TimerClock from "../../modules/timer/TimerClock";
import { runningTimers, useTimers } from "../../modules/timer/store";
import { useBubble } from "./bubbleStore";

// 오브 옆 말풍선 한 장. 클릭하면 관련 화면을 열고 닫힌다.
// 알림 말풍선(current)이 없고 펫에 마우스를 올려 둔 동안은 돌고 있는 타이머 목록을 보여 준다.
export default function Bubble() {
  const b = useBubble((s) => s.current);
  const dismiss = useBubble((s) => s.dismiss);
  const showTimers = useBubble((s) => s.timers);
  const timers = useTimers((s) => s.timers);
  if (!b) {
    const running = showTimers ? runningTimers(timers) : [];
    if (running.length === 0) return null; // 띄워 둔 사이 다 멈췄으면 빈 상자를 그리지 않는다
    return (
      <button
        className="orb-bubble orb-bubble-timers"
        onClick={() => {
          showDashboard("timer").catch(reportError);
          useBubble.getState().hideTimers();
        }}
      >
        {running.map((t) => (
          <span key={t.id} className="orb-bubble-timer">
            <span className="orb-bubble-timer-name">{t.name}</span>
            <TimerClock timer={t} className="orb-bubble-timer-time" />
          </span>
        ))}
      </button>
    );
  }
  return (
    <button
      className="orb-bubble"
      title="클릭하면 Orbit 창에서 봅니다"
      onClick={() => {
        showDashboard(b.view).catch(reportError);
        dismiss();
      }}
    >
      <span className="orb-bubble-title">{b.title}</span>
      <span className="orb-bubble-body">{b.body}</span>
    </button>
  );
}
