import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { listTree, QUICK_MEMO, readFavorites, writeFavorites, isVirtualView } from "../../shared/api";
import type { TreeNode } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

function remapPath(current: string, oldPath: string, newPath: string): string {
  if (current === oldPath) return newPath;
  if (current.startsWith(oldPath + "/")) return newPath + current.slice(oldPath.length);
  return current;
}

type MemoStore = {
  tree: TreeNode[];
  favorites: string[];
  init: () => void;
  refreshTree: () => Promise<void>;
  toggleFavorite: (path: string) => void;
  // 이름 변경·이동으로 경로가 바뀐 즐겨찾기를 새 경로로 따라가게 한다
  remapFavorites: (oldPath: string, newPath: string) => void;
  reorderFavorite: (dragged: string, target: string, pos: "before" | "after") => void;
};

// 메모 트리와 즐겨찾기의 읽기 캐시. 파일이 진실이고, 외부 변경(notes-changed)이 오면 다시 읽는다.
let inited = false;

export const useMemoStore = create<MemoStore>((set, get) => {
  // 즐겨찾기 배열을 갱신하고 디스크에도 반영한다. updater가 이전 배열을
  // 그대로 돌려주면(변화 없음) 불필요한 파일 쓰기를 건너뛴다.
  const applyFavorites = (updater: (prev: string[]) => string[]) => {
    const prev = get().favorites;
    const next = updater(prev);
    if (next === prev) return;
    set({ favorites: next });
    writeFavorites(next).catch(reportError);
  };

  return {
    tree: [],
    favorites: [],

    init: () => {
      if (inited) return;
      inited = true;
      void get().refreshTree();
      readFavorites()
        .then((favorites) => set({ favorites }))
        .catch(reportError);
      void listen("notes-changed", () => void get().refreshTree());
    },

    refreshTree: () =>
      listTree()
        .then((tree) => set({ tree }))
        .catch(reportError),

    toggleFavorite: (path) => {
      if (!path || path === QUICK_MEMO || isVirtualView(path)) return;
      applyFavorites((prev) =>
        prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
      );
    },

    remapFavorites: (oldPath, newPath) => {
      applyFavorites((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          const r = remapPath(p, oldPath, newPath);
          if (r !== p) changed = true;
          return r;
        });
        return changed ? next : prev;
      });
    },

    reorderFavorite: (dragged, target, pos) => {
      applyFavorites((prev) => {
        if (dragged === target) return prev;
        const without = prev.filter((p) => p !== dragged);
        const ti = without.indexOf(target);
        if (ti === -1) return prev;
        without.splice(pos === "before" ? ti : ti + 1, 0, dragged);
        return without;
      });
    },
  };
});
