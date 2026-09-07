// 부분 문자열이 아니라 순서만 맞으면 되는 퍼지 매칭. 점수가 높을수록 좋은 매치.
// 연속 매치·시작 위치에 가산점을 준다. 매치 실패는 -1.
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  let ti = 0;
  let score = 0;
  for (const c of q) {
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) {
        found = j;
        break;
      }
    }
    if (found === -1) return -1;
    score += 1 + (found === ti ? 2 : 0) + (found === 0 ? 3 : 0);
    ti = found + 1;
  }
  return score;
}
