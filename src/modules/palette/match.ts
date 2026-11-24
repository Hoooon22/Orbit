import type { Todo, TreeNode } from "../../shared/api";
import { chosung, isChosungQuery } from "../../shared/hangul";
import { flattenNotes, noteName } from "../memo/flatten";

// 통합 검색(Ctrl+K)의 순수 매칭. 제목·할 일은 "들어 있으면" 맞는 것으로 본다
// (퍼지는 메모가 많을 때 엉뚱한 결과가 섞여 쓰지 않는다). 초성만 치면 초성으로 찾는다.

// 못 맞추면 -1, 앞에서 맞으면 더 높은 점수
function score(q: string, text: string): number {
  const t = text.toLowerCase();
  const i = isChosungQuery(q) ? chosung(t).indexOf(q) : t.indexOf(q);
  if (i === -1) return -1;
  return i === 0 ? 2 : 1;
}

// 최근에 고친 메모부터
export function recentNotes(tree: TreeNode[], limit: number): TreeNode[] {
  return flattenNotes(tree)
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0))
    .slice(0, limit);
}

// 제목으로 찾기. 점수가 같으면 최근에 고친 메모가 먼저
export function matchNotes(tree: TreeNode[], query: string, limit: number): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flattenNotes(tree)
    .map((n) => ({ n, s: score(q, noteName(n.path)) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || (b.n.modified ?? 0) - (a.n.modified ?? 0))
    .slice(0, limit)
    .map((r) => r.n);
}

// 끝내지 않은 할 일 중에서 찾기
export function matchTodos(todos: Todo[], query: string, limit: number): Todo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return todos.filter((t) => !t.done && score(q, t.text) >= 0).slice(0, limit);
}
