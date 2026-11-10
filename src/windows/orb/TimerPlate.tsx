import TimerClock from "../../modules/timer/TimerClock";
import { runningTimers, useTimers } from "../../modules/timer/store";

// 펫 발밑 이름표: 돌고 있는 타이머(가장 최근에 시작한 것)의 작업 이름과 시간, 더 돌고 있으면 +N.
// 펫 창 안(발 아래 빈 자리)에만 그려서 화면을 더 가리지 않는다. 작은 펫은 폭이 좁아 이름만 보인다
// (시간은 CSS로 숨김). 잘린 이름과 나머지 타이머는 마우스를 올리면 뜨는 말풍선(Bubble.tsx)에서 본다.
export default function TimerPlate() {
  const timers = useTimers((s) => s.timers);
  const running = runningTimers(timers);
  if (running.length === 0) return null;
  return (
    <div className="pet-plate">
      <span className="pet-plate-name">{running[0].name}</span>
      {running.length > 1 && <span className="pet-plate-more">+{running.length - 1}</span>}
      <TimerClock timer={running[0]} className="pet-plate-time" />
    </div>
  );
}
