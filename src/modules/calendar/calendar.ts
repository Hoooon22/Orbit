// 날짜 계산 순수 함수. 날짜는 전부 로컬 기준 "YYYY-MM-DD" 문자열로 다룬다
// (input[type=date]·할 일 마감일과 같은 형식이라 그대로 비교·정렬된다).

import type { CalEvent } from "../../shared/api";

export const WEEKDAY_KO = "일월화수목금토";
const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// 두 날짜의 차이(일). b - a
export function diffDays(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
}

export const weekdayKo = (s: string) => WEEKDAY_KO[parseYmd(s).getDay()];

// "9/8 (화)"
export function shortLabel(s: string): string {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()} (${weekdayKo(s)})`;
}

export type Month = { year: number; month0: number };

export const monthOf = (date: string): Month => ({
  year: Number(date.slice(0, 4)),
  month0: Number(date.slice(5, 7)) - 1,
});

// 월간 달력 칸: 일요일 시작, 항상 6주(42칸)라 달이 바뀌어도 높이가 흔들리지 않는다.
export function monthGrid(year: number, month0: number): string[][] {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  const rows: string[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: string[] = [];
    for (let c = 0; c < 7; c++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + r * 7 + c);
      row.push(ymd(d));
    }
    rows.push(row);
  }
  return rows;
}

// D-day: 양수면 앞으로 n일, 0이면 오늘, 음수면 지남
export const dday = (target: string, today: string) => diffDays(today, target);

export function ddayLabel(n: number): string {
  if (n === 0) return "D-Day";
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

// 매년 반복 일정의 해당 연도 날짜. 2/29는 평년에 2/28로.
export function occurrence(ev: CalEvent, year: number): string {
  if (ev.repeat !== "yearly") return ev.date;
  const d = parseYmd(ev.date);
  const last = new Date(year, d.getMonth() + 1, 0).getDate();
  return ymd(new Date(year, d.getMonth(), Math.min(d.getDate(), last)));
}

// 오늘 이후 가장 가까운 발생일 (매년 반복이면 올해 지났을 때 내년)
export function nextOccurrence(ev: CalEvent, today: string): string {
  if (ev.repeat !== "yearly") return ev.date;
  const year = parseYmd(today).getFullYear();
  const thisYear = occurrence(ev, year);
  return thisYear >= today ? thisYear : occurrence(ev, year + 1);
}

// 일정이 걸치는 일수 (하루짜리는 0)
const span = (ev: CalEvent) => (ev.endDate ? Math.max(0, diffDays(ev.date, ev.endDate)) : 0);

// 특정 날짜에 걸리는 일정 (여러 날 일정·매년 반복 포함)
export function eventsOn(events: CalEvent[], date: string): CalEvent[] {
  const year = parseYmd(date).getFullYear();
  return events.filter((ev) => {
    // 연말·연초에 걸친 반복 일정은 전년도 발생분도 확인한다
    for (const y of ev.repeat === "yearly" ? [year - 1, year] : [year]) {
      const start = occurrence(ev, y);
      const end = addDays(start, span(ev));
      if (start <= date && date <= end) return true;
    }
    return false;
  });
}

export type Occurrence = { ev: CalEvent; date: string };

// today부터 days일 안에 시작하는 발생들. 날짜순, 같은 날은 종일이 먼저·그다음 시각순.
export function upcoming(events: CalEvent[], today: string, days: number): Occurrence[] {
  const until = addDays(today, days);
  const out: Occurrence[] = [];
  for (const ev of events) {
    const date = nextOccurrence(ev, today);
    if (date >= today && date <= until) out.push({ ev, date });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (a.ev.time ?? "").localeCompare(b.ev.time ?? ""),
  );
}
