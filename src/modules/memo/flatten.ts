import type { TreeNode } from "../../shared/api";

// 트리를 순회해 모든 노트를 평탄화 (폴더는 제외)
export function flattenNotes(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) flattenNotes(n.children, out);
    } else {
      out.push(n);
    }
  }
  return out;
}

export const noteName = (path: string) =>
  (path.split("/").pop() ?? path).replace(/\.md$/i, "");
