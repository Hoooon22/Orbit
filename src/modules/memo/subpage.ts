import { Node } from "@tiptap/core";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as PMNode } from "@tiptap/pm/model";

// 하위 페이지 블록 (노션의 "페이지 안에 페이지"). 본문에 📄 제목 한 줄로 보이고, 누르면 그 메모가 열린다.
// 마크다운에는 한 줄짜리 [[폴더/메모]] (노트 루트 기준, 확장자 없음)로 남는다. 자식 메모의 경로가 바뀌면
// Rust(notes.rs after_relocate)가 모든 메모 안의 [[링크]]를 새 경로로 고쳐 준다.

export const subpageTitle = (path: string) => path.split("/").pop() ?? path;

// markdown-it의 블록 규칙·렌더러 타입은 라이브러리 타입을 끌어오지 않고 쓰는 만큼만 적는다
type BlockState = {
  src: string;
  bMarks: number[];
  eMarks: number[];
  tShift: number[];
  line: number;
  push: (type: string, tag: string, nesting: number) => BlockToken;
};
type BlockToken = { block: boolean; map: [number, number] | null; attrSet: (n: string, v: string) => void };
type MarkdownIt = {
  block: { ruler: { before: (name: string, rule: string, fn: BlockRule) => void } };
  renderer: { rules: Record<string, (tokens: { attrGet: (n: string) => string | null }[], idx: number) => string> };
  utils: { escapeHtml: (s: string) => string };
};
type BlockRule = (state: BlockState, startLine: number, endLine: number, silent: boolean) => boolean;

const LINE = /^\[\[([^[\]\n]+)\]\]\s*$/;

const subpageRule: BlockRule = (state, startLine, _endLine, silent) => {
  const pos = state.bMarks[startLine] + state.tShift[startLine];
  const m = LINE.exec(state.src.slice(pos, state.eMarks[startLine]));
  if (!m) return false;
  if (silent) return true;
  const token = state.push("subpage", "div", 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  token.attrSet("data-subpage", m[1].trim());
  state.line = startLine + 1;
  return true;
};

// tiptap-markdown은 parse마다 setup을 다시 부르므로 같은 파서에 규칙이 쌓이지 않게 한 번만 등록한다
const installed = new WeakSet<object>();

export const Subpage = Node.create({
  name: "subpage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { path: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-subpage]",
        getAttrs: (el) => ({ path: (el as HTMLElement).getAttribute("data-subpage") ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    const path = node.attrs.path as string;
    return [
      "div",
      { "data-subpage": path, class: "subpage", title: `${path} 열기` },
      ["span", { class: "subpage-icon" }, "📄"],
      ["span", { class: "subpage-title" }, subpageTitle(path)],
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.write(`[[${node.attrs.path}]]`);
          state.closeBlock(node);
        },
        parse: {
          setup(md: MarkdownIt) {
            if (installed.has(md)) return;
            installed.add(md);
            md.block.ruler.before("paragraph", "subpage", subpageRule);
            md.renderer.rules.subpage = (tokens, idx) =>
              `<div data-subpage="${md.utils.escapeHtml(tokens[idx].attrGet("data-subpage") ?? "")}"></div>`;
          },
        },
      },
    };
  },
});
