import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { listAdd, listItems, listPatch, listRemove } from "../../shared/api";
import type { ListName, WorkLogItem, WorkTimer } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

// 지금까지 잰 시간(ms). 돌고 있으면 시작 시각부터 now까지를 더한다
export const elapsedOf = (t: WorkTimer, now: number) =>
  t.elapsed + (t.startedAt ? Math.max(0, now - t.startedAt) : 0);

// "1:02:03" — 시:분:초. 시간은 자릿수 제한 없음
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

type TimerStore = {
  timers: WorkTimer[];
  log: WorkLogItem[];
  init: () => void;
  addTimer: (name: string) => void;
  patchTimer: (id: string, p: Partial<WorkTimer>) => void;
  // 시작/멈춤. 순수 작업 시간을 재는 것이라 하나를 시작하면 돌던 다른 타이머는 멈춘다
  toggle: (id: string) => void;
  reset: (id: string) => void;
  removeTimer: (id: string) => void;
  addLog: () => void;
  patchLog: (id: string, p: Partial<WorkLogItem>) => void;
  removeLog: (id: string) => void;
};

// 할 일과 같은 방식: 진실은 디스크(.timers.json / .worklog.json), 변경은 Rust 커맨드가 항목 단위로.
// 스토어는 읽기 캐시 + 낙관적 반영이고 "<이름>-changed"가 오면 다시 읽는다.
// 시간은 시작 시각(startedAt)으로만 세므로 화면·컴포넌트가 바뀌어도 잃지 않는다.
let inited = false;

export const useTimers = create<TimerStore>((set, get) => {
  const refresh = (name: ListName) =>
    listItems<WorkTimer & WorkLogItem>(name)
      .then((items) => set(name === "timers" ? { timers: items } : { log: items }))
      .catch(reportError);

  // undefined는 직렬화되지 않으므로 "값 없앰"은 null로 보낸다
  const send = (name: ListName, id: string, p: object) => {
    const wire = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? null]));
    listPatch(name, id, wire).catch(reportError);
  };

  const patchTimer: TimerStore["patchTimer"] = (id, p) => {
    set({ timers: get().timers.map((t) => (t.id === id ? { ...t, ...p } : t)) });
    send("timers", id, p);
  };

  return {
    timers: [],
    log: [],

    init: () => {
      if (inited) return;
      inited = true;
      void refresh("timers");
      void refresh("worklog");
      void listen("timers-changed", () => void refresh("timers"));
      void listen("worklog-changed", () => void refresh("worklog"));
    },

    addTimer: (name) => {
      const n = name.trim();
      if (!n) return;
      const t: WorkTimer = { id: crypto.randomUUID(), name: n, elapsed: 0 };
      set({ timers: [...get().timers, t] });
      listAdd("timers", t).catch(reportError);
    },

    patchTimer,

    toggle: (id) => {
      const now = Date.now();
      const target = get().timers.find((t) => t.id === id);
      if (!target) return;
      if (target.startedAt) {
        patchTimer(id, { elapsed: elapsedOf(target, now), startedAt: undefined });
        return;
      }
      for (const t of get().timers)
        if (t.startedAt) patchTimer(t.id, { elapsed: elapsedOf(t, now), startedAt: undefined });
      patchTimer(id, { startedAt: now });
    },

    reset: (id) => patchTimer(id, { elapsed: 0, startedAt: undefined }),

    removeTimer: (id) => {
      set({ timers: get().timers.filter((t) => t.id !== id) });
      listRemove("timers", id).catch(reportError);
    },

    addLog: () => {
      const item: WorkLogItem = { id: crypto.randomUUID(), title: "", hours: 0 };
      set({ log: [...get().log, item] });
      listAdd("worklog", item).catch(reportError);
    },

    patchLog: (id, p) => {
      set({ log: get().log.map((x) => (x.id === id ? { ...x, ...p } : x)) });
      send("worklog", id, p);
    },

    removeLog: (id) => {
      set({ log: get().log.filter((x) => x.id !== id) });
      listRemove("worklog", id).catch(reportError);
    },
  };
});
