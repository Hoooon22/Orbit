import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  createFolder,
  createNote,
  deleteEntry,
  isVirtualView,
  moveEntry,
  QUICK_MEMO,
  renameEntry,
  reorderEntry,
  restoreEntry,
  SETTINGS_VIEW,
  TODO_VIEW,
} from "../../shared/api";
import type { TreeNode } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { useError } from "../../shared/stores/error";
import { useMemoStore } from "../../modules/memo/store";
import { useTodos } from "../../modules/todo/store";
import Sidebar from "./Sidebar";
import SearchModal from "../../modules/memo/SearchModal";
import Editor from "../../modules/memo/Editor";
import TodoList from "../../modules/todo/TodoList";
import QuickAddTodo from "../../modules/todo/QuickAddTodo";
import HelpModal from "./HelpModal";
import CommandPalette from "./CommandPalette";
import TabBar from "./TabBar";
import SettingsView from "./SettingsView";

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function remapPath(current: string, oldPath: string, newPath: string): string {
  if (current === oldPath) return newPath;
  if (current.startsWith(oldPath + "/")) return newPath + current.slice(oldPath.length);
  return current;
}

// 트리에 실제로 존재하는 메모(파일) 경로 집합. 즐겨찾기에서 삭제·외부 변경으로
// 사라진 항목을 표시에서 걸러내는 데 쓴다.
function collectNotePaths(nodes: TreeNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.isDir) {
      if (n.children) collectNotePaths(n.children, out);
    } else {
      out.add(n.path);
    }
  }
}

// 트리 안의 모든 폴더 경로 (앱을 켤 때 전부 접어 두는 데 쓴다)
function allFolderPaths(nodes: TreeNode[], out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.isDir) {
      out.add(n.path);
      if (n.children) allFolderPaths(n.children, out);
    }
  }
  return out;
}

// 입력창·에디터 본문에 포커스가 있으면 Delete는 텍스트 편집용이므로 노트 삭제로 가로채면 안 된다
function isEditableTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable;
}

type CtxMenu = { x: number; y: number; path: string; isDir: boolean };
type Toast = { msg: string; undoPath?: string };
// 분할 뷰: 메모를 에디터 영역 가장자리에 드롭하면 그 방향에 두 번째 창이 열린다
type SplitDir = "left" | "right" | "top" | "bottom";
type Split = { path: string; dir: SplitDir };

// 설정 파일을 읽은 뒤에야 탭·테마 같은 초기 상태를 정할 수 있으므로 그때까지는 그리지 않는다
export default function WorkspaceGate() {
  const loaded = useSettings((s) => s.loaded);
  useEffect(() => {
    void useSettings.getState().init();
    useMemoStore.getState().init();
    useTodos.getState().init();
  }, []);
  return loaded ? <Workspace /> : null;
}

