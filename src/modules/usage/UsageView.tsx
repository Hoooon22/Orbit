import { useEffect, useState } from "react";
import { todayStr } from "../../shared/dates";
import { useSettings } from "../../shared/stores/settings";
import { useUsage } from "./store";
import { activeSeconds, formatDuration, rankApps } from "./format";

const TOP = 15;

// 앱별 사용 시간. 하루 단위로 넘겨 보며, 막대는 그날 1위 대비 비율이다.
export default function UsageView() {
  const days = useUsage((s) => s.days);
  const enabled = useSettings((s) => s.settings.usageEnabled);
  const update = useSettings((s) => s.update);
  // 보고 있는 날짜. null이면 가장 최근 날
  const [date, setDate] = useState<string | null>(null);

  const idx = date ? days.findIndex((d) => d.date === date) : days.length - 1;
  const day = idx >= 0 ? days[idx] : undefined;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < days.length - 1;

  // ← → 로도 날짜 이동
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea")) return;
      if (e.key === "ArrowLeft" && hasPrev) setDate(days[idx - 1].date);
      if (e.key === "ArrowRight" && hasNext) setDate(days[idx + 1].date);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [days, idx, hasPrev, hasNext]);

  const ranked = day ? rankApps(day) : [];
  const top = ranked.slice(0, TOP);
  const max = top[0]?.[1] ?? 1;

  return (
    <section className="usage-view">
      <header className="editor-header">
        <span className="todo-title">통계</span>
        {day && (
          <span className="usage-nav">
            <button disabled={!hasPrev} onClick={() => setDate(days[idx - 1].date)} title="전날 (←)">
              ‹
            </button>
            <span className="usage-date">
              {day.date}
              {day.date === todayStr() && <em> · 오늘</em>}
            </span>
            <button disabled={!hasNext} onClick={() => setDate(days[idx + 1].date)} title="다음 날 (→)">
              ›
            </button>
          </span>
        )}
        <span className="clip-tools">
          <label>
            <input type="checkbox" checked={enabled} onChange={(e) => update({ usageEnabled: e.target.checked })} />
            기록
          </label>
        </span>
      </header>
      {!day ? (
        <div className="clip-empty">
          {enabled ? "아직 기록이 없습니다. 다른 앱을 쓰면 5초마다 쌓입니다." : "설정에서 사용 통계 기록이 꺼져 있습니다."}
        </div>
      ) : (
        <div className="usage-body">
          <div className="usage-summary">
            <span>
              활동 <b>{formatDuration(activeSeconds(day))}</b>
            </span>
            <span>
              자리 비움 <b>{formatDuration(day.idle)}</b>
            </span>
          </div>
          <ol className="usage-list">
            {top.map(([name, sec], i) => (
              <li key={name} className="usage-row">
                <span className="usage-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="usage-name">{name}</span>
                <span className="usage-time">{formatDuration(sec)}</span>
                <span className={"usage-bar" + (i === 0 ? " top" : "")}>
                  <i style={{ width: `${(sec / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
          {ranked.length > TOP && <div className="usage-more">+{ranked.length - TOP}개 더</div>}
        </div>
      )}
    </section>
  );
}
