import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import type { SlashId, SlashItem } from "./slashItems";
import type { SlashRange } from "./slash";

// "/" 메뉴 화면. 커서("/" 자리) 바로 아래에 뜨고 ↑↓로 고르고 Enter(키 처리는 Editor.tsx), 마우스로도 고른다.

type Props = {
  editor: TiptapEditor;
  range: SlashRange;
  items: SlashItem[];
  index: number;
  onHover: (i: number) => void;
  onPick: (id: SlashId) => void;
};

const MENU_W = 260;
const MENU_H = 320;

export default function SlashMenu({ editor, range, items, index, onHover, onPick }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // "/" 자리 바로 아래. 화면 아래쪽이면 위로, 오른쪽이면 왼쪽으로 붙인다
  useLayoutEffect(() => {
    try {
      const c = editor.view.coordsAtPos(range.from);
      const left = Math.max(8, Math.min(c.left, window.innerWidth - MENU_W - 8));
      const top = c.bottom + MENU_H > window.innerHeight ? Math.max(8, c.top - MENU_H - 4) : c.bottom + 4;
      setPos({ left, top });
    } catch {
      setPos(null);
    }
  }, [editor, range.from]);

  // 키보드로 고른 항목이 보이게 따라 스크롤
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!pos) return null;
  return (
    <div className="slash-menu" style={{ left: pos.left, top: pos.top, width: MENU_W, maxHeight: MENU_H }}>
      <ul className="palette-list" ref={listRef}>
        {items.map((it, i) => (
          <li
            key={it.id}
            className={"palette-item" + (i === index ? " active" : "")}
            onMouseMove={() => onHover(i)}
            // mousedown에서 막아야 편집기가 포커스를 잃지 않는다
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(it.id);
            }}
          >
            <span className="palette-icon slash-icon">{it.icon}</span>
            <span className="palette-label">{it.label}</span>
            <span className="palette-hint">{it.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
