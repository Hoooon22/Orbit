// 사용 통계 화면의 순수 함수들

import type { DayUsage } from "../../shared/api";

// 초 → "45초" / "12분" / "1시간" / "1시간 5분"
export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}시간 ${rest}분` : `${h}시간`;
}

// 앱별 시간을 많이 쓴 순서로
export function rankApps(day: DayUsage): [string, number][] {
  return Object.entries(day.apps).sort((a, b) => b[1] - a[1]);
}

// 자리 비움을 뺀, 앱을 쓴 시간의 합
export function activeSeconds(day: DayUsage): number {
  return Object.values(day.apps).reduce((a, b) => a + b, 0);
}
