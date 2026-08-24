// 파일 시각(epoch ms)을 화면에 짧게 적는 함수들.
// 자동 저장이 자주 돌아 수정 시각은 계속 바뀌므로, 최근일수록 상대 표기로 보여준다.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// 편집기 헤더용: 방금 전 · 12분 전 · 3시간 전 · 어제 · 8월 20일 · 2025-11-03
export function relativeTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const diff = now.getTime() - ms;
  if (diff < MINUTE) return "방금 전";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (sameDay(d, now)) return `${Math.floor(diff / HOUR)}시간 전`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, yesterday)) return "어제";
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 사이드바 트리용 (폭이 좁아 최대한 짧게): 8/24 · 25.8.24
export function shortDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
}

// 툴팁용 정확한 시각: 2026-08-24 15:32
export function fullTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
