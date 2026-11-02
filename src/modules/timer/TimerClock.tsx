import { useEffect, useState } from "react";
import type { WorkTimer } from "../../shared/api";
import { elapsedOf, formatElapsed } from "./store";

// 타이머 하나의 시간 글자. 돌고 있는 동안만 1초 간격으로 다시 그리고, 멈추면 간격을 없앤다.
// 시간은 시작 시각에서 계산하므로 간격이 밀려도 어긋나지 않는다.
export default function TimerClock({ timer, className }: { timer: WorkTimer; className: string }) {
  const running = !!timer.startedAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  return <div className={className}>{formatElapsed(elapsedOf(timer, running ? now : 0))}</div>;
}
