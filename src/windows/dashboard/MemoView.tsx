import { useEffect, useMemo, useState } from "react";
import {
  createFolder,
  createNote,
  deleteEntry,
  moveEntry,
  QUICK_MEMO,
  renameEntry,
  reorderEntry,
} from "../../shared/api";
import type { TreeNode } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { useSettings } from "../../shared/stores/settings";
import { collectNotePaths, useMemoStore } from "../../modules/memo/store";
import { noteName } from "../../modules/memo/flatten";
import {
  closeTab,
  cycleTab,
  openTab,
  placeTab,
  pruneTabs,
  remapTabs,
  reorderTabs,
  useTabs,
} from "../../modules/memo/tabs";
import Tree from "../../modules/memo/Tree";
import Favorites from "../../modules/memo/Favorites";
import Editor from "../../modules/memo/Editor";
import SearchModal from "../../modules/memo/SearchModal";
import TabBar from "../../modules/memo/TabBar";

type Props = {
  requested: { path: string; seq: number } | null; // 캘린더·단축키 등에서 "이 메모 열어 줘"
};

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function remapPath(current: string, oldPath: string, newPath: string): string {
  if (current === oldPath) return newPath;
  if (current.startsWith(oldPath + "/")) return newPath + current.slice(oldPath.length);
  return current;
}

function allFolderPaths(nodes: TreeNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.isDir) {
      out.add(n.path);
      if (n.children) allFolderPaths(n.children, out);
    }
  }
  return out;
}

