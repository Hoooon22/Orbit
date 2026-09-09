// 메모마다 마지막으로 보던 자리(커서 위치·스크롤)를 기억한다. 메모 내용이 아니라 이 기기에서
// 어디까지 봤는지일 뿐이라 노트 폴더가 아닌 localStorage에 둔다 (동기화되지 않고, 없어져도 맨 앞에서 열릴 뿐).

const KEY = "memoViewState";
const MAX = 200; // 지우거나 이름을 바꾼 메모의 찌꺼기가 쌓이지 않게 최근 것만 남긴다

export type ViewState = { pos: number; top: number };

type Stored = Record<string, ViewState & { at: number }>;

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

export function loadView(path: string): ViewState | null {
  const v = read()[path];
  return v ? { pos: v.pos, top: v.top } : null;
}

export function saveView(path: string, view: ViewState) {
  const all = read();
  all[path] = { ...view, at: Date.now() };
  const paths = Object.keys(all);
  if (paths.length > MAX) {
    paths
      .sort((a, b) => all[b].at - all[a].at)
      .slice(MAX)
      .forEach((p) => delete all[p]);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 저장 못 해도 동작에는 지장 없음 (다음에 맨 앞에서 열릴 뿐)
  }
}
