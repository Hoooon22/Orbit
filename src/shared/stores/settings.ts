import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { QUICK_MEMO, readSettings, writeSettings } from "../api";
import type { Settings } from "../api";
import { reportError } from "./error";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  pinned: false,
  sidebarWidth: 240,
  fontSize: 14,
  todoPanelOpen: true,
  tabs: [QUICK_MEMO],
  activeTab: QUICK_MEMO,
};

type SettingsStore = {
  settings: Settings;
  loaded: boolean;
  init: () => Promise<void>;
  update: (patch: Partial<Settings>) => void;
};

// 테마는 html[data-theme]로 내려 CSS 변수를 바꾼다. localStorage에도 같은 값을 남겨
// index.html이 첫 페인트 전에 미리 적용할 수 있게 한다 (반대 색이 번쩍이는 것 방지).
function applyTheme(theme: Settings["theme"]) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // 저장 못 해도 동작에는 지장 없음
  }
}

// 설정 파일이 생기기 전(v0.2.x까지) localStorage에 흩어져 있던 값을 한 번 끌어온다
function importLegacy(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  const num = (k: string, min: number, max: number, fallback: number) => {
    const v = Number(localStorage.getItem(k));
    return v >= min && v <= max ? v : fallback;
  };
  if (localStorage.getItem("theme") === "light") s.theme = "light";
  s.pinned = localStorage.getItem("always-on-top") === "1";
  s.sidebarWidth = num("sidebar-width", 160, 480, s.sidebarWidth);
  s.fontSize = num("editor-font-size", 10, 32, s.fontSize);
  s.todoPanelOpen = localStorage.getItem("todo-panel-open") !== "0";
  try {
    const tabs: unknown = JSON.parse(localStorage.getItem("open-tabs") ?? "");
    if (Array.isArray(tabs) && tabs.length > 0 && tabs.every((p) => typeof p === "string")) {
      s.tabs = tabs;
      const a = localStorage.getItem("active-tab");
      s.activeTab = a && tabs.includes(a) ? a : tabs[0];
    }
  } catch {
    // 저장된 탭 없음
  }
  for (const k of [
    "always-on-top",
    "sidebar-width",
    "editor-font-size",
    "todo-panel-open",
    "open-tabs",
    "active-tab",
    "popup-mode",
    "popup-opacity",
    "normal-bounds",
    "popup-bounds",
  ])
    localStorage.removeItem(k);
  return s;
}

// 저장은 300ms 모아서 한 번에 (사이드바 드래그·탭 전환처럼 잦은 변경 대비)
let saveTimer: number | undefined;
let dirty = false;
function flush() {
  if (saveTimer !== undefined) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (!dirty) return;
  dirty = false;
  writeSettings(useSettings.getState().settings).catch(reportError);
}

let inited = false;

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  init: async () => {
    if (inited) return;
    inited = true;
    let s: Settings | null = null;
    try {
      s = await readSettings();
    } catch (e) {
      reportError(e);
    }
    if (!s) {
      s = importLegacy();
      writeSettings(s).catch(reportError);
    }
    set({ settings: s, loaded: true });
    applyTheme(s.theme);

    // 다른 창이 바꾼 설정 따라가기. 이 창에 아직 저장 안 한 변경이 있으면 그쪽이 우선.
    void listen("settings-changed", () => {
      if (dirty) return;
      readSettings()
        .then((next) => {
          if (!next || dirty) return;
          set({ settings: next });
          applyTheme(next.theme);
        })
        .catch(() => {});
    });
    // 종료 직전 미저장분 기록 (Rust가 app-quitting 후 700ms 기다린다)
    void listen("app-quitting", flush);
  },

  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (patch.theme !== undefined) applyTheme(next.theme);
    dirty = true;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 300);
  },
}));
