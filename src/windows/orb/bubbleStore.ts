import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { collapseOrb, expandOrb } from "../../shared/api";
import type { BubbleSide, Fired, Meeting } from "../../shared/api";
import { todayStr } from "../../shared/dates";
import { reportError } from "../../shared/stores/error";
import { usePet } from "./petStore";

// 오브 옆에 잠깐 뜨는 말풍선. 큐는 오브 창이 갖는다 — 표시 시간·순서는 화면 관심사이고
// 영속 진실(아직 닫지 않은 알림)은 Rust ReminderState.pending에 이미 있다.
export type Bubble = {
  key: string; // 같은 key가 큐에 있으면 갈아 끼운다
  title: string;
  body: string;
  view: string; // 클릭하면 열 Orbit 화면 ("todo", "calendar@2026-09-14" …)
  chat?: boolean; // 펫의 혼잣말: title만 작게 그리고, 누르면 그냥 닫힌다
};

type BubbleStore = {
  current: Bubble | null;
  side: BubbleSide;
  /// 창이 넓어진 동안(펼치기 시작 ~ 접기 끝) true. OrbApp이 이때의 위치는 저장하지 않는다
  expanded: boolean;
  /// 타이머 말풍선(펫에 마우스를 올리면 뜨는, 돌고 있는 타이머 목록)이 떠 있음. current와 같은 자리를 쓴다
  timers: boolean;
  init: () => void;
  push: (b: Bubble) => void;
  // 펫의 혼잣말. 알림과 달리 기다리지 않는다 — 다른 말풍선이 떠 있거나 펫이 바쁘면 그냥 버린다
  say: (text: string) => void;
  dismiss: () => void;
  // 미뤄 둔 말풍선이 있으면 띄운다 (펫을 잡았다 놓은 뒤)
  flush: () => void;
  // 타이머 말풍선을 띄운다/닫는다. 알림 말풍선이 떠 있거나 펫이 잡혀 있으면 띄우지 않는다
  showTimers: () => void;
  hideTimers: () => void;
};

// 펫이 잡혀 있거나 날아가는(혼자 뛰는) 동안은 창을 넓히지 않는다 (OS 드래그·물리 루프와 창 x가 어긋난다)
const petBusy = () => {
  const p = usePet.getState().phase;
  return p !== "idle" && p !== "walk";
};

// 창을 넓히고 줄이는 앞뒤로 petLoop가 끼어든다 (말풍선이 떠 있는 동안에도 펫이 걷기 때문).
// before = 가던 창 이동이 끝나길 기다림, after = 바뀐 창 자리를 다시 읽음(side: 넓힌 쪽, 줄였으면 null).
// petLoop가 이 스토어를 가져다 쓰므로 반대 방향 import 대신 여기에 꽂게 둔다
export const resizeHooks: { before: () => Promise<void>; after: (side: BubbleSide | null) => Promise<void> } = {
  before: async () => {},
  after: async () => {},
};

const MAX_QUEUE = 5;
const CHAT_MS = 4500; // 혼잣말은 짧게 머문다
// 글이 길면 조금 더 머문다: 6초 + 8글자마다 1초, 최대 15초
const dwell = (b: Bubble) => (b.chat ? CHAT_MS : Math.min(15_000, 6_000 + Math.floor((b.title + b.body).length / 8) * 1_000));
const pad = (n: number) => String(n).padStart(2, "0");
const timeLabel = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

let inited = false;
const queue: Bubble[] = [];
let timer: number | undefined;
let timersWanted = false; // 창을 넓히는 사이 마우스가 떠났는지 (떠났으면 펴자마자 접는다)

