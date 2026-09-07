import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { listAdd, listItems, listMove, listPatch, listRemove } from "../../shared/api";
import type { Todo } from "../../shared/api";
import { reportError } from "../../shared/stores/error";

// 마감일은 종료일이 있으면 종료일, 없으면 시작일
export const deadline = (t: Todo) => t.end ?? t.start;

// 표시 순서: 배열 순서(드래그로 수동 변경) 그대로, 완료 항목만 뒤로.
// stable sort라 같은 그룹 안에서는 수동 순서가 유지된다.
export function sortDoneLast(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => Number(a.done) - Number(b.done));
}

type TodoStore = {
  todos: Todo[];
  init: () => void;
  add: (text: string) => void;
  patch: (id: string, p: Partial<Todo>) => void;
  remove: (id: string) => void;
  reorder: (dragged: string, target: string, before: boolean) => void;
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

  return {
    todos: [],

    init: () => {
      if (inited) return;
      inited = true;
      void refresh();
      void listen("todos-changed", () => void refresh());
    },

    add: (text) => {
      const s = text.trim();
      if (!s) return;
      const t: Todo = { id: crypto.randomUUID(), text: s, done: false };
      set({ todos: [...get().todos, t] });
      listAdd("todos", t).catch(reportError);
    },

    patch: (id, p) => {
      set({ todos: get().todos.map((t) => (t.id === id ? { ...t, ...p } : t)) });
      // undefined는 직렬화되지 않으므로 "값 없앰"은 null로 보낸다
      const wire = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? null]));
      listPatch("todos", id, wire).catch(reportError);
    },

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
  };
});
