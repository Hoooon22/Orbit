import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { indentFirstListItem } from "./listIndent";

const schema = getSchema([StarterKit]);
const INDENT = "    ";

const item = (text: string) =>
  schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
const bullets = (...texts: string[]) => schema.nodes.bulletList.create(null, texts.map(item));
const docOf = (...blocks: PMNode[]) => schema.nodes.doc.create(null, blocks);

// 커서를 첫 문단 텍스트의 offset 자리에 둔 상태
const stateAt = (doc: PMNode, pos: number) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, pos) });

describe("indentFirstListItem", () => {
  it("항목 하나뿐인 목록: 목록이 들여쓴 문단으로 바뀌고 커서 자리는 유지된다", () => {
    const doc = docOf(bullets("항목"));
    // doc > bulletList(1) > listItem(2) > paragraph(3) > "항목": "항" 뒤는 pos 4
    const tr = indentFirstListItem(stateAt(doc, 4), INDENT);
    expect(tr).not.toBeNull();
    const out = tr!.doc;
    expect(out.childCount).toBe(1);
    expect(out.firstChild!.type.name).toBe("paragraph");
    expect(out.firstChild!.textContent).toBe(INDENT + "- 항목");
    expect(tr!.selection.from).toBe(1 + INDENT.length + 2 + 1);
  });

  it("항목이 여럿이면 첫 항목만 문단이 되고 나머지는 목록으로 남는다", () => {
    const doc = docOf(bullets("하나", "둘"));
    const tr = indentFirstListItem(stateAt(doc, 3), INDENT);
    const out = tr!.doc;
    expect(out.childCount).toBe(2);
    expect(out.child(0).textContent).toBe(INDENT + "- 하나");
    expect(out.child(1).type.name).toBe("bulletList");
    expect(out.child(1).childCount).toBe(1);
    expect(out.child(1).textContent).toBe("둘");
  });

  it("번호 목록은 '1. '을 붙인다", () => {
    const doc = docOf(schema.nodes.orderedList.create(null, [item("첫째")]));
    const tr = indentFirstListItem(stateAt(doc, 3), INDENT);
    expect(tr!.doc.firstChild!.textContent).toBe(INDENT + "1. 첫째");
  });

  it("두 번째 항목(중첩 가능)이나 목록 밖에서는 아무것도 하지 않는다", () => {
    const doc = docOf(bullets("하나", "둘"));
    // "둘" 항목: bulletList(1) > item "하나"(2..7) > item 둘 시작 8, paragraph 9, 텍스트 10
    expect(indentFirstListItem(stateAt(doc, 10), INDENT)).toBeNull();
    const plain = docOf(schema.nodes.paragraph.create(null, schema.text("문단")));
    expect(indentFirstListItem(stateAt(plain, 2), INDENT)).toBeNull();
  });
});