// 메모 화면: 왼쪽 트리(빠른 메모·즐겨찾기·폴더), 오른쪽은 크롬처럼 탭 줄과 편집기. Ctrl+F로 제목·본문 검색.
// 메모를 열면 늘 새 탭이 생기고(이미 열려 있으면 그 탭으로), 목록의 메모를 탭 줄에 끌어다 놓아도 된다.
// 열린 탭은 다시 켜도 그대로다(tabs.ts).
export default function MemoView({ requested }: Props) {
  const tree = useMemoStore((s) => s.tree);
  const favorites = useMemoStore((s) => s.favorites);
  const refreshTree = useMemoStore((s) => s.refreshTree);
  const toggleFavorite = useMemoStore((s) => s.toggleFavorite);
  const remapFavorites = useMemoStore((s) => s.remapFavorites);
  const reorderFavorite = useMemoStore((s) => s.reorderFavorite);
  const tabs = useTabs((s) => s.tabs);
  const selected = useTabs((s) => s.active);
  const applyTabs = useTabs((s) => s.apply);

  const [targetDir, setTargetDir] = useState(() => (selected === QUICK_MEMO ? "" : parentDir(selected)));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [collapsedOnce, setCollapsedOnce] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // 목록 너비: 경계선을 끌어 조절하고 설정에 저장 (긴 제목이 잘리지 않게 넓힐 수 있다)
  const sideWidth = useSettings((s) => s.settings.memoSideWidth);
  const updateSettings = useSettings((s) => s.update);
  const [resizing, setResizing] = useState(false);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideWidth;
    setResizing(true);
    const onMove = (ev: MouseEvent) =>
      updateSettings({ memoSideWidth: Math.min(600, Math.max(160, startW + ev.clientX - startX)) });
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 메모를 연다 (탭 규칙은 tabs.ts). 하위 페이지·탭으로 연 메모도 트리에서 보이게 그 폴더를 펼친다
  const selectNote = (path: string) => {
    applyTabs((t) => openTab(t, path));
    setTargetDir(path === QUICK_MEMO ? "" : parentDir(path));
    expandTo(parentDir(path));
  };

  // 밖에서 열어 달라는 메모 (같은 경로를 다시 요청해도 seq가 바뀌어 반응한다)
  useEffect(() => {
    if (!requested) return;
    selectNote(requested.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  // Ctrl+F 검색 (검색창이 열려 있을 때 Esc는 검색창만 닫는다), Ctrl+W 탭 닫기, Ctrl+Tab 옆 탭, Ctrl+T 새 탭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!e.shiftKey && k === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (!e.shiftKey && k === "w") {
        e.preventDefault();
        applyTabs((t) => closeTab(t, t.active));
      } else if (k === "tab") {
        e.preventDefault();
        applyTabs((t) => cycleTab(t, e.shiftKey ? -1 : 1));
      } else if (!e.shiftKey && k === "t") {
        e.preventDefault();
        void newNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDir]);

  // 처음 트리를 받으면 폴더를 모두 접어 둔다 (보던 메모의 폴더만 펼침)
  useEffect(() => {
    if (tree.length === 0 || collapsedOnce) return;
    setCollapsedOnce(true);
    const all = allFolderPaths(tree);
    for (let p = parentDir(selected); p; p = parentDir(p)) all.delete(p);
    setCollapsed(all);
  }, [tree, collapsedOnce, selected]);

  const notePaths = useMemo(() => {
    const s = new Set<string>();
    collectNotePaths(tree, s);
    return s;
  }, [tree]);
  const visibleFavorites = useMemo(
    () => favorites.filter((p) => notePaths.has(p)),
    [notePaths, favorites],
  );

  // 보고 있던 메모가 사라지면(삭제·외부 변경) 그 탭을 닫는다
  useEffect(() => {
    if (tree.length > 0) applyTabs((t) => pruneTabs(t, (p) => notePaths.has(p)));
  }, [tree, notePaths, applyTabs]);

  // 하위 페이지면 위 페이지들(헤더의 경로 표시). "폴더/회의/안건.md"의 부모는 "폴더/회의.md"
  const ancestors = useMemo(() => {
    const out: { path: string; name: string }[] = [];
    for (let dir = parentDir(selected); dir; dir = parentDir(dir)) {
      const p = `${dir}.md`;
      if (notePaths.has(p)) out.unshift({ path: p, name: noteName(p) });
    }
    return out;
  }, [selected, notePaths]);

  const expandTo = (dir: string) => {
    if (!dir) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (let p = dir; p; p = parentDir(p)) next.delete(p);
      return next;
    });
  };

  const follow = (oldPath: string, newPath: string) => {
    applyTabs((t) => remapTabs(t, oldPath, newPath));
    setTargetDir((d) => remapPath(d, oldPath, newPath));
    remapFavorites(oldPath, newPath);
  };

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await refreshTree();
    } catch (e) {
      reportError(e);
    }
  };

  const newNote = (dir = targetDir) =>
    run(async () => {
      const path = await createNote(dir);
      expandTo(dir);
      selectNote(path);
      setRenamingPath(path);
    });

  const newFolder = () =>
    run(async () => {
      const path = await createFolder(targetDir);
      expandTo(targetDir);
      setTargetDir(path);
      setRenamingPath(path);
    });

  const rename = async (path: string, newName: string): Promise<boolean> => {
    try {
      const newPath = await renameEntry(path, newName);
      follow(path, newPath);
      await refreshTree();
      return true;
    } catch (e) {
      reportError(e);
      return false;
    }
  };

  const move = (path: string, dir: string) => {
    setDragging(null);
    if (!path || parentDir(path) === dir || dir === path || dir.startsWith(path + "/")) return;
    void run(async () => {
      const newPath = await moveEntry(path, dir);
      expandTo(dir);
      follow(path, newPath);
    });
  };

  const reorder = (path: string, dir: string, index: number) => {
    setDragging(null);
    if (!path || dir === path || dir.startsWith(path + "/")) return;
    void run(async () => {
      const newPath = await reorderEntry(path, dir, index);
      expandTo(dir);
      follow(path, newPath);
    });
  };

  const remove = (path: string) => {
    setDragging(null);
    if (!path) return;
    void run(async () => {
      await deleteEntry(path); // Windows 휴지통으로 간다
      applyTabs((t) => pruneTabs(t, (p) => p !== path && !p.startsWith(path + "/")));
    });
  };

  return (
    <div
      className={"memo-view" + (resizing ? " resizing" : "")}
      style={{ gridTemplateColumns: `${sideWidth}px 6px 1fr` }}
    >
      <aside className="memo-side">
        <div className="memo-side-actions">
          <button onClick={() => void newFolder()} title="새 폴더">
            + 폴더
          </button>
          <button onClick={() => void newNote()} title="새 메모">
            + 메모
          </button>
          <button
            className="memo-open-full"
            onClick={() => setSearchOpen(true)}
            title="제목과 본문에서 찾기 (Ctrl+F)"
          >
            🔍 검색
          </button>
        </div>
        <div className="pinned">
          <button
            className={"quick-memo" + (selected === QUICK_MEMO ? " selected" : "")}
            onClick={() => selectNote(QUICK_MEMO)}
          >
            <span className="pinned-icon">⚡</span>빠른 메모
          </button>
        </div>
        {visibleFavorites.length > 0 && (
          <Favorites
            favorites={visibleFavorites}
            selected={selected}
            onSelect={selectNote}
            onUnfavorite={toggleFavorite}
            onReorder={reorderFavorite}
          />
        )}
        <nav
          className="tree"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const dragged = e.dataTransfer.getData("text/plain");
            if (dragged) reorder(dragged, "", tree.filter((n) => n.path !== dragged).length);
          }}
        >
          <Tree
            nodes={tree}
            parentDir=""
            dragging={dragging}
            selected={selected}
            targetDir={targetDir}
            collapsed={collapsed}
            renamingPath={renamingPath}
            onSelectNote={selectNote}
            onSelectFolder={setTargetDir}
            onToggle={(path) =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(path)) next.delete(path);
                else next.add(path);
                return next;
              })
            }
            onRename={rename}
            onStartRename={setRenamingPath}
            onEndRename={() => setRenamingPath(null)}
            onMove={move}
            onReorder={reorder}
            onDelete={remove}
            onNewNoteIn={(dir) => void newNote(dir)}
            onContextMenu={() => {}}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
          />
        </nav>
      </aside>
      <div className="memo-resizer" onMouseDown={startResize} title="드래그하여 목록 너비 조절" />
      <div className="memo-main">
        <TabBar
          tabs={tabs}
          active={selected}
          onActivate={selectNote}
          onClose={(p) => applyTabs((t) => closeTab(t, p))}
          onReorder={(d, target, pos) => applyTabs((t) => reorderTabs(t, d, target, pos))}
          onPlace={(p, i) => {
            applyTabs((t) => placeTab(t, p, i));
            setTargetDir(parentDir(p));
          }}
          onNew={() => void newNote()}
        />
        <Editor
          key={selected}
          path={selected}
          onRename={(name) => rename(selected, name)}
          isFavorite={favorites.includes(selected)}
          onToggleFavorite={() => toggleFavorite(selected)}
          onOpenNote={selectNote}
          ancestors={ancestors}
        />
      </div>
      {searchOpen && (
        <SearchModal
          currentPath={selected}
          onClose={() => setSearchOpen(false)}
          onSelectNote={selectNote}
          onError={reportError}
        />
      )}
    </div>
  );
}
