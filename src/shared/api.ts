import { invoke } from "@tauri-apps/api/core";

export type TreeNode = {
  name: string;
  path: string; // 노트 루트 기준 상대 경로, "/" 구분
  isDir: boolean;
  modified?: number; // 마지막 수정 시각 (epoch ms). 메모 파일에만 있다
  children?: TreeNode[];
};

export type NoteTimes = { created?: number; modified?: number };

export const QUICK_MEMO = "QuickMemo.md";

// 노트 루트 절대 경로 (이미지 asset 주소용). 폴더 위치는 Rust가 정한다.
export const dataRoot = () => invoke<string>("data_root");
export const openDataRoot = () => invoke<void>("open_data_root");

export const listTree = () => invoke<TreeNode[]>("list_tree");
export const readNote = (path: string) => invoke<string>("read_note", { path });
export const noteTimes = (path: string) => invoke<NoteTimes>("note_times", { path });
export const writeNote = (path: string, content: string) =>
  invoke<void>("write_note", { path, content });
export const createNote = (dir: string) => invoke<string>("create_note", { dir });
export const createFolder = (dir: string) => invoke<string>("create_folder", { dir });
export const renameEntry = (path: string, newName: string) =>
  invoke<string>("rename_entry", { path, newName });
export const moveEntry = (path: string, dir: string) => invoke<string>("move_entry", { path, dir });
// 드래그 순서 변경: dir의 표시 순서에서 (옮기는 항목 제외) index 위치로 삽입
export const reorderEntry = (path: string, dir: string, index: number) =>
  invoke<string>("reorder_entry", { path, dir, index });
export const deleteEntry = (path: string) => invoke<void>("delete_entry", { path });
export const restoreEntry = (path: string) => invoke<void>("restore_entry", { path });

export type SearchHit = { path: string; name: string; snippet: string };
export const searchNotes = (query: string) => invoke<SearchHit[]>("search_notes", { query });

// 빠른 메모 내용을 지정 폴더에 새 메모로 저장하고, 빠른 메모에는 rest만 남긴다
export const saveQuickMemo = (dir: string, name: string, content: string, rest: string) =>
  invoke<string>("save_quick_memo", { dir, name, content, rest });

// 빠른 메모 내용을 기존 메모 끝에 이어 붙이고, 빠른 메모에는 rest만 남긴다
export const appendQuickMemo = (path: string, block: string, rest: string) =>
  invoke<void>("append_quick_memo", { path, block, rest });

// 붙여넣은 이미지를 .assets 폴더에 저장하고 상대 경로를 돌려받는다
export const saveImage = (data: number[], ext: string) =>
  invoke<string>("save_image", { data, ext });

// 파일이 아닌 화면을 탭·선택 상태에 넣을 때 쓰는 센티널 ("::"로 시작)
export const TODO_VIEW = "::todo";
export const SETTINGS_VIEW = "::settings";
export const CALENDAR_VIEW = "::calendar";
export const isVirtualView = (path: string) => path.startsWith("::");

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  start?: string; // YYYY-MM-DD
  end?: string;
  time?: string; // HH:MM — 마감일(end ?? start)의 시각
  remindAt?: number; // epoch ms. 없으면 알림 없음. Rust 스케줄러가 이 값만 본다
};

// 일정. 할 일과 달리 완료가 없고 날짜 범위·반복이 있어 따로 둔다 (.events.json)
export type CalEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD 시작일
  endDate?: string; // 여러 날에 걸치면 마지막 날
  time?: string; // HH:MM. 없으면 종일
  endTime?: string;
  repeat?: "yearly"; // 생일·기념일. 매년 같은 날
  note?: string; // 연결 메모 상대 경로
  updatedAt?: number; // 이후 외부 캘린더 동기화 충돌 해소용
};

// 울린 뒤 아직 닫지 않은 리마인더 (Rust reminders.rs)
export type Fired = { id: string; text: string; remindAt: number; missed: boolean };
export const checkReminders = () => invoke<Fired[]>("check_reminders");
export const dismissReminder = (id: string) => invoke<void>("dismiss_reminder", { id });

// 로그인 시 자동 시작
export const autostartEnabled = () => invoke<boolean>("autostart_enabled");
export const setAutostart = (enabled: boolean) => invoke<void>("set_autostart", { enabled });

// 노트 루트의 JSON 목록 파일(.todos.json 등)을 항목 단위로 고친다.
// 변경이 끝나면 Rust가 "<name>-changed"를 모든 창에 보낸다.
export type ListName = "todos" | "events";
export const listItems = <T>(name: ListName) => invoke<T[]>("list_items", { name });
export const listAdd = (name: ListName, item: object) => invoke<void>("list_add", { name, item });
// patch에서 null인 필드는 지워진다 (undefined는 직렬화되지 않으므로 null로 보낼 것)
export const listPatch = (name: ListName, id: string, patch: object) =>
  invoke<void>("list_patch", { name, id, patch });
export const listRemove = (name: ListName, id: string) =>
  invoke<void>("list_remove", { name, id });
// id 항목을 before 앞으로 (null이면 맨 뒤로)
export const listMove = (name: ListName, id: string, before: string | null) =>
  invoke<void>("list_move", { name, id, before });

// 창 전체 반투명 (0.2~1.0) — 호출한 창에 적용
export const setWindowOpacity = (opacity: number) =>
  invoke<void>("set_window_opacity", { opacity });

// 오브 창: 접힘↔펼침 (호출한 창의 크기·위치를 Rust가 한 번에 바꾼다)
export const setOrbBounds = (expanded: boolean) =>
  invoke<void>("set_orb_bounds", { expanded });
export const setOrbVisible = (visible: boolean) =>
  invoke<void>("set_orb_visible", { visible });
// 워크스페이스 창을 앞으로. target(메모 경로·가상 뷰)이 있으면 그 탭을 연다
export const showWorkspace = (target?: string) =>
  invoke<void>("show_workspace", { target: target ?? null });

// 즐겨찾기한 메모의 상대경로 목록 (배열 순서 = 표시 순서)
export const readFavorites = () => invoke<string[]>("read_favorites");
export const writeFavorites = (favorites: string[]) =>
  invoke<void>("write_favorites", { favorites });

// 앱 설정. 노트 루트의 .settings.json 한 파일. 필드를 더하면 Rust settings.rs도 같이 고친다.
export type Settings = {
  theme: "dark" | "light";
  pinned: boolean; // 워크스페이스 창 항상 위
  sidebarWidth: number;
  fontSize: number;
  todoPanelOpen: boolean;
  tabs: string[];
  activeTab: string;
  orbVisible: boolean;
  orbOpacity: number; // 접힌 오브의 투명도 0.3~1.0
  orbX: number | null; // 접힌 오브의 위치 (물리 픽셀). null이면 화면 오른쪽 아래
  orbY: number | null;
};
// null이면 아직 설정 파일이 없다 (첫 실행)
export const readSettings = () => invoke<Settings | null>("read_settings");
// 전체 덮어쓰기 — 첫 실행 이관 전용. 평소 변경은 updateSettings(바뀐 필드만)로.
export const writeSettings = (settings: Settings) =>
  invoke<void>("write_settings", { settings });
export const updateSettings = (patch: Partial<Settings>) =>
  invoke<Settings>("update_settings", { patch });
