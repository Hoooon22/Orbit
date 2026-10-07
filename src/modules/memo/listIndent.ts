import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";

// 목록의 첫 항목은 위 항목이 없어 Tab으로 중첩(sinkListItem)이 안 된다.
// 그럴 때 항목을 일반 문단으로 풀고 앞에 공백 들여쓰기 + 글머리 글자("- ", "1. ")를 붙여
// 글머리가 글과 함께 오른쪽으로 옮겨진 것처럼 보이게 한다. 마크다운에는 그 문단이 글자 그대로 남는다.
// 맨 바깥 목록의, 문단 하나만 든 항목에서만 동작한다. 해당하지 않으면 null.
export function indentFirstListItem(state: EditorState, indent: string): Transaction | null {
  const { $from } = state.selection;
  let itemDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "listItem") {
      itemDepth = d;
      break;
    }
  }
  if (itemDepth < 1) return null;
  const listDepth = itemDepth - 1;
  const item = $from.node(itemDepth);
  const list = $from.node(listDepth);
  // 첫 항목이 아니면 sinkListItem이 이미 처리했을 것이고, 중첩된 목록 안은 건드리지 않는다
  if (listDepth !== 1 || $from.index(listDepth) !== 0) return null;
  const para = item.firstChild;
  if (item.childCount !== 1 || !para || para.type.name !== "paragraph") return null;

  const marker = list.type.name === "orderedList" ? "1. " : "- ";
  const prefix = indent + marker;
  const newPara = para.type.create(para.attrs, Fragment.from(state.schema.text(prefix)).append(para.content));
  const listStart = $from.before(listDepth);
  const offset = $from.parent === para ? $from.parentOffset : 0;

  const tr = state.tr;
  if (list.childCount === 1) {
    tr.replaceWith(listStart, $from.after(listDepth), newPara);
  } else {
    tr.delete($from.before(itemDepth), $from.after(itemDepth));
    tr.insert(listStart, newPara);
  }
  tr.setSelection(TextSelection.create(tr.doc, listStart + 1 + prefix.length + offset));
  return tr;
}
