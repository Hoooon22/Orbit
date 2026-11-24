import { useEffect, useMemo, useRef, useState } from "react";
import { QUICK_MEMO, searchNotes } from "../../shared/api";
import type { LaunchItem, SearchHit, Todo } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { noteName } from "../memo/flatten";
import { useMemoStore } from "../memo/store";
import { useTodos } from "../todo/store";
import { matchCommands } from "../launcher/commands";
import type { Command, CommandId } from "../launcher/commands";
import { rankItems } from "../launcher/rank";
import { useLauncher } from "../launcher/store";
import { matchNotes, matchTodos, recentNotes } from "./match";

type Props = {
  onClose: () => void;
  onOpenMemo: (path: string) => void;
  onOpenTodos: () => void;
  onCommand: (id: CommandId) => void;
  onLaunched: () => void; // 앱을 실행한 뒤 창을 숨긴다
  shortcuts: Partial<Record<CommandId, string>>; // 명령 옆에 보여 줄 단축키 (쓰면서 익히게)
};

type Row =
  | { kind: "note"; path: string; snippet?: string }
  | { kind: "todo"; todo: Todo }
  | { kind: "cmd"; cmd: Command }
  | { kind: "app"; item: LaunchItem };

type Section = { title: string; rows: Row[] };

const NO_HITS: SearchHit[] = [];
const QUICK_LABEL = "빠른 메모";

const rowKey = (r: Row) =>
  r.kind === "note" ? "n:" + r.path : r.kind === "todo" ? "t:" + r.todo.id : r.kind === "cmd" ? "c:" + r.cmd.id : "a:" + r.item.id;

