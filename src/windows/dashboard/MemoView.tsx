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
import { useMemoStore } from "../../modules/memo/store";
import Tree from "../../modules/memo/Tree";
import Favorites from "../../modules/memo/Favorites";
import Editor from "../../modules/memo/Editor";
import SearchModal from "../../modules/memo/SearchModal";

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

function collectNotePaths(nodes: TreeNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) collectNotePaths(n.children, out);
    } else out.add(n.path);
  }
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

// 메모 화면: 왼쪽 트리(빠른 메모·즐겨찾기·폴더), 오른쪽 편집기. Ctrl+F로 제목·본문 검색.
export default function MemoView({ requested }: Props) {
  const tree = useMemoStore((s) => s.tree);
  const favorites = useMemoStore((s) => s.favorites);
  const refreshTree = useMemoStore((s) => s.refreshTree);
  const toggleFavorite = useMemoStore((s) => s.toggleFavorite);
  const remapFavorites = useMemoStore((s) => s.remapFavorites);
  const reorderFavorite = useMemoStore((s) => s.reorderFavorite);

  const [selected, setSelected] = useState(QUICK_MEMO);
  const [targetDir, setTargetDir] = useState("");
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

  // 밖에서 열어 달라는 메모 (같은 경로를 다시 요청해도 seq가 바뀌어 반응한다)
  useEffect(() => {
    if (!requested) return;
    setSelected(requested.path);
    setTargetDir(requested.path === QUICK_MEMO ? "" : parentDir(requested.path));
    expandTo(parentDir(requested.path));
  }, [requested]);

  // Ctrl+F 검색 (검색창이 열려 있을 때 Esc는 검색창만 닫는다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 처음 트리를 받으면 폴더를 모두 접어 둔다
  useEffect(() => {
    if (tree.length === 0 || collapsedOnce) return;
    setCollapsedOnce(true);
    setCollapsed(allFolderPaths(tree));
  }, [tree, collapsedOnce]);

  const notePaths = useMemo(() => {
    const s = new Set<string>();
    collectNotePaths(tree, s);
    return s;
  }, [tree]);
  const visibleFavorites = useMemo(
    () => favorites.filter((p) => notePaths.has(p)),
    [notePaths, favorites],
  );

  // 보고 있던 메모가 사라지면(삭제·외부 변경) 빠른 메모로
  useEffect(() => {
    if (tree.length > 0 && selected !== QUICK_MEMO && !notePaths.has(selected))
      setSelected(QUICK_MEMO);
  }, [tree, notePaths, selected]);

  const selectNote = (path: string) => {
    setSelected(path);
    setTargetDir(path === QUICK_MEMO ? "" : parentDir(path));
  };

  const expandTo = (dir: string) => {
    if (!dir) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (let p = dir; p; p = parentDir(p)) next.delete(p);
      return next;
    });
  };

  const follow = (oldPath: string, newPath: string) => {
    setSelected((s) => remapPath(s, oldPath, newPath));
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
      if (selected === path || selected.startsWith(path + "/")) setSelected(QUICK_MEMO);
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
        <Editor
          key={selected}
          path={selected}
          onRename={(name) => rename(selected, name)}
          isFavorite={favorites.includes(selected)}
          onToggleFavorite={() => toggleFavorite(selected)}
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