function Workspace() {
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.update);
  const { theme, pinned, sidebarWidth } = settings;

  const tree = useMemoStore((s) => s.tree);
  const favorites = useMemoStore((s) => s.favorites);
  const refreshTree = useMemoStore((s) => s.refreshTree);
  const toggleFavorite = useMemoStore((s) => s.toggleFavorite);
  const remapFavorites = useMemoStore((s) => s.remapFavorites);
  const reorderFavorite = useMemoStore((s) => s.reorderFavorite);

  // 할 일 목록은 사이드바 패널·전체 뷰·Ctrl+T 창이 공유한다
  const todos = useTodos((s) => s.todos);
  const addTodo = useTodos((s) => s.add);
  const patchTodo = useTodos((s) => s.patch);
  const removeTodo = useTodos((s) => s.remove);
  const reorderTodo = useTodos((s) => s.reorder);
  const setTodoDue = useTodos((s) => s.setDue);
  const setTodoReminder = useTodos((s) => s.setReminder);
  const pendingTodos = todos.filter((t) => !t.done).length;

  const error = useError((s) => s.error);
  const setError = useError((s) => s.setError);
  const clearError = useError((s) => s.clear);

  // 탭 상태는 설정 파일에서 시작해 바뀔 때마다 다시 적는다 (이 창이 하나뿐이라 충돌 없음)
  const [tabs, setTabs] = useState<string[]>(() => useSettings.getState().settings.tabs);
  const [selected, setSelected] = useState<string>(() => {
    const { tabs, activeTab } = useSettings.getState().settings;
    return tabs.includes(activeTab) ? activeTab : tabs[0];
  });
  const [targetDir, setTargetDir] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<string | null>(null);
  const [trashOver, setTrashOver] = useState(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [split, setSplit] = useState<Split | null>(null);
  const [splitHint, setSplitHint] = useState<SplitDir | null>(null);

  const toastTimer = useRef<number | undefined>(undefined);
  const collapseDone = useRef(false); // 첫 트리 로드에서만 전체 접기

  // 도움말은 다른 오버레이 위에 겹치지 않도록 열면서 나머지를 닫는다
  const openHelp = useCallback(() => {
    setPaletteOpen(false);
    setSearchOpen(false);
    setQuickAddOpen(false);
    setHelpOpen(true);
  }, []);

  useEffect(() => {
    updateSettings({ tabs });
  }, [tabs, updateSettings]);

  useEffect(() => {
    updateSettings({ activeTab: selected });
  }, [selected, updateSettings]);

  // 항상 위에 고정: 창에 반영한다 (값은 설정 파일에 있다)
  useEffect(() => {
    getCurrentWindow()
      .setAlwaysOnTop(pinned)
      .catch(setError);
  }, [pinned, setError]);

  // 사이드바-본문 경계 드래그로 너비 조절
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      updateSettings({ sidebarWidth: Math.min(480, Math.max(160, ev.clientX)) });
    };
    const onUp = () => {
      setResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 앱을 켤 때는 폴더를 모두 접어 둔다 (이후 접고 펼친 상태는 그대로 둔다)
  useEffect(() => {
    if (tree.length === 0 || collapseDone.current) return;
    collapseDone.current = true;
    setCollapsed(allFolderPaths(tree));
  }, [tree]);

  // 이름 변경·이동으로 경로가 바뀐 탭을 새 경로로 따라가게 한다
  const remapTabs = useCallback((oldPath: string, newPath: string) => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const r = remapPath(p, oldPath, newPath);
        if (r !== p) changed = true;
        return r;
      });
      return changed ? next : prev;
    });
  }, []);

  // 이름 변경·이동으로 경로가 바뀐 분할 창을 새 경로로 따라가게 한다
  const remapSplit = useCallback((oldPath: string, newPath: string) => {
    setSplit((s) => (s ? { ...s, path: remapPath(s.path, oldPath, newPath) } : s));
  }, []);

  // 트리에 실제로 존재하는 메모 경로 집합
  const notePaths = useMemo(() => {
    const s = new Set<string>();
    collectNotePaths(tree, s);
    return s;
  }, [tree]);

  // 표시용: 트리에 실제로 존재하는 즐겨찾기만 (삭제/외부 변경분 제외)
  const visibleFavorites = useMemo(
    () => favorites.filter((p) => notePaths.has(p)),
    [notePaths, favorites],
  );

  // 전역 단축키(Ctrl+Alt+M) → 빠른 메모 탭, 오브의 "워크스페이스에서 열기" → 해당 탭
  useEffect(() => {
    const openTab = (path: string) => {
      setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
      setSelected(path);
      setTargetDir(path === QUICK_MEMO || isVirtualView(path) ? "" : parentDir(path));
    };
    const unQuick = listen("open-quick-memo", () => openTab(QUICK_MEMO)).catch(() => () => {});
    const unNav = listen<string>("navigate", (e) => {
      if (e.payload) openTab(e.payload);
    }).catch(() => () => {});
    return () => {
      void unQuick.then((f) => f());
      void unNav.then((f) => f());
    };
  }, []);

  // 오류 메시지는 6초 뒤 자동으로 사라진다 (클릭하면 즉시 닫힘)
  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(clearError, 6000);
    return () => window.clearTimeout(t);
  }, [error, clearError]);

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const expandTo = (dir: string) => {
    if (!dir) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (let p = dir; p; p = parentDir(p)) next.delete(p);
      return next;
    });
  };

  // 탭 목록 변경 없이 활성 탭만 바꾼다
  const activate = useCallback((path: string) => {
    setSelected(path);
    setTargetDir(path === QUICK_MEMO || isVirtualView(path) ? "" : parentDir(path));
  }, []);

  // 노트를 탭으로 연다 (이미 열려 있으면 그 탭을 활성화)
  const selectNote = (path: string) => {
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    activate(path);
  };

  const closeTab = (path: string) => {
    const i = tabs.indexOf(path);
    if (i === -1) return;
    const next = tabs.filter((p) => p !== path);
    if (next.length === 0) {
      setTabs([QUICK_MEMO]);
      activate(QUICK_MEMO);
      return;
    }
    setTabs(next);
    if (selected === path) activate(next[Math.min(i, next.length - 1)]);
  };

  // 모든 탭을 닫는다 (탭이 하나도 없으면 안 되므로 빠른 메모만 남긴다)
  const closeAllTabs = () => {
    setTabs([QUICK_MEMO]);
    activate(QUICK_MEMO);
  };

  const closeOtherTabs = (path: string) => {
    setTabs([path]);
    activate(path);
  };

  const closeRightTabs = (path: string) => {
    const i = tabs.indexOf(path);
    if (i === -1) return;
    const next = tabs.slice(0, i + 1);
    setTabs(next);
    if (!next.includes(selected)) activate(path);
  };

  // 탭 드래그로 순서 변경 (즐겨찾기 reorder와 같은 방식)
  const reorderTab = (dragged: string, target: string, before: boolean) => {
    setTabs((prev) => {
      if (dragged === target) return prev;
      const without = prev.filter((p) => p !== dragged);
      const ti = without.indexOf(target);
      if (ti === -1) return prev;
      without.splice(before ? ti : ti + 1, 0, dragged);
      return without;
    });
  };

  const cycleTab = (dir: 1 | -1) => {
    if (tabs.length < 2) return;
    const i = tabs.indexOf(selected);
    activate(tabs[(i + dir + tabs.length) % tabs.length]);
  };

  // 활성 탭이 목록에서 사라지면(삭제·외부 변경 등) 첫 탭으로 되돌린다
  useEffect(() => {
    if (!tabs.includes(selected)) activate(tabs[0]);
  }, [tabs, selected, activate]);

  // 트리에 더 이상 존재하지 않는 노트 탭 정리 (외부 삭제·이전 세션의 잔재)
  useEffect(() => {
    if (tree.length === 0) return; // 초기 로드 전에는 판단하지 않는다
    const existing = new Set<string>();
    collectNotePaths(tree, existing);
    const ok = (p: string) => p === QUICK_MEMO || isVirtualView(p) || existing.has(p);
    setTabs((prev) => {
      if (prev.every(ok)) return prev;
      const next = prev.filter(ok);
      return next.length > 0 ? next : [QUICK_MEMO];
    });
    setSplit((s) => (s && !ok(s.path) ? null : s));
  }, [tree]);

  const selectFolder = (dir: string) => {
    setTargetDir(dir);
  };

  const handleNewNote = async (dir?: string) => {
    const target = dir ?? targetDir;
    try {
      const path = await createNote(target);
      void refreshTree();
      expandTo(target);
      selectNote(path); // 새 메모는 탭으로 연다
      setRenamingPath(path); // 만들자마자 이름부터 입력
    } catch (e) {
      setError(e);
    }
  };

  const handleNewFolder = async (dir?: string) => {
    const target = dir ?? targetDir;
    try {
      const path = await createFolder(target);
      void refreshTree();
      expandTo(target);
      setTargetDir(path);
      setRenamingPath(path);
    } catch (e) {
      setError(e);
    }
  };

  // 이름 변경·이동·순서 변경 뒤 경로를 따라가는 공통 처리
  const followPath = (path: string, newPath: string) => {
    setSelected((s) => remapPath(s, path, newPath));
    setTargetDir((d) => remapPath(d, path, newPath));
    remapTabs(path, newPath);
    remapFavorites(path, newPath);
    remapSplit(path, newPath);
  };

  const handleRename = async (path: string, newName: string): Promise<boolean> => {
    try {
      const newPath = await renameEntry(path, newName);
      void refreshTree();
      followPath(path, newPath);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };

  const handleMove = async (path: string, dir: string) => {
    setDragging(null);
    if (!path || parentDir(path) === dir) return;
    if (dir === path || dir.startsWith(path + "/")) return; // 자기 안으로 이동 금지
    try {
      const newPath = await moveEntry(path, dir);
      void refreshTree();
      expandTo(dir);
      followPath(path, newPath);
    } catch (e) {
      setError(e);
    }
  };

  const handleReorder = async (path: string, dir: string, index: number) => {
    setDragging(null);
    if (!path) return;
    if (dir === path || dir.startsWith(path + "/")) return; // 자기 안으로 이동 금지
    try {
      const newPath = await reorderEntry(path, dir, index);
      void refreshTree();
      expandTo(dir);
      followPath(path, newPath);
    } catch (e) {
      setError(e);
    }
  };

  const showToast = (t: Toast) => {
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };

  const handleDelete = async (path: string) => {
    setDragging(null);
    setTrashOver(false);
    if (!path) return;
    try {
      await deleteEntry(path);
      void refreshTree();
      // 삭제된 노트(또는 폴더 하위)의 탭을 닫는다. 활성 탭이 닫히면
      // "활성 탭 사라짐" 이펙트가 첫 탭으로 되돌린다.
      setTabs((prev) => {
        const next = prev.filter((p) => p !== path && !p.startsWith(path + "/"));
        return next.length > 0 ? next : [QUICK_MEMO];
      });
      setSplit((s) =>
        s && (s.path === path || s.path.startsWith(path + "/")) ? null : s,
      );
      setTargetDir((d) => (d === path || d.startsWith(path + "/") ? parentDir(path) : d));
      const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
      showToast({ msg: `"${name}" 삭제됨`, undoPath: path });
    } catch (e) {
      setError(e);
    }
  };

  const handleUndo = async () => {
    const path = toast?.undoPath;
    if (!path) return;
    setToast(null);
    try {
      await restoreEntry(path);
      void refreshTree();
      expandTo(parentDir(path));
    } catch (e) {
      setError(e);
    }
  };

  // 키보드: Ctrl+N 새 메모, Ctrl+Shift+N 새 폴더, F2 이름 바꾸기, Ctrl+F 검색,
  // Ctrl+T 할 일 추가, Delete 삭제, Ctrl+W 탭 닫기, Ctrl+(Shift+)Tab 탭 전환
  const actionsRef = useRef({
    selected: "",
    renaming: false,
    newNote: () => {},
    newFolder: () => {},
    del: () => {},
    closeTab: () => {},
    cycleTab: (() => {}) as (dir: 1 | -1) => void,
    toggleHelp: () => {},
  });
  useEffect(() => {
    actionsRef.current = {
      selected,
      renaming: renamingPath !== null,
      newNote: () => void handleNewNote(),
      newFolder: () => void handleNewFolder(),
      del: () => void handleDelete(selected),
      closeTab: () => closeTab(selected),
      cycleTab,
      toggleHelp: () => (helpOpen ? setHelpOpen(false) : openHelp()),
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionsRef.current;
      const realNote = a.selected && a.selected !== QUICK_MEMO && !isVirtualView(a.selected);
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        a.newNote();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        a.newFolder();
      } else if (e.key === "F1") {
        e.preventDefault();
        a.toggleHelp();
      } else if (e.key === "F2") {
        if (realNote) {
          e.preventDefault();
          setRenamingPath(a.selected);
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setQuickAddOpen((v) => !v);
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        a.closeTab();
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        a.cycleTab(e.shiftKey ? -1 : 1);
      } else if (e.key === "Delete" && !isEditableTarget(e.target)) {
        // 트리·폴더에 포커스가 있을 때만 동작(에디터 편집 중에는 위 가드가 막는다)
        if (realNote && !a.renaming) {
          e.preventDefault();
          a.del();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 분할로 열 수 있는 대상: 실제 메모 파일과 빠른 메모 (가상 뷰·폴더 제외)
  const canSplitPath = (p: string) => p === QUICK_MEMO || notePaths.has(p);

  // 에디터 영역 가장자리 20~25% 안쪽이면 해당 방향, 가운데면 null
  const splitZone = (e: React.DragEvent<HTMLElement>): SplitDir | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    if (fx < 0.2) return "left";
    if (fx > 0.8) return "right";
    if (fy < 0.25) return "top";
    if (fy > 0.75) return "bottom";
    return null;
  };

  const openCtxMenu = (node: TreeNode, x: number, y: number) => {
    setCtxMenu({
      x: Math.min(x, window.innerWidth - 180),
      y: Math.min(y, window.innerHeight - 170),
      path: node.path,
      isDir: node.isDir,
    });
  };

  // 탭 하나가 보여주는 화면: 가상 뷰(할 일·설정) 또는 메모 편집기
  const renderPane = (path: string) => {
    if (path === TODO_VIEW)
      return (
        <TodoList
          todos={todos}
          onAdd={addTodo}
          onPatch={patchTodo}
          onRemove={removeTodo}
          onReorder={reorderTodo}
          onSetDue={setTodoDue}
          onSetReminder={setTodoReminder}
        />
      );
    if (path === SETTINGS_VIEW) return <SettingsView />;
    return (
      <Editor
        path={path}
        onRename={(name) => handleRename(path, name)}
        isFavorite={favorites.includes(path)}
        onToggleFavorite={() => toggleFavorite(path)}
      />
    );
  };

  return (
    <div className="app" style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}>
      <Sidebar
        tree={tree}
        dragging={dragging}
        selected={selected}
        targetDir={targetDir}
        collapsed={collapsed}
        renamingPath={renamingPath}
        favorites={visibleFavorites}
        theme={theme}
        onQuickAddTodo={() => setQuickAddOpen(true)}
        onToggleTheme={() => updateSettings({ theme: theme === "dark" ? "light" : "dark" })}
        onSettings={() => selectNote(SETTINGS_VIEW)}
        onHelp={openHelp}
        onSelectNote={selectNote}
        onUnfavorite={toggleFavorite}
        onReorderFavorite={reorderFavorite}
        onSelectFolder={selectFolder}
        onToggle={toggleFolder}
        onNewNote={() => void handleNewNote()}
        onNewFolder={() => void handleNewFolder()}
        onRename={handleRename}
        onStartRename={setRenamingPath}
        onEndRename={() => setRenamingPath(null)}
        onMove={handleMove}
        onReorder={(p, d, i) => void handleReorder(p, d, i)}
        onDelete={handleDelete}
        onNewNoteIn={(dir) => void handleNewNote(dir)}
        onContextMenu={openCtxMenu}
        onDragStart={setDragging}
        onDragEnd={() => setDragging(null)}
      />
      <div
        className={"resizer" + (resizing ? " active" : "")}
        style={{ left: sidebarWidth }}
        onMouseDown={startResize}
        title="드래그하여 사이드바 너비 조절"
      />
      {resizing && <div className="resize-overlay" />}
      <main
        className="main"
        onDragOverCapture={(e) => {
          // 탭 드래그 또는 트리 메모 드래그일 때만 분할 힌트를 보여준다
          const isTab = e.dataTransfer.types.includes("text/orbit-tab");
          const isNote = dragging !== null && canSplitPath(dragging);
          if (!isTab && !isNote) return;
          if ((e.target as HTMLElement).closest(".tab-bar")) {
            setSplitHint(null); // 탭 바 위에서는 탭 순서 변경이 우선
            return;
          }
          // 캡처 단계에서 가로챈다 — 에디터(ProseMirror)가 드롭을 받아
          // 본문에 경로를 텍스트/링크로 삽입해 버리는 것을 막는다
          e.preventDefault();
          e.stopPropagation();
          const dir = splitZone(e);
          setSplitHint(dir);
          // 소스가 effectAllowed="move"로 시작하므로 반드시 move여야 드롭이 발화한다
          e.dataTransfer.dropEffect = dir ? "move" : "none";
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setSplitHint(null);
        }}
        onDropCapture={(e) => {
          const isTab = e.dataTransfer.types.includes("text/orbit-tab");
          const isNote = dragging !== null && canSplitPath(dragging);
          if (!isTab && !isNote) return;
          if ((e.target as HTMLElement).closest(".tab-bar")) return;
          e.preventDefault();
          e.stopPropagation();
          const dir = splitHint;
          setSplitHint(null);
          if (!dir) return;
          const path =
            e.dataTransfer.getData("text/orbit-tab") ||
            e.dataTransfer.getData("text/plain");
          if (!path || !canSplitPath(path)) return;
          setSplit({ path, dir });
        }}
      >
        <TabBar
          tabs={tabs}
          selected={selected}
          pinned={pinned}
          onSelect={selectNote}
          onClose={closeTab}
          onCloseAll={closeAllTabs}
          onCloseOthers={closeOtherTabs}
          onCloseRight={closeRightTabs}
          onReorder={reorderTab}
          onTogglePin={() => updateSettings({ pinned: !pinned })}
        />
        {error && (
          <div className="error" onClick={clearError}>
            {error}
          </div>
        )}
        <div className={"panes" + (split ? " split-" + split.dir : "")}>
          <div className="pane">{renderPane(selected)}</div>
          {split && (
            <div className="pane split-pane">
              <Editor
                path={split.path}
                onRename={(name) => handleRename(split.path, name)}
                isFavorite={favorites.includes(split.path)}
                onToggleFavorite={() => toggleFavorite(split.path)}
                onClose={() => setSplit(null)}
              />
            </div>
          )}
        </div>
        {splitHint && <div className={"split-hint " + splitHint} />}
      </main>

      {dragging && (
        <div
          className={"trash-target" + (trashOver ? " over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setTrashOver(true);
          }}
          onDragLeave={() => setTrashOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            void handleDelete(e.dataTransfer.getData("text/plain"));
          }}
        >
          🗑️
        </div>
      )}

      {toast && (
        <div className="toast">
          <span>{toast.msg}</span>
          {toast.undoPath && (
            <button onClick={() => void handleUndo()}>실행 취소</button>
          )}
        </div>
      )}

      {quickAddOpen && (
        <QuickAddTodo
          pending={pendingTodos}
          onAdd={addTodo}
          onClose={() => setQuickAddOpen(false)}
        />
      )}

      {searchOpen && (
        <SearchModal
          currentPath={isVirtualView(selected) ? null : selected}
          onClose={() => setSearchOpen(false)}
          onSelectNote={selectNote}
          onError={setError}
        />
      )}

      {paletteOpen && (
        <CommandPalette
          tree={tree}
          onClose={() => setPaletteOpen(false)}
          onSelectNote={selectNote}
          onNewNote={() => void handleNewNote()}
          onNewFolder={() => void handleNewFolder()}
          onHelp={openHelp}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {ctxMenu && (
        <>
          <div
            className="ctx-backdrop"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            {!ctxMenu.isDir && (
              <button
                onClick={() => {
                  toggleFavorite(ctxMenu.path);
                  setCtxMenu(null);
                }}
              >
                {favorites.includes(ctxMenu.path) ? "즐겨찾기 해제" : "⭐ 즐겨찾기 추가"}
              </button>
            )}
            {ctxMenu.isDir && (
              <button
                onClick={() => {
                  void handleNewNote(ctxMenu.path);
                  setCtxMenu(null);
                }}
              >
                새 메모
              </button>
            )}
            {ctxMenu.isDir && (
              <button
                onClick={() => {
                  void handleNewFolder(ctxMenu.path);
                  setCtxMenu(null);
                }}
              >
                새 폴더
              </button>
            )}
            <button
              onClick={() => {
                setRenamingPath(ctxMenu.path);
                setCtxMenu(null);
              }}
            >
              이름 바꾸기 (F2)
            </button>
            <button
              className="danger"
              onClick={() => {
                void handleDelete(ctxMenu.path);
                setCtxMenu(null);
              }}
            >
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  );
}