// 통합 검색 (Ctrl+K). 어느 화면에서든 메모(제목·본문)·할 일·Orbit 명령·앱을 한 번에 찾는다.
// 빈 입력에는 최근에 고친 메모, "/"로 시작하면 명령만.
export default function Palette({ onClose, onOpenMemo, onOpenTodos, onCommand, onLaunched, shortcuts }: Props) {
  const tree = useMemoStore((s) => s.tree);
  const todos = useTodos((s) => s.todos);
  const items = useLauncher((s) => s.items);
  const usage = useLauncher((s) => s.usage);
  const launch = useLauncher((s) => s.launch);
  const [query, setQuery] = useState("");
  // 본문 검색 결과와 그 결과를 낸 질의. 질의가 바뀌면 옛 결과는 쓰지 않는다
  const [found, setFound] = useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const q = query.trim();
  const onlyCommands = q.startsWith("/");
  const bodyHits = found.q === q ? found.hits : NO_HITS;

  // 닫히면 열기 전에 있던 곳(편집기 등)으로 포커스를 돌려준다. 안 그러면 글자가 어디에도 안 들어간다
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      if (prev?.isConnected) prev.focus();
    };
  }, []);

  // 본문 검색 (200ms 디바운스). 늦게 도착한 응답은 버린다
  useEffect(() => {
    if (!q || onlyCommands) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      searchNotes(q)
        .then((hits) => {
          if (cancelled) return;
          setFound({ q, hits });
          setIndex(0); // 행이 끼어들어 고른 자리가 다른 항목으로 바뀌지 않게 맨 위로
        })
        .catch((e) => {
          if (!cancelled) reportError(e);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, onlyCommands]);

  const sections = useMemo<Section[]>(() => {
    if (onlyCommands) {
      return [{ title: "명령", rows: matchCommands(q.slice(1)).map((cmd) => ({ kind: "cmd", cmd })) }];
    }
    // 빠른 메모는 트리에 없는 파일이라 따로 넣는다
    if (!q) {
      return [
        {
          title: "최근 메모",
          rows: [QUICK_MEMO, ...recentNotes(tree, 8).map((n) => n.path)].map((path) => ({ kind: "note", path })),
        },
      ];
    }
    // 제목이 맞은 메모 먼저, 그다음 본문에서만 맞은 메모
    const byTitle = [
      ...(QUICK_LABEL.includes(q) ? [QUICK_MEMO] : []),
      ...matchNotes(tree, q, 6).map((n) => n.path),
    ];
    const seen = new Set(byTitle);
    const notes: Row[] = [
      ...byTitle.map((path) => ({
        kind: "note" as const,
        path,
        snippet: bodyHits.find((h) => h.path === path)?.snippet,
      })),
      ...bodyHits
        .filter((h) => !seen.has(h.path))
        .slice(0, 6)
        .map((h) => ({ kind: "note" as const, path: h.path, snippet: h.snippet })),
    ];
    return [
      { title: "메모", rows: notes },
      { title: "할 일", rows: matchTodos(todos, q, 5).map((todo) => ({ kind: "todo", todo })) },
      { title: "명령", rows: matchCommands(q).slice(0, 4).map((cmd) => ({ kind: "cmd", cmd })) },
      { title: "앱", rows: rankItems(items, usage, q, Date.now(), 5).map((item) => ({ kind: "app", item })) },
    ].filter((s) => s.rows.length > 0) as Section[];
  }, [q, onlyCommands, tree, todos, items, usage, bodyHits]);

  const rows = sections.flatMap((s) => s.rows);
  const active = rows.length === 0 ? 0 : Math.min(index, rows.length - 1);

  // 키보드로 고른 항목이 보이게 따라 스크롤
  useEffect(() => {
    listRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    if (row.kind === "note") onOpenMemo(row.path);
    else if (row.kind === "todo") onOpenTodos();
    else if (row.kind === "cmd") onCommand(row.cmd.id);
    else {
      onLaunched();
      void launch(row.item.id);
    }
  };

  const label = (r: Row) =>
    r.kind === "note"
      ? r.path === QUICK_MEMO
        ? QUICK_LABEL
        : noteName(r.path)
      : r.kind === "todo"
        ? r.todo.text
        : r.kind === "cmd"
          ? r.cmd.label
          : r.item.name;

  // 오른쪽 흐린 글자: 메모는 폴더, 명령은 단축키(없으면 "/별칭"), 앱은 종류
  const hint = (r: Row) => {
    if (r.kind === "note") return r.path.includes("/") ? r.path.slice(0, r.path.lastIndexOf("/")) : undefined;
    if (r.kind === "cmd") return shortcuts[r.cmd.id] ?? "/" + r.cmd.aliases[0];
    if (r.kind === "app") return r.item.hint;
    return undefined;
  };

  let n = 0; // 구역을 건너 이어지는 순번 (키보드 이동용)
  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="command-palette" role="dialog" aria-label="통합 검색">
        <input
          className="palette-input"
          autoFocus
          spellCheck={false}
          placeholder="메모·할 일·명령·앱 찾기…  ( / 로 명령만 )"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            // 열려 있는 동안 전역 단축키(Esc 창 숨김, Ctrl+숫자)로 새지 않게 격리
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return; // 한글 조합 중의 Enter·화살표는 조합 확정용
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex(rows.length ? (active + 1) % rows.length : 0);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(rows.length ? (active - 1 + rows.length) % rows.length : 0);
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(rows[active]);
            } else if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "k")) {
              e.preventDefault();
              onClose();
            }
          }}
        />
        {/* 목록을 눌러도 입력칸이 포커스를 잃지 않게 (잃으면 Esc·단축키가 뒤 화면으로 샌다) */}
        <ul className="palette-list" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {rows.length === 0 && (
            <li className="palette-empty">{q ? "결과 없음" : "메모가 아직 없습니다"}</li>
          )}
          {sections.map((s) => (
            <li key={s.title} className="palette-group">
              <div className="palette-section">{s.title}</div>
              <ul>
                {s.rows.map((r) => {
                  const i = n++;
                  return (
                    <li
                      key={rowKey(r)}
                      className={"palette-item search-hit" + (i === active ? " active" : "")}
                      onMouseMove={() => setIndex(i)}
                      onClick={() => run(r)}
                    >
                      <span className="palette-row">
                        <span className="palette-label">{label(r)}</span>
                        {hint(r) && <span className="palette-hint">{hint(r)}</span>}
                      </span>
                      {r.kind === "note" && r.snippet && <span className="hit-snippet">{r.snippet}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