export const useBubble = create<BubbleStore>((set, get) => {
  const next = () => {
    const b = queue.shift();
    if (b) void show(b);
  };

  // 이미 넓어진 창에 알림 말풍선을 올린다
  const present = (b: Bubble) => {
    window.clearTimeout(timer);
    set({ current: b, timers: false });
    timer = window.setTimeout(() => get().dismiss(), dwell(b));
  };

  const expand = async (): Promise<BubbleSide> => {
    await resizeHooks.before();
    const side = await expandOrb();
    await resizeHooks.after(side);
    return side;
  };

  const collapse = () => {
    resizeHooks
      .before()
      .then(() => collapseOrb(get().side))
      .catch(reportError)
      .then(() => resizeHooks.after(null))
      .finally(() => {
        set({ expanded: false });
        if (!petBusy()) next();
      });
  };

  const show = async (b: Bubble) => {
    set({ expanded: true });
    try {
      const side = await expand();
      set({ side });
      present(b);
    } catch (e) {
      reportError(e);
      set({ expanded: false });
      next();
    }
  };

  return {
    current: null,
    side: "left",
    expanded: false,
    timers: false,

    init: () => {
      if (inited) return;
      inited = true;
      void listen<Fired[]>("reminders-fired", (e) => {
        const { push } = get();
        usePet.getState().playAction("alert", 6000); // 펫이 흔들리며 !! 표정
        const missed = e.payload.filter((f) => f.missed);
        for (const f of e.payload.filter((f) => !f.missed)) {
          push({ key: f.id, title: f.text, body: `${timeLabel(f.remindAt)} 알림`, view: "todo" });
        }
        // 놓친 알림은 Rust 토스트와 같은 규칙으로 하나에 묶는다
        if (missed.length === 1) {
          const f = missed[0];
          push({ key: "missed", title: `놓친 알림: ${f.text}`, body: `${timeLabel(f.remindAt)} 예정이었습니다`, view: "todo" });
        } else if (missed.length > 1) {
          const f = missed[0];
          push({
            key: "missed",
            title: `놓친 알림 ${missed.length}개`,
            body: `${timeLabel(f.remindAt)} ${f.text} 외 ${missed.length - 1}개`,
            view: "todo",
          });
        }
      });
      // 회의가 시작되면 한 번 알린다. 끝날 때는 조용히 (미뤄 둔 알림이 곧 따로 온다)
      void listen<Meeting | null>("meeting-changed", (e) => {
        const m = e.payload;
        if (!m) return;
        get().push({ key: "meeting", title: "회의 중", body: `${m.title} · ~${m.endLabel}`, view: `calendar@${todayStr()}` });
      });
    },

    push: (b) => {
      // 오브가 숨겨져 있으면 Rust가 토스트를 띄우므로 여기서는 버린다
      void getCurrentWindow()
        .isVisible()
        .catch(() => false)
        .then((visible) => {
          if (!visible) return;
          const { current, expanded, timers } = get();
          if (current?.key === b.key) return;
          // 알림이 혼잣말·타이머 말풍선보다 먼저다: 넓어진 창 그대로 내용만 바꾼다
          if (current?.chat) {
            present(b);
            return;
          }
          if (timers) {
            timersWanted = false;
            present(b);
            return;
          }
          if (expanded || petBusy()) {
            const i = queue.findIndex((q) => q.key === b.key);
            if (i >= 0) queue[i] = b;
            else if (queue.length < MAX_QUEUE) queue.push(b);
            return;
          }
          void show(b);
        });
    },

    say: (text) => {
      const free = () => !get().expanded && !petBusy() && queue.length === 0;
      if (!free()) return;
      void getCurrentWindow()
        .isVisible()
        .catch(() => false)
        .then((visible) => {
          if (visible && free()) void show({ key: "chat", title: text, body: "", view: "", chat: true });
        });
    },

    dismiss: () => {
      if (!get().current) return;
      window.clearTimeout(timer);
      // DOM에서 말풍선을 먼저 지우고 창을 줄인다 (줄어든 창에 말풍선이 한 프레임 겹치지 않게)
      set({ current: null });
      collapse();
    },

    showTimers: () => {
      timersWanted = true;
      if (get().expanded || petBusy()) return;
      set({ expanded: true });
      expand()
        .then((side) => {
          set({ side });
          // 넓히는 사이 알림이 왔으면 그쪽을 먼저 보여 준다
          const b = queue.shift();
          if (b) return present(b);
          set({ timers: true });
          if (!timersWanted) get().hideTimers();
        })
        .catch((e) => {
          reportError(e);
          set({ expanded: false });
        });
    },

    hideTimers: () => {
      timersWanted = false;
      if (!get().timers) return;
      set({ timers: false });
      collapse();
    },

    flush: () => {
      if (!get().expanded && !get().current && !petBusy()) next();
    },
  };
});
