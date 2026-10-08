import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import ListItem from "@tiptap/extension-list-item";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { liftListItem } from "@tiptap/pm/schema-list";
import type { Node as PMNode } from "@tiptap/pm/model";
import { nestFirstListItem } from "./listIndent";

// Editor.tsx와 같은 스키마: 목록 항목이 문단 없이 목록으로 시작할 수 있다
const schema = getSchema([StarterKit.configure({ listItem: false }), ListItem.extend({ content: "block+" })]);

const item = (text: string) =>
  schema.nodes.listItem.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
const bullets = (...texts: string[]) => schema.nodes.bulletList.create(null, texts.map(item));
const docOf = (...blocks: PMNode[]) => schema.nodes.doc.create(null, blocks);
const stateAt = (doc: PMNode, pos: number) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, pos) });

describe("nestFirstListItem", () => {
  it("첫 항목이 빈 상위 항목 아래의 안쪽 항목이 되고 나머지 항목은 그대로", () => {
    const doc = docOf(bullets("하나", "둘"));
    // doc > bulletList(1) > listItem(2) > paragraph(3) > "하나": "하" 뒤는 pos 4
    const tr = nestFirstListItem(stateAt(doc, 4));
    expect(tr).not.toBeNull();
    const out = tr!.doc;
    expect(out.check()).toBeUndefined(); // 스키마에 맞는 문서
    expect(out.toJSON()).toEqual(
      docOf(
        schema.nodes.bulletList.create(null, [
          schema.nodes.listItem.create(null, bullets("하나")),
          item("둘"),
        ]),
      ).toJSON(),
    );
    // 커서는 여전히 "하" 뒤
    expect(tr!.selection.$from.parent.textContent).toBe("하나");
    expect(tr!.selection.$from.parentOffset).toBe(1);
  });

  it("번호 목록은 번호 목록으로 감싼다", () => {
    const doc = docOf(schema.nodes.orderedList.create(null, [item("첫째")]));
    const out = nestFirstListItem(stateAt(doc, 3))!.doc;
    expect(out.firstChild!.firstChild!.firstChild!.type.name).toBe("orderedList");
  });

  it("Shift+Tab(liftListItem)으로 되돌리면 원래 목록으로 돌아온다", () => {
    const doc = docOf(bullets("하나", "둘"));
    let state = stateAt(doc, 4);
    state = state.apply(nestFirstListItem(state)!);
    const lifted = liftListItem(schema.nodes.listItem)(state, (tr) => (state = state.apply(tr)));
    expect(lifted).toBe(true);
    expect(state.doc.toJSON()).toEqual(doc.toJSON());
  });

  it("목록 밖에서는 아무것도 하지 않는다", () => {
    const plain = docOf(schema.nodes.paragraph.create(null, schema.text("문단")));
    expect(nestFirstListItem(stateAt(plain, 2))).toBeNull();
  });
});
