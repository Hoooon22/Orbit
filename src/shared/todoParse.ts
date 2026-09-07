// "내일 오후 3시 회의" 같은 한국어 입력에서 날짜·시각을 뽑아낸다. 규칙 기반이라
// 잡아낸 토큰은 본문에서 지우고, 못 알아본 표현은 그대로 본문에 남긴다.
// 시각이 있으면 그 시각 정각에 알림(remindAt)을 건다. 날짜만 있으면 알림은 걸지 않는다.

export type Parsed = { text: string; start?: string; time?: string; remindAt?: number };

// 입력창 아래에 보여줄 한 줄 미리보기: "9/8 (화) 15:00 · 알림". 알아낸 게 없으면 빈 문자열.
export function describeParsed(p: Parsed): string {
  if (!p.start) return "";
  const [y, m, d] = p.start.split("-").map(Number);
  const day = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  let s = `${m}/${d} (${day})`;
  if (p.time) s += ` ${p.time}`;
  if (p.remindAt) s += " · 알림";
  return s;
}

const WEEKDAYS = "일월화수목금토";
const RELATIVE: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
const pad = (n: number) => String(n).padStart(2, "0");

const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function parseTodoInput(raw: string, now = new Date()): Parsed {
  let text = raw.trim();
  let date: Date | null = null;
  let time: { h: number; m: number } | null = null;

  // 정규식이 맞으면 처리하고 그 토큰을 본문에서 지운다
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void): boolean => {
    const m = text.match(re);
    if (!m || m.index === undefined) return false;
    fn(m);
    text = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length))
      .replace(/\s{2,}/g, " ")
      .trim();
    return true;
  };

  type Rule = [RegExp, (m: RegExpMatchArray) => void];
  // 먼저 맞는 규칙 하나만 쓴다
  const first = (rules: Rule[]) => {
    for (const [re, fn] of rules) if (take(re, fn)) return;
  };

  // ── 날짜 ──
  first([
    [/(\d{4})-(\d{2})-(\d{2})/, (m) => (date = new Date(+m[1], +m[2] - 1, +m[3]))],
    [
      /(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d:])/,
      (m) => (date = new Date(now.getFullYear(), +m[1] - 1, +m[2])),
    ],
    [/(\d{1,2})월\s*(\d{1,2})일/, (m) => (date = new Date(now.getFullYear(), +m[1] - 1, +m[2]))],
    [/(오늘|내일|모레|글피)/, (m) => (date = addDays(now, RELATIVE[m[1]]))],
    [
      /(다음\s*주\s*)?([일월화수목금토])요일/,
      (m) => {
        // 다가오는 그 요일 (오늘이 그 요일이면 오늘). "다음 주"면 일주일 뒤.
        let diff = (WEEKDAYS.indexOf(m[2]) - now.getDay() + 7) % 7;
        if (m[1]) diff += 7;
        date = addDays(now, diff);
      },
    ],
    [
      /(?<!\d)(\d{1,2})일(?![\d일])/,
      (m) => {
        // 이번 달의 그 날짜. 이미 지났으면 다음 달.
        const day = +m[1];
        const d = new Date(now.getFullYear(), now.getMonth(), day);
        date = d < addDays(now, 0) ? new Date(now.getFullYear(), now.getMonth() + 1, day) : d;
      },
    ],
  ]);

  // ── 시각 ──
  first([
    [/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/, (m) => (time = { h: +m[1], m: +m[2] })],
    [
      // "3시간"은 시각이 아니다. "3시 반", "3시 20분", "오후 3시"
      /(오전|오후|아침|저녁|밤)?\s*(?<!\d)(\d{1,2})시(?!간)(?:\s*(반|(\d{1,2})분))?/,
      (m) => {
        let h = +m[2];
        const min = m[3] === "반" ? 30 : m[4] ? +m[4] : 0;
        const ampm = m[1];
        if (ampm === "오후" || ampm === "저녁" || ampm === "밤") {
          if (h < 12) h += 12;
        } else if (ampm === "오전" || ampm === "아침") {
          if (h === 12) h = 0;
        } else if (h >= 1 && h <= 6) {
          h += 12; // 오전·오후 표시가 없는 1~6시는 오후로 본다 (새벽 약속은 드물다)
        }
        time = { h, m: min };
      },
    ],
  ]);

  const result: Parsed = { text };
  if (!date && !time) return result;

  // 시각만 있으면 오늘, 이미 지났으면 내일
  if (time && !date) {
    const t = time as { h: number; m: number };
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
    date = today.getTime() <= now.getTime() ? addDays(now, 1) : today;
  }
  const d = date as Date;
  result.start = ymd(d);
  if (time) {
    const t = time as { h: number; m: number };
    result.time = `${pad(t.h)}:${pad(t.m)}`;
    result.remindAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m).getTime();
  }
  return result;
}
