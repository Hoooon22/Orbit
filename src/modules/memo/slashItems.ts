import { isChosungQuery, matchesChosung } from "../../shared/hangul";

// "/" 메뉴 항목 (노션의 블록 고르기). 실제 실행은 Editor.tsx가 id로 분기한다.
export type SlashId =
  | "text"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "number"
  | "todo"
  | "quote"
  | "divider"
  | "code"
  | "table"
  | "page";

export type SlashItem = { id: SlashId; label: string; hint: string; icon: string; keywords: string[] };

export const SLASH_ITEMS: SlashItem[] = [
  { id: "text", label: "텍스트", hint: "일반 문단", icon: "T", keywords: ["text", "paragraph", "본문", "문단"] },
  { id: "h1", label: "제목 1", hint: "가장 큰 제목", icon: "H1", keywords: ["h1", "heading", "title", "제목1"] },
  { id: "h2", label: "제목 2", hint: "중간 제목", icon: "H2", keywords: ["h2", "heading", "제목2"] },
  { id: "h3", label: "제목 3", hint: "작은 제목", icon: "H3", keywords: ["h3", "heading", "제목3"] },
  { id: "bullet", label: "글머리 기호 목록", hint: "- 항목", icon: "•", keywords: ["bullet", "list", "ul", "기호", "목록"] },
  { id: "number", label: "번호 목록", hint: "1. 항목", icon: "1.", keywords: ["number", "ordered", "ol", "번호", "목록"] },
  { id: "todo", label: "할 일 목록", hint: "체크 상자", icon: "☐", keywords: ["todo", "task", "check", "checkbox", "체크", "할일"] },
  { id: "quote", label: "인용", hint: "> 인용문", icon: "❝", keywords: ["quote", "blockquote", "인용문"] },
  { id: "divider", label: "구분선", hint: "---", icon: "—", keywords: ["divider", "hr", "rule", "선"] },
  { id: "code", label: "코드", hint: "코드 블록", icon: "</>", keywords: ["code", "pre", "코드블록"] },
  { id: "table", label: "표", hint: "3×3 표", icon: "▦", keywords: ["table", "grid", "테이블"] },
  { id: "page", label: "페이지", hint: "이 메모 안에 새 페이지", icon: "📄", keywords: ["page", "subpage", "하위", "하위페이지", "새페이지"] },
];

// 질의로 항목을 거른다. 라벨·별칭의 부분 일치, 한글은 초성("ㅈㅁ" → 제목)으로도 찾는다. 빈 질의면 전부.
export function filterSlashItems(query: string, items: SlashItem[] = SLASH_ITEMS): SlashItem[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return items;
  return items.filter((it) => {
    const hay = [it.label, ...it.keywords].map((s) => s.toLowerCase().replace(/\s+/g, ""));
    if (hay.some((s) => s.includes(q))) return true;
    return isChosungQuery(q) && hay.some((s) => matchesChosung(q, s) >= 0);
  });
}
