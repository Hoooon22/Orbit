import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { idleSeconds, meetingStatus } from "../../shared/api";
import type { IdleChange, Meeting } from "../../shared/api";

// 오브가 색·글자로 드러내는 상태. 진실은 Rust(idle.rs·meeting.rs)이고 여기는 이벤트를 받아 쥔 사본.
type OrbStatus = {
  away: boolean; // 5분 넘게 입력이 없음
  meeting: Meeting | null; // 진행 중인 일정 (회의 모드가 켜져 있을 때만)
  init: () => void;
};

// idle.rs의 IDLE_AFTER_SECS와 같은 값. 처음 뜰 때 한 번 직접 묻고, 이후는 idle-changed로 받는다
const AWAY_SECS = 300;

let inited = false;

export const useOrbStatus = create<OrbStatus>((set) => ({
  away: false,
  meeting: null,

  init: () => {
    if (inited) return;
    inited = true;
    idleSeconds()
      .then((s) => set({ away: s >= AWAY_SECS }))
      .catch(() => {});
    void listen<IdleChange>("idle-changed", (e) => set({ away: e.payload.idle }));
    meetingStatus()
      .then((meeting) => set({ meeting }))
      .catch(() => {});
    void listen<Meeting | null>("meeting-changed", (e) => set({ meeting: e.payload }));
  },
}));
