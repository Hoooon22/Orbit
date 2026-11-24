import { describe, expect, it } from "vitest";
import type { Todo, TreeNode } from "../../shared/api";
import { matchNotes, matchTodos, recentNotes } from "./match";

const note = (path: string, modified: number): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  isDir: false,
  modified,
});

const tree: TreeNode[] = [
  note("회의록.md", 10),
  {
    name: "업무",
    path: "업무",
    isDir: true,
    children: [note("업무/주간 회의.md", 30), note("업무/보고서.md", 20)],
  },
];

describe("recentNotes", () => {
  it("폴더 안까지 모아 최근에 고친 순으로", () => {
    expect(recentNotes(tree, 2).map((n) => n.path)).toEqual(["업무/주간 회의.md", "업무/보고서.md"]);
  });
});

describe("matchNotes", () => {
  it("제목 앞에서 맞은 메모가 먼저", () => {
    expect(matchNotes(tree, "회의", 8).map((n) => n.path)).toEqual(["회의록.md", "업무/주간 회의.md"]);
  });
  it("초성으로 찾는다", () => {
    expect(matchNotes(tree, "ㅂㄱㅅ", 8).map((n) => n.path)).toEqual(["업무/보고서.md"]);
  });
  it("폴더 이름이나 확장자로는 맞지 않는다", () => {
    expect(matchNotes(tree, "업무", 8)).toEqual([]);
    expect(matchNotes(tree, "md", 8)).toEqual([]);
  });
  it("빈 질의는 결과 없음", () => {
    expect(matchNotes(tree, "  ", 8)).toEqual([]);
  });
});

describe("matchTodos", () => {
  const todos: Todo[] = [
    { id: "1", text: "보고서 제출", done: false },
    { id: "2", text: "보고서 초안", done: true },
    { id: "3", text: "장보기", done: false },
  ];
  it("끝낸 할 일은 빼고 찾는다", () => {
    expect(matchTodos(todos, "보고서", 5).map((t) => t.id)).toEqual(["1"]);
  });
});
