import { TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";

// 목록의 첫 항목은 위 항목이 없어 Tab으로 중첩(sinkListItem)이 안 된다.
// 그럴 때 항목을 같은 종류의 새 목록으로 감싸 한 단계 안쪽 항목으로 만든다(노션처럼 글머리째 들여쓰기).
//   - 항목   →   - (빈 상위 항목)
//                  - 항목
// 상위 항목은 CSS로 글머리를 숨겨 안쪽 글머리만 보이고, 마크다운에는 "- - 항목"으로 남는다.
// Shift+Tab(liftListItem)은 빈 상위 항목을 지우며 그대로 되돌린다.
// 커서가 목록 항목 안이 아니면 null.
export function nestFirstListItem(state: EditorState): Transaction | null {
  const { $from } = state.selection;
  let itemDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "listItem") {
      itemDepth = d;
      break;
    }
  }
  if (itemDepth < 1) return null;
  const item = $from.node(itemDepth);
  const list = $from.node(itemDepth - 1);
  const wrapped = item.type.create(null, list.type.create(null, item));
  const tr = state.tr.replaceWith($from.before(itemDepth), $from.after(itemDepth), wrapped);
  // 새 상위 항목·목록 여는 토큰 2개만큼 커서를 민다
  tr.setSelection(TextSelection.create(tr.doc, $from.pos + 2));
  return tr;
}
