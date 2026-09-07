import { useMemo, useState } from "react";
import { QUICK_MEMO, showDashboard, TODO_VIEW } from "../../shared/api";
import type { TreeNode } from "../../shared/api";
import { fuzzyScore } from "../../shared/fuzzy";
import { flattenNotes } from "../../modules/memo/flatten";

type Props = {
  tree: TreeNode[];
  onClose: () => void;
  onSelectNote: (path: string) => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onHelp: () => void;
};

type Item = {
  key: string;
  icon: string;
  label: string;
  hint?: string; // 노트가 속한 폴더 경로 등 보조 표시
  run: () => void;
};

function noteHint(path: string): string | undefined {
  const i = path.lastIndexOf("/");
  return i === -1 ? undefined : path.slice(0, i).replace(/\//g, " / ");
}

export default function CommandPalette({
  tree,
  onClose,
  onSelectNote,
  onNewNote,
  onNewFolder,
  onHelp,
}: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  // 고정 명령 + 모든 노트로 후보 목록 구성 (트리 변경/열림마다 재계산)
  const allItems = useMemo<Item[]>(() => {
    const commands: Item[] = [
      { key: "cmd:quick", icon: "⚡", label: "빠른 메모 열기", run: () => onSelectNote(QUICK_MEMO) },
      { key: "cmd:todo", icon: "☑️", label: "Todo 열기", run: () => onSelectNote(TODO_VIEW) },
      { key: "cmd:new-note", icon: "📝", label: "새 메모", run: onNewNote },
      { key: "cmd:new-folder", icon: "📁", label: "새 폴더", run: onNewFolder },
      { key: "cmd:orbit", icon: "🪐", label: "Orbit 열기", run: () => void showDashboard() },
      { key: "cmd:settings", icon: "⚙️", label: "Orbit 설정", run: () => void showDashboard("settings") },
      { key: "cmd:help", icon: "❓", label: "도움말 · 단축키", run: onHelp },
    ];
    const notes: Item[] = flattenNotes(tree).map((n) => ({
      key: n.path,
      icon: "📄",
      label: n.name.replace(/\.md$/i, ""),
      hint: noteHint(n.path),
      run: () => onSelectNote(n.path),
    }));
    return [...commands, ...notes];
  }, [tree, onSelectNote, onNewNote, onNewFolder, onHelp]);

  const results = useMemo<Item[]>(() => {
    const q = query.trim();
    if (!q) return allItems.slice(0, 50);
    return allItems
      .map((it) => ({ it, score: fuzzyScore(q, it.label) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.it);
  }, [query, allItems]);

  // 목록이 바뀌면 선택 인덱스가 범위를 벗어날 수 있으므로 보정
  const activeIndex = results.length === 0 ? 0 : Math.min(index, results.length - 1);

  const activate = (item: Item | undefined) => {
    if (!item) return;
    item.run();
    onClose();
  };

  return (
    <>
      <div className="palette-backdrop" onClick={onClose} />
      <div className="command-palette" role="dialog" aria-label="빠른 이동">
        <input
          className="palette-input"
          autoFocus
          spellCheck={false}
          placeholder="노트 이동 또는 명령 실행…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            // 팔레트가 열려 있는 동안 전역 단축키로 이벤트가 새지 않게 격리
            e.stopPropagation();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => (results.length ? (Math.min(i, results.length - 1) + 1) % results.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => {
                const cur = Math.min(i, results.length - 1);
                return results.length ? (cur - 1 + results.length) % results.length : 0;
              });
            } else if (e.key === "Enter") {
              e.preventDefault();
              activate(results[activeIndex]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette-list">
          {results.length === 0 && <li className="palette-empty">결과 없음</li>}
          {results.map((it, i) => (
            <li
              key={it.key}
              className={"palette-item" + (i === activeIndex ? " active" : "")}
              onMouseMove={() => setIndex(i)}
              onClick={() => activate(it)}
            >
              <span className="palette-icon">{it.icon}</span>
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
