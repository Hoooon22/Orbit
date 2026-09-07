import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  checkReminders,
  dismissReminder,
  listAdd,
  listItems,
  listMove,
  listPatch,
  listRemove,
} from "../../shared/api";
import type { Fired, Todo } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { parseTodoInput } from "../../shared/todoParse";

// 마감일은 종료일이 있으면 종료일, 없으면 시작일
export const deadline = (t: Todo) => t.end ?? t.start;

// 마감 시각(epoch ms). 시각이 없는 날짜만 있는 할 일은 그날 09:00으로 본다 (알림 오프셋 계산용).
export function dueMs(t: Todo): number | undefined {
  const d = deadline(t);
  if (!d) return undefined;
  const [y, m, day] = d.split("-").map(Number);
  const [h, mi] = (t.time ?? "09:00").split(":").map(Number);
  return new Date(y, m - 1, day, h, mi).getTime();
}

// 표시 순서: 배열 순서(드래그로 수동 변경) 그대로, 완료 항목만 뒤로.
// stable sort라 같은 그룹 안에서는 수동 순서가 유지된다.
export function sortDoneLast(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => Number(a.done) - Number(b.done));
}

type TodoStore = {
  todos: Todo[];
  fired: Fired[]; // 울렸지만 아직 닫지 않은 알림
  init: () => void;
  add: (text: string) => void;
  patch: (id: string, p: Partial<Todo>) => void;
  remove: (id: string) => void;
  reorder: (dragged: string, target: string, before: boolean) => void;
  // 마감 날짜·시각 변경. 알림이 걸려 있었으면 마감으로부터의 간격을 유지해 옮긴다.
  setDue: (id: string, start?: string, end?: string, time?: string) => void;
  // 알림: 마감 몇 분 전에 울릴지 (null이면 끔)
  setReminder: (id: string, offsetMin: number | null) => void;
  snooze: (id: string, until: number) => void;
  dismissFired: (id: string) => void;
};

// 진실은 디스크(.todos.json)에 있고 변경은 Rust 커맨드가 항목 단위로 한다.
// 이 스토어는 읽기 캐시 + 낙관적 반영이고, todos-changed가 오면 다시 읽어 맞춘다.
// 그래서 창이 여럿(워크스페이스·오브)이어도 서로의 변경을 덮어쓰지 않는다.
let inited = false;

export const useTodos = create<TodoStore>((set, get) => {
  const refresh = () =>
    listItems<Todo>("todos")
      .then((todos) => set({ todos }))
      .catch(reportError);

  // undefined는 직렬화되지 않으므로 "값 없앰"은 null로 보낸다
  const send = (id: string, p: Partial<Todo>) => {
    const wire = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? null]));
    listPatch("todos", id, wire).catch(reportError);
  };

  const patch: TodoStore["patch"] = (id, p) => {
    set({ todos: get().todos.map((t) => (t.id === id ? { ...t, ...p } : t)) });
    send(id, p);
  };

  const dismissFired: TodoStore["dismissFired"] = (id) => {
    set({ fired: get().fired.filter((f) => f.id !== id) });
    dismissReminder(id).catch(reportError);
  };

  return {
    todos: [],
    fired: [],

    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("todos-changed", () => void refresh());
      // 알림: 창이 뜨기 전에 울린 것은 풀로 받고, 이후는 이벤트로 받는다
      checkReminders()
        .then((fired) => set({ fired }))
        .catch(() => {});
      void listen<Fired[]>("reminders-fired", (e) => {
        const ids = new Set(e.payload.map((f) => f.id));
        set({ fired: [...get().fired.filter((f) => !ids.has(f.id)), ...e.payload] });
      });
      void listen<string>("reminder-dismissed", (e) => {
        set({ fired: get().fired.filter((f) => f.id !== e.payload) });
      });
    },

    add: (text) => {
      const p = parseTodoInput(text);
      if (!p.text) return;
      const t: Todo = { id: crypto.randomUUID(), text: p.text, done: false };
      if (p.start) t.start = p.start;
      if (p.time) t.time = p.time;
      if (p.remindAt) t.remindAt = p.remindAt;
      set({ todos: [...get().todos, t] });
      listAdd("todos", t).catch(reportError);
    },

    patch,

    remove: (id) => {
      set({ todos: get().todos.filter((t) => t.id !== id) });
      listRemove("todos", id).catch(reportError);
    },

    // 드래그 순서 변경: dragged를 target 앞/뒤로 옮긴다 (즐겨찾기와 같은 방식)
    reorder: (dragged, target, before) => {
      if (dragged === target) return;
      const prev = get().todos;
      const item = prev.find((t) => t.id === dragged);
      if (!item) return;
      const without = prev.filter((t) => t.id !== dragged);
      const ti = without.findIndex((t) => t.id === target);
      if (ti === -1) return;
      const at = before ? ti : ti + 1;
      without.splice(at, 0, item);
      set({ todos: without });
      // Rust 커맨드는 "이 항목 앞으로"만 받으므로 뒤로 놓을 때는 다음 항목 앞으로 바꿔 보낸다
      const beforeId = without[at + 1]?.id ?? null;
      listMove("todos", dragged, beforeId).catch(reportError);
    },

    setDue: (id, start, end, time) => {
      const t = get().todos.find((x) => x.id === id);
      if (!t) return;
      const next: Todo = { ...t, start, end, time };
      const oldDue = dueMs(t);
      const newDue = dueMs(next);
      let remindAt: number | undefined;
      if (t.remindAt !== undefined && oldDue !== undefined && newDue !== undefined)
        remindAt = newDue - (oldDue - t.remindAt);
      patch(id, { start, end, time, remindAt });
    },

    setReminder: (id, offsetMin) => {
      const t = get().todos.find((x) => x.id === id);
      if (!t) return;
      const due = dueMs(t);
      patch(id, {
        remindAt: offsetMin === null || due === undefined ? undefined : due - offsetMin * 60_000,
      });
    },

    snooze: (id, until) => {
      patch(id, { remindAt: until });
      dismissFired(id);
    },

    dismissFired,
  };
});
