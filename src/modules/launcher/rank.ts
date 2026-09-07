import type { LaunchItem, Usage } from "../../shared/api";
import { fuzzyScore } from "../../shared/fuzzy";
import { isChosungQuery, matchesChosung } from "../../shared/hangul";

const DAY = 86_400_000;

// 이름 매칭 점수 + 자주·최근 쓴 가산 + 직접 추가 가산. 질의가 비면 최근 사용순.
export function rankItems(
  items: LaunchItem[],
  usage: Record<string, Usage>,
  query: string,
  now = Date.now(),
  limit = 8,
): LaunchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...items]
      .filter((it) => usage[it.id])
      .sort((a, b) => (usage[b.id]?.lastUsed ?? 0) - (usage[a.id]?.lastUsed ?? 0))
      .slice(0, limit);
  }
  const chosung = isChosungQuery(q);
  return items
    .map((it) => {
      let score = chosung ? matchesChosung(q, it.name) : fuzzyScore(q, it.name);
      // URL 항목은 주소로도 찾는다
      if (score < 0 && !chosung && it.kind === "url") score = fuzzyScore(q, it.target) - 3;
      if (score < 0) return null;
      const u = usage[it.id];
      if (u) {
        score += Math.min(u.count, 10) * 2;
        const age = now - u.lastUsed;
        if (age < DAY) score += 3;
        else if (age < 7 * DAY) score += 1;
      }
      if (it.custom) score += 2;
      return { it, score };
    })
    .filter((r): r is { it: LaunchItem; score: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.it.name.localeCompare(b.it.name))
    .slice(0, limit)
    .map((r) => r.it);
}

// 결과가 없을 때 질의를 그대로 항목으로 더할 수 있는지 (주소·경로 모양이면)
export const looksLaunchable = (q: string) =>
  /^(https?:\/\/|mailto:|[a-zA-Z]:\\|\\\\)/.test(q.trim());
