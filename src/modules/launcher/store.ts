import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  launch as launchCmd,
  launcherAddCustom,
  launcherItems,
  launcherRemoveCustom,
  launcherRescan,
} from "../../shared/api";
import type { LaunchItem, Usage } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

type LauncherStore = {
  items: LaunchItem[];
  usage: Record<string, Usage>;
  init: () => void;
  refresh: () => Promise<void>;
  launch: (id: string) => Promise<void>;
  addCustom: (name: string, target: string) => Promise<void>;
  removeCustom: (id: string) => void;
  rescan: () => Promise<number>;
};

let inited = false;

export const useLauncher = create<LauncherStore>((set, get) => {
  const refresh = () =>
    launcherItems()
      .then((d) => set({ items: d.items, usage: d.usage }))
      .catch(reportError);

  return {
    items: [],
    usage: {},

    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("launcher-changed", () => void refresh());
    },

    refresh,

    launch: async (id) => {
      // 사용 기록은 낙관적으로 먼저 올린다 (다음 검색에 바로 반영)
      const u = get().usage[id] ?? { count: 0, lastUsed: 0 };
      set({ usage: { ...get().usage, [id]: { count: u.count + 1, lastUsed: Date.now() } } });
      try {
        await launchCmd(id);
      } catch (e) {
        reportError(e);
      }
    },

    addCustom: async (name, target) => {
      try {
        const item = await launcherAddCustom(name, target);
        set({ items: [item, ...get().items.filter((i) => i.id !== item.id)] });
      } catch (e) {
        reportError(e);
      }
    },

    removeCustom: (id) => {
      set({ items: get().items.filter((i) => i.id !== id) });
      launcherRemoveCustom(id).catch(reportError);
    },

    rescan: async () => {
      const n = await launcherRescan().catch((e) => {
        reportError(e);
        return 0;
      });
      await refresh();
      return n;
    },
  };
});
