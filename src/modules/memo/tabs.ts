import { create } from "zustand";
import { QUICK_MEMO } from "../../shared/api";

// 메모 화면 위의 탭(크롬처럼). 탭 하나 = 메모 경로 하나. 늘 탭이 하나는 있고, 열린 탭과 활성 탭은
// localStorage에 남겨 다시 켜도 그대로다 (이 기기에서 뭘 보고 있었는지일 뿐이라 메모 폴더에는 안 둔다).

export type Tabs = { tabs: string[]; active: string };

const KEY = "memoTabs";
export const EMPTY: Tabs = { tabs: [QUICK_MEMO], active: QUICK_MEMO };

// 메모를 연다. 이미 열려 있으면 그 탭으로, newTab이면 활성 탭 오른쪽에 새 탭으로, 아니면 활성 탭이 그 메모로 바뀐다.
export function openTab(t: Tabs, path: string, newTab = false): Tabs {
  if (t.tabs.includes(path)) return { tabs: t.tabs, active: path };
  const i = t.tabs.indexOf(t.active);
  const tabs = [...t.tabs];
  if (newTab || i === -1) tabs.splice(i + 1, 0, path);
  else tabs[i] = path;
  return { tabs, active: path };
}

// 탭을 닫는다. 활성 탭이었으면 오른쪽(없으면 왼쪽) 탭이 활성이 되고, 마지막 탭을 닫으면 빠른 메모가 남는다.
export function closeTab(t: Tabs, path: string): Tabs {
  const i = t.tabs.indexOf(path);
  if (i === -1) return t;
  const tabs = t.tabs.filter((p) => p !== path);
  if (tabs.length === 0) return EMPTY;
  const active = t.active === path ? tabs[Math.min(i, tabs.length - 1)] : t.active;
  return { tabs, active };
}

// 경로가 바뀐 메모·폴더(이름 변경·이동)를 탭이 따라가게 한다. 메모면 그 하위 페이지 폴더("메모/…")도 함께 따라간다.
export function remapTabs(t: Tabs, oldPath: string, newPath: string): Tabs {
  const stem = (p: string) => p.replace(/\.md$/i, "");
  const map = (p: string) => {
    if (p === oldPath) return newPath;
    if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length);
    const prefix = stem(oldPath) + "/";
    if (/\.md$/i.test(oldPath) && p.startsWith(prefix)) return stem(newPath) + "/" + p.slice(prefix.length);
    return p;
  };
  return dedupe({ tabs: t.tabs.map(map), active: map(t.active) });
}

// 사라진 메모의 탭을 닫는다 (삭제·외부 변경). 빠른 메모는 트리에 없지만 늘 있다.
export function pruneTabs(t: Tabs, exists: (path: string) => boolean): Tabs {
  let out = t;
  for (const p of t.tabs) if (p !== QUICK_MEMO && !exists(p)) out = closeTab(out, p);
  return out;
}

// 끌어서 순서 바꾸기: dragged를 target 앞/뒤로
export function reorderTabs(t: Tabs, dragged: string, target: string, pos: "before" | "after"): Tabs {
  if (dragged === target || !t.tabs.includes(dragged)) return t;
  const tabs = t.tabs.filter((p) => p !== dragged);
  const ti = tabs.indexOf(target);
  if (ti === -1) return t;
  tabs.splice(pos === "before" ? ti : ti + 1, 0, dragged);
  return { tabs, active: t.active };
}

// 활성 탭에서 한 칸 옆으로 (끝에서는 반대편으로 돈다)
export function cycleTab(t: Tabs, delta: 1 | -1): Tabs {
  const i = t.tabs.indexOf(t.active);
  if (i === -1 || t.tabs.length < 2) return t;
  return { tabs: t.tabs, active: t.tabs[(i + delta + t.tabs.length) % t.tabs.length] };
}

function dedupe(t: Tabs): Tabs {
  const tabs = t.tabs.filter((p, i) => t.tabs.indexOf(p) === i);
  return tabs.length === t.tabs.length ? t : { tabs, active: t.active };
}

function load(): Tabs {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object" && Array.isArray((v as Tabs).tabs) && (v as Tabs).tabs.length > 0) {
      const tabs = (v as Tabs).tabs.filter((p): p is string => typeof p === "string");
      const active = typeof (v as Tabs).active === "string" && tabs.includes((v as Tabs).active) ? (v as Tabs).active : tabs[0];
      if (tabs.length > 0) return { tabs, active };
    }
  } catch {
    // 없거나 깨졌으면 빠른 메모 하나로 시작
  }
  return EMPTY;
}

type TabStore = Tabs & { apply: (fn: (t: Tabs) => Tabs) => void };

export const useTabs = create<TabStore>((set, get) => ({
  ...load(),
  apply: (fn) => {
    const prev = { tabs: get().tabs, active: get().active };
    const next = fn(prev);
    if (next === prev) return;
    set(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 저장 못 해도 동작에는 지장 없음
    }
  },
}));
