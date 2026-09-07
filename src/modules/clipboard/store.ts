import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  clipboardClear,
  clipboardCopy,
  clipboardHistory,
  clipboardPin,
  clipboardRemove,
} from "../../shared/api";
import type { ClipItem } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

type ClipStore = {
  items: ClipItem[];
  init: () => void;
  copy: (id: string) => Promise<void>;
  pin: (id: string, pinned: boolean) => void;
  remove: (id: string) => void;
  clear: () => void;
};

// 진실은 Rust(ClipState). 여기는 읽기 캐시이고 clipboard-changed마다 다시 읽는다 (최대 200개라 통째 읽기로 충분).
let inited = false;

export const useClipboard = create<ClipStore>((set, get) => {
  const refresh = () =>
    clipboardHistory()
      .then((items) => set({ items }))
      .catch(reportError);

  return {
    items: [],

    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("clipboard-changed", () => void refresh());
    },

    copy: (id) => clipboardCopy(id).catch(reportError),

    pin: (id, pinned) => {
      set({ items: get().items.map((i) => (i.id === id ? { ...i, pinned } : i)) });
      clipboardPin(id, pinned).catch(reportError);
    },

    remove: (id) => {
      set({ items: get().items.filter((i) => i.id !== id) });
      clipboardRemove(id).catch(reportError);
    },

    clear: () => {
      set({ items: get().items.filter((i) => i.pinned) });
      clipboardClear().catch(reportError);
    },
  };
});
