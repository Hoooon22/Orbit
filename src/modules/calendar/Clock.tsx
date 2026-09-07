import { useEffect, useState } from "react";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

// 분 단위 시계. 매초 깨우지 않고 다음 분 경계에 맞춰 한 번씩만 다시 그린다.
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = window.setTimeout(tick, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()));
    };
    timer = window.setTimeout(tick, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return now;
}

const timeLabel = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dateLabel = (d: Date) =>
  `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;

// size="orb": 시각만 (오브 안). size="panel": 날짜 + 시각 (패널 머리).
export default function Clock({ size }: { size: "orb" | "panel" }) {
  const now = useClock();
  if (size === "orb") return <span className="clock-orb">{timeLabel(now)}</span>;
  return (
    <span className="clock-panel">
      <span className="clock-date">{dateLabel(now)}</span>
      <span className="clock-time">{timeLabel(now)}</span>
    </span>
  );
}
