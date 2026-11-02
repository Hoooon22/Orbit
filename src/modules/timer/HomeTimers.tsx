import TimerClock from "./TimerClock";
import { useTimers } from "./store";

// 홈 왼쪽 아래의 타이머 목록: 타이머 화면의 보드를 한 줄씩으로 줄인 것. 이름 · 시간 · 시작/일시정지.
// 추가·삭제·초기화는 타이머 화면에서.
export default function HomeTimers() {
  const timers = useTimers((s) => s.timers);
  const toggle = useTimers((s) => s.toggle);
  if (timers.length === 0)
    return <div className="clip-empty">타이머 화면에서 작업 이름을 적어 타이머를 만들어 두세요</div>;
  return (
    <ul className="home-timer-rows">
      {timers.map((t) => {
        const running = !!t.startedAt;
        return (
          <li key={t.id} className={"home-timer-row" + (running ? " running" : "")}>
            <span className="home-timer-name" title={t.name}>
              {t.name}
            </span>
            <TimerClock timer={t} className="home-timer-time" />
            <button
              className={"timer-btn" + (running ? "" : " go")}
              onClick={() => toggle(t.id)}
              title={running ? "일시정지" : "시작"}
              aria-label={running ? "일시정지" : "시작"}
            >
              {running ? "❚❚" : "▶"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
