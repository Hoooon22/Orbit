import { useMemo } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import {
  googleConnect,
  googleDisconnect,
  googleEvents,
  googleSetCalendarEnabled,
  googleSetClient,
  googleStatus,
  googleSync,
} from "../../shared/api";
import type { CalEvent, GEvent, GoogleStatus } from "../../shared/api";
import { reportError } from "../../shared/stores/error";
import { useEvents } from "./store";

// 구글 일정을 로컬 일정과 같은 모양으로 (같은 달력·목록 코드를 그대로 쓰기 위해)
function toCalEvent(g: GEvent): CalEvent {
  return {
    id: g.id,
    title: g.title,
    date: g.date,
    endDate: g.endDate ?? undefined,
    time: g.time ?? undefined,
    endTime: g.endTime ?? undefined,
    color: g.color ?? undefined,
    google: { account: g.account, calendar: g.calendar },
  };
}

type GoogleStore = {
  status: GoogleStatus | null;
  events: CalEvent[];
  connecting: boolean;
  syncing: boolean;
  init: () => void;
  setClient: (id: string, secret: string) => Promise<void>;
  connect: () => Promise<string | null>;
  disconnect: (email: string) => Promise<void>;
  setCalendarEnabled: (email: string, id: string, enabled: boolean) => Promise<void>;
  sync: () => Promise<void>;
};

let inited = false;

export const useGoogle = create<GoogleStore>((set) => {
  const refreshStatus = () =>
    googleStatus()
      .then((status) => set({ status }))
      .catch(reportError);
  const refreshEvents = () =>
    googleEvents()
      .then((evs) => set({ events: evs.map(toCalEvent) }))
      .catch(reportError);

  return {
    status: null,
    events: [],
    connecting: false,
    syncing: false,

    init: () => {
      if (inited) return;
      inited = true;
      void refreshStatus();
      void refreshEvents();
      void listen("google-changed", () => void refreshStatus());
      void listen("google-events-changed", () => void refreshEvents());
    },

    setClient: async (id, secret) => {
      try {
        await googleSetClient(id, secret);
      } catch (e) {
        reportError(e);
      }
    },

    // 브라우저가 열리고 로그인이 끝날 때까지 기다린다. 실패는 오류로 띄우고 null.
    connect: async () => {
      set({ connecting: true });
      try {
        return await googleConnect();
      } catch (e) {
        reportError(e);
        return null;
      } finally {
        set({ connecting: false });
      }
    },

    disconnect: async (email) => {
      try {
        await googleDisconnect(email);
      } catch (e) {
        reportError(e);
      }
    },

    setCalendarEnabled: async (email, id, enabled) => {
      try {
        await googleSetCalendarEnabled(email, id, enabled);
      } catch (e) {
        reportError(e);
      }
    },

    sync: async () => {
      set({ syncing: true });
      try {
        await googleSync();
      } catch (e) {
        reportError(e);
      } finally {
        set({ syncing: false });
      }
    },
  };
});

// 달력·목록에 보여 줄 전체 일정 = 로컬(.events.json) + 구글
export function useAllEvents(): CalEvent[] {
  const local = useEvents((s) => s.events);
  const google = useGoogle((s) => s.events);
  return useMemo(() => [...local, ...google], [local, google]);
}
