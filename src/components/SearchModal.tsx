import { useEffect, useMemo, useState } from "react";
import { QUICK_MEMO, searchNotes } from "../api";
import { openEditors } from "../openEditors";
import type { ReactNode } from "react";
import type { SearchHit } from "../api";

type Props = {
  currentPath: string | null; // 지금 보고 있는 메모 (Todo 화면이면 null)
  onClose: () => void;
  onSelectNote: (path: string) => void;
  onError: (msg: string) => void;
};

// 지금 보고 있는 메모 안에서 찾은 한 곳
type LocalHit = { from: number; to: number; snippet: string };

// 목록·키보드 이동은 두 구역을 이어 붙인 순서대로 다룬다
type Row = { kind: "local"; hit: LocalHit } | { kind: "note"; hit: SearchHit };

const LOCAL_LIMIT = 50; // 같은 메모에서 너무 많이 잡히면 목록이 의미가 없어진다
const SNIPPET_BEFORE = 24;
const SNIPPET_AFTER = 60;

// 검색어와 일치하는 부분을 <mark>로 강조 (대소문자 무시)
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${esc})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : part,
  );
}

// 찾은 자리 앞뒤를 잘라 한 줄짜리 미리보기로 만든다
function snippetAround(text: string, at: number, len: number): string {
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + len + SNIPPET_AFTER);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

// 편집기 본문에서 검색어가 나오는 자리를 앞에서부터 모은다.
// 서식(굵게 등) 경계로 잘린 글자는 각각 다른 텍스트 조각이라 그 경계를 걸친 단어는 잡히지 않는다.
function findInNote(path: string, query: string): LocalHit[] {
  const editor = openEditors.get(path);
  if (!editor) return [];
  const q = query.toLowerCase();
  const hits: LocalHit[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (hits.length >= LOCAL_LIMIT) return false;
    if (!node.isText || !node.text) return;
    const text = node.text;
    const lower = text.toLowerCase();
    let i = lower.indexOf(q);
    while (i !== -1 && hits.length < LOCAL_LIMIT) {
      hits.push({
        from: pos + i,
        to: pos + i + query.length,
        snippet: snippetAround(text, i, query.length),
      });
      i = lower.indexOf(q, i + q.length);
    }
  });
  return hits;
}

export default function SearchModal({
  currentPath,
  onClose,
  onSelectNote,
  onError,
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [index, setIndex] = useState(0);

  // 검색 (200ms 디바운스). 언마운트·재입력 시 늦게 도착한 응답은 무시
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchNotes(q)
        .then((h) => {
          if (!cancelled) {
            setHits(h);
            setIndex(0);
          }
        })
        .catch((e) => {
          if (!cancelled) onError(String(e));
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, onError]);

  const q = query.trim();
  // 위쪽은 지금 메모 안(즉시 계산), 아래쪽은 나머지 메모
  const localHits = useMemo(
    () => (q && currentPath ? findInNote(currentPath, q) : []),
    [q, currentPath],
  );
  const otherHits = hits.filter((h) => h.path !== currentPath);
  const rows: Row[] = [
    ...localHits.map((hit) => ({ kind: "local" as const, hit })),
    ...otherHits.map((hit) => ({ kind: "note" as const, hit })),
  ];
  const sectioned = q !== "" && currentPath !== null;

  // 목록이 바뀌면 선택 인덱스가 범위를 벗어날 수 있으므로 보정
  const activeIndex = rows.length === 0 ? 0 : Math.min(index, rows.length - 1);

  const activate = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "note") {
      onSelectNote(row.hit.path);
    } else if (currentPath) {
      // 찾은 자리를 선택해 화면에 보이게 한다
      openEditors
        .get(currentPath)
        ?.chain()
        .focus()
        .setTextSelection({ from: row.hit.from, to: row.hit.to })
        .scrollIntoView()
        .run();
    }
    onClose();
  };

  const item = (row: Row, i: number) => (
    <li
      key={row.kind === "note" ? row.hit.path : `local-${row.hit.from}`}
      className={"palette-item search-hit" + (i === activeIndex ? " active" : "")}
      onMouseMove={() => setIndex(i)}
      onClick={() => activate(row)}
    >
      {row.kind === "note" && (
        <span className="hit-name">
          {row.hit.path === QUICK_MEMO
            ? "⚡ 빠른 메모"
            : highlight(row.hit.name.replace(/\.md$/i, ""), query)}
        </span>
      )}
      {row.hit.snippet && <span className="hit-snippet">{highlight(row.hit.snippet, query)}</span>}
    </li>
  );

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="command-palette" role="dialog" aria-label="메모 검색">
        <input
          className="palette-input"
          autoFocus
          spellCheck={false}
          placeholder="메모 검색…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            // 모달이 열려 있는 동안 전역 단축키로 이벤트가 새지 않게 격리
            e.stopPropagation();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => (rows.length ? (Math.min(i, rows.length - 1) + 1) % rows.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => {
                const cur = Math.min(i, rows.length - 1);
                return rows.length ? (cur - 1 + rows.length) % rows.length : 0;
              });
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(rows[activeIndex]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette-list">
          {q !== "" && rows.length === 0 && !sectioned && <li className="palette-empty">결과 없음</li>}
          {sectioned && <li className="palette-section">이 메모</li>}
          {sectioned && localHits.length === 0 && <li className="palette-none">결과 없음</li>}
          {localHits.map((hit, i) => item({ kind: "local", hit }, i))}
          {sectioned && <li className="palette-section">다른 메모</li>}
          {sectioned && otherHits.length === 0 && <li className="palette-none">결과 없음</li>}
          {otherHits.map((hit, i) => item({ kind: "note", hit }, localHits.length + i))}
        </ul>
      </div>
    </>
  );
}
