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
};

type BubbleStore = {
  current: Bubble | null;
  side: BubbleSide;
  /// 창이 넓어진 동안(펼치기 시작 ~ 접기 끝) true. OrbApp이 이때의 위치는 저장하지 않는다
  expanded: boolean;
  init: () => void;
  push: (b: Bubble) => void;
  dismiss: () => void;
  // 미뤄 둔 말풍선이 있으면 띄운다 (펫을 잡았다 놓은 뒤)
  flush: () => void;
};

// 펫이 잡혀 있거나 날아가는 동안은 창을 넓히지 않는다 (OS 드래그·물리 루프와 창 x가 어긋난다)
const petBusy = () => {
  const p = usePet.getState().phase;
  return p === "held" || p === "falling" || p === "throwing";
};

const MAX_QUEUE = 5;
// 글이 길면 조금 더 머문다: 6초 + 8글자마다 1초, 최대 15초
const dwell = (b: Bubble) => Math.min(15_000, 6_000 + Math.floor((b.title + b.body).length / 8) * 1_000);
const pad = (n: number) => String(n).padStart(2, "0");
const timeLabel = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

let inited = false;
const queue: Bubble[] = [];
let timer: number | undefined;

export const useBubble = create<BubbleStore>((set, get) => {
  const next = () => {
    const b = queue.shift();
    if (b) void show(b);
  };

  const show = async (b: Bubble) => {
    set({ expanded: true });
    try {
      const side = await expandOrb();
      set({ current: b, side });
      timer = window.setTimeout(() => get().dismiss(), dwell(b));
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
          const { current, expanded } = get();
          if (current?.key === b.key) return;
          if (expanded || petBusy()) {
            const i = queue.findIndex((q) => q.key === b.key);
            if (i >= 0) queue[i] = b;
            else if (queue.length < MAX_QUEUE) queue.push(b);
            return;
          }
          void show(b);
        });
    },

    dismiss: () => {
      const { current, side } = get();
      if (!current) return;
      window.clearTimeout(timer);
      // DOM에서 말풍선을 먼저 지우고 창을 줄인다 (줄어든 창에 말풍선이 한 프레임 겹치지 않게)
      set({ current: null });
      collapseOrb(side)
        .catch(reportError)
        .finally(() => {
          set({ expanded: false });
          if (!petBusy()) next();
        });
    },

    flush: () => {
      if (!get().expanded && !get().current && !petBusy()) next();
    },
  };
});
