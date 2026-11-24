import { useEffect } from "react";

// 단축키 도움말 (Ctrl+/ 또는 통합 검색의 "단축키 보기"). README의 단축키 표와 같은 내용을 앱 안에서 본다.

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "어디서든",
    rows: [
      ["Ctrl+K", "통합 검색 — 메모·할 일·명령·앱"],
      ["Ctrl+1~9", "왼쪽 레일 순서대로 화면 전환"],
      ["Ctrl+/", "이 단축키 목록"],
      ["Esc", "Orbit 창 숨기기"],
    ],
  },
  {
    title: "메모",
    rows: [
      ["Ctrl+F", "제목·본문 검색"],
      ["Ctrl+T / Ctrl+W", "새 메모를 새 탭으로 / 탭 닫기"],
      ["Ctrl+Tab", "옆 탭으로"],
      ["Ctrl+S", "즉시 저장"],
      ["/", "블록 메뉴 — 제목·목록·할 일·표·페이지"],
      ["[[", "다른 메모로 가는 링크 넣기"],
      ["Ctrl+B / I / E", "굵게 / 기울임 / 코드 (글자를 선택하면 메뉴로도)"],
      ["Tab / Shift+Tab", "들여쓰기 / 내어쓰기"],
      ["Ctrl+휠", "글자 크기 (Ctrl+0 기본값)"],
      ["F2 / Delete", "(목록의 행) 이름 바꾸기 / 삭제"],
    ],
  },
  {
    title: "다른 프로그램에서도 (설정에서 변경)",
    rows: [
      ["Alt+Space", "런처 열기"],
      ["Ctrl+Alt+M", "빠른 메모 열기"],
      ["Ctrl+Alt+C", "영역 캡처"],
    ],
  },
];

export default function ShortcutHelp({ onClose }: { onClose: () => void }) {
  // Esc는 이 창만 닫는다 (캡처 단계에서 먼저 받아 Orbit 창 숨김을 막는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation(); // Esc 한 번에 한 겹만 닫는다
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="command-palette shortcut-help" role="dialog" aria-label="단축키">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="palette-section">{g.title}</div>
            <dl>
              {g.rows.map(([keys, what]) => (
                <div key={keys} className="shortcut-row">
                  <dt>{keys}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </>
  );
}
