import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { listAdd, listItems, listPatch, listRemove } from "../../shared/api";
import type { CalEvent } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

type EventStore = {
  events: CalEvent[];
  init: () => void;
  add: (ev: Omit<CalEvent, "id" | "updatedAt">) => void;
  patch: (id: string, p: Partial<CalEvent>) => void;
  remove: (id: string) => void;
};

// 할 일 스토어와 같은 방식: 파일(.events.json)이 진실, 변경은 Rust 항목 단위 커맨드, 캐시는 이벤트로 갱신
let inited = false;

export const useEvents = create<EventStore>((set, get) => {
  const refresh = () =>
    listItems<CalEvent>("events")
      .then((events) => set({ events }))
      .catch(reportError);

  return {
    events: [],

    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("events-changed", () => void refresh());
    },

    add: (ev) => {
      const item: CalEvent = { ...ev, id: crypto.randomUUID(), updatedAt: Date.now() };
      set({ events: [...get().events, item] });
      listAdd("events", item).catch(reportError);
    },

    patch: (id, p) => {
      const next = { ...p, updatedAt: Date.now() };
      set({ events: get().events.map((e) => (e.id === id ? { ...e, ...next } : e)) });
      // undefined는 직렬화되지 않으므로 "값 없앰"은 null로 보낸다
      const wire = Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v ?? null]));
      listPatch("events", id, wire).catch(reportError);
    },

    remove: (id) => {
      set({ events: get().events.filter((e) => e.id !== id) });
      listRemove("events", id).catch(reportError);
    },
  };
});
