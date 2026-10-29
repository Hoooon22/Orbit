import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

// 노션의 "/" 메뉴 뒷받침. 빈 자리(줄 처음이나 공백 뒤)에 "/"를 치면 Editor.tsx가 커서 아래에 SlashMenu를 띄우고,
// 이어서 치는 글자로 항목을 거른다. 고른 블록으로 바꾸는 일은 Editor.tsx(runSlash)가 한다.

export type SlashRange = { from: number; to: number; query: string };

// 커서 앞 텍스트가 "/질의"로 끝나면 그 범위. 코드 블록 안이나 범위 선택 중에는 없음.
export function slashQuery(state: EditorState): SlashRange | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const i = text.lastIndexOf("/");
  if (i === -1 || (i > 0 && !/\s/.test(text[i - 1]))) return null;
  const query = text.slice(i + 1);
  if (/\s/.test(query)) return null;
  return { from: $from.pos - query.length - 1, to: $from.pos, query };
}

export type SlashKey = "up" | "down" | "enter" | "escape";

// 메뉴가 열려 있는 동안 ↑↓·Enter·Esc를 가로챈다. 열려 있지 않으면(handler가 false) 편집기 기본 동작으로.
// 목록의 Enter(항목 나누기)보다 먼저 받아야 하므로 우선순위를 높인다.
export const SlashKeys = Extension.create<{ handler: (key: SlashKey) => boolean }>({
  name: "slashKeys",
  priority: 1000,
  addOptions() {
    return { handler: () => false };
  },
  addKeyboardShortcuts() {
    return {
      ArrowUp: () => this.options.handler("up"),
      ArrowDown: () => this.options.handler("down"),
      Enter: () => this.options.handler("enter"),
      Escape: () => this.options.handler("escape"),
    };
  },
});
