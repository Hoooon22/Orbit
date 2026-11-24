import { useState } from "react";
import { BubbleMenu } from "@tiptap/react";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

// 글자를 끌어 선택하면 그 위에 뜨는 서식 메뉴 (노션처럼). 마크다운 문법이나 단축키를 몰라도
// 굵게·기울임·취소선·코드·링크·제목을 바꿀 수 있다. 코드 블록 안과 그림 선택에서는 뜨지 않는다.

type Props = { editor: TiptapEditor };

// 적은 주소를 마크다운 링크로 남을 수 있는 모양으로. 공백은 마크다운이 링크로 읽지 못해 %20으로,
// "example.com:8080"처럼 스킴이 없는 주소에는 https://를 붙인다.
function normalizeUrl(input: string): string {
  const url = input.trim().replace(/\s/g, "%20");
  if (!url) return "";
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
}

export default function SelectionMenu({ editor }: Props) {
  const [linkDraft, setLinkDraft] = useState<string | null>(null); // null이면 링크 입력칸 닫힘

  const applyLink = () => {
    const url = normalizeUrl(linkDraft ?? "");
    setLinkDraft(null);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: url }).run();
  };

  const btn = (label: string, title: string, on: boolean, run: () => void, cls = "") => (
    <button
      key={label}
      className={"sel-btn" + (on ? " on" : "") + (cls ? ` ${cls}` : "")}
      title={title}
      aria-label={title}
      // mousedown에서 막아야 편집기가 포커스(선택 범위)를 잃지 않는다
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {label}
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        maxWidth: "none",
        zIndex: 29, // 우클릭 메뉴(30)·검색창(40)보다 아래
        // 좁은 칸(홈의 빠른 메모)에서도 스크롤 칸에 잘리지 않게 화면 기준으로 띄운다
        popperOptions: { strategy: "fixed" },
        onHidden: () => setLinkDraft(null),
      }}
      shouldShow={({ editor, state, element }) =>
        state.selection instanceof TextSelection &&
        !state.selection.empty &&
        !editor.isActive("codeBlock") &&
        // 편집기(또는 이 메뉴의 링크 입력칸)에 포커스가 있을 때만
        (editor.view.hasFocus() || element.contains(document.activeElement))
      }
    >
      <div className="sel-menu">
        {linkDraft !== null ? (
          <input
            className="sel-link"
            value={linkDraft}
            autoFocus
            spellCheck={false}
            placeholder="주소 입력 후 Enter (비우면 링크 해제)"
            onChange={(e) => setLinkDraft(e.target.value)}
            onBlur={() => setLinkDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                // 창 숨김·패널 닫기(Esc)로 새지 않게
                e.preventDefault();
                e.stopPropagation();
                setLinkDraft(null);
                editor.commands.focus();
              }
            }}
          />
        ) : (
          <>
            {btn("B", "굵게 (Ctrl+B)", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "b")}
            {btn("I", "기울임 (Ctrl+I)", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "i")}
            {btn("S", "취소선 (Ctrl+Shift+S)", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "s")}
            {btn("<>", "코드 (Ctrl+E)", editor.isActive("code"), () => editor.chain().focus().toggleCode().run())}
            {btn("링크", "링크 걸기·고치기", editor.isActive("link"), () =>
              setLinkDraft((editor.getAttributes("link").href as string | undefined) ?? ""),
            )}
            {/* 표 칸 안의 제목은 마크다운 표로 저장할 때 사라지므로 표 안에서는 제목 버튼을 빼 둔다 */}
            {!editor.isActive("table") && (
              <>
                <span className="sel-sep" />
                {([1, 2, 3] as const).map((level) =>
                  btn(`H${level}`, `제목 ${level}`, editor.isActive("heading", { level }), () =>
                    editor.chain().focus().toggleHeading({ level }).run(),
                  ),
                )}
              </>
            )}
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
