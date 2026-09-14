import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { usageHistory } from "../../shared/api";
import type { DayUsage } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

type UsageStore = {
  days: DayUsage[]; // 날짜 오름차순
  init: () => void;
};

// 진실은 Rust(UsageState). 여기는 읽기 캐시이고 usage-changed(5초마다)마다 다시 읽는다.
let inited = false;

export const useUsage = create<UsageStore>((set) => {
  const refresh = () =>
    usageHistory()
      .then((days) => set({ days }))
      .catch(reportError);

  return {
    days: [],
    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("usage-changed", () => void refresh());
    },
  };
});
