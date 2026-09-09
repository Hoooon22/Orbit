// 런처의 "/" 명령: Orbit 화면 이동과 몇 가지 동작. "/메모", "/memo"처럼 한글·영문 별칭을 모두 받는다.

import { fuzzyScore } from "../../shared/fuzzy";
import { chosung, isChosungQuery } from "../../shared/hangul";

export type CommandId =
  | "home"
  | "ai"
  | "memo"
  | "todo"
  | "calendar"
  | "clipboard"
  | "launcher"
  | "settings"
  | "sync"
  | "hide";

export type Command = { id: CommandId; icon: string; label: string; aliases: string[] };

export const COMMANDS: Command[] = [
  { id: "home", icon: "🏠", label: "홈", aliases: ["홈", "home"] },
  { id: "ai", icon: "▮", label: "AI 터미널", aliases: ["ai", "터미널", "claude", "terminal"] },
  { id: "memo", icon: "📝", label: "메모", aliases: ["메모", "memo", "note"] },
  { id: "todo", icon: "☑️", label: "할 일", aliases: ["할일", "할 일", "todo"] },
  { id: "calendar", icon: "📅", label: "캘린더", aliases: ["캘린더", "달력", "일정", "calendar", "cal"] },
  { id: "clipboard", icon: "📋", label: "클립보드", aliases: ["클립보드", "클립", "clipboard", "clip"] },
  { id: "launcher", icon: "🚀", label: "런처 설정", aliases: ["런처", "launcher"] },
  { id: "settings", icon: "⚙️", label: "설정", aliases: ["설정", "settings", "config"] },
  { id: "sync", icon: "⟳", label: "구글 캘린더 지금 동기화", aliases: ["동기화", "sync"] },
  { id: "hide", icon: "×", label: "Orbit 창 숨기기", aliases: ["숨기기", "닫기", "hide", "close"] },
];

// 별칭 하나에 대한 점수. 앞부분 일치 > 포함 > 초성 > 퍼지. 못 맞추면 -1.
function aliasScore(q: string, alias: string): number {
  const a = alias.toLowerCase().replace(/\s/g, "");
  if (!q) return 0;
  if (a.startsWith(q)) return 30 - a.length;
  if (a.includes(q)) return 20;
  if (isChosungQuery(q) && chosung(a).includes(q)) return 10;
  const f = fuzzyScore(q, a);
  return f >= 0 ? f : -1;
}

// "/" 뒤의 질의로 명령을 찾는다. 빈 질의면 전부.
export function matchCommands(query: string): Command[] {
  const q = query.trim().toLowerCase().replace(/\s/g, "");
  return COMMANDS.map((c) => ({ c, score: Math.max(...c.aliases.map((a) => aliasScore(q, a))) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.c);
}
