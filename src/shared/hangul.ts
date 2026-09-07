// 한글 초성 검색. "ㅋㄹ"으로 "크롬"을 찾는다.

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

// 완성형 한글은 초성으로, 나머지 글자는 그대로
export function chosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
  }
  return out;
}

export const isChosungQuery = (q: string) => /^[ㄱ-ㅎ]+$/.test(q);

// 초성 질의가 이름의 초성열에 들어 있으면 점수(앞에서 시작하면 가산), 아니면 -1
export function matchesChosung(query: string, name: string): number {
  const hay = chosung(name).toLowerCase();
  const i = hay.indexOf(query);
  if (i === -1) return -1;
  return 10 + (i === 0 ? 5 : 0);
}
