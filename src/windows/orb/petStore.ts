import { create } from "zustand";
import type { PetAction } from "./pet/PetSprite";
import type { Gait } from "./behavior";

// 펫의 순간 상태. 진실은 이 창 하나(펫은 한 마리)라 여기가 원본이다.
// 50ms 배회 틱·16ms 드래그 폴링 같은 핫 루프는 React를 거치지 않고 getState()로 읽는다.
export type PetPhase =
  | "idle" // 서 있음 (배회를 기다림)
  | "walk" // 배회 중
  | "held" // 사용자가 잡고 있음 (OS 드래그 루프)
  | "falling" // 놓은 뒤 바닥으로 떨어지는 중
  | "throwing" // 던져져 날아가는 중 (피코가 산산조각 나 붙는 동안도 포함)
  | "jumping"; // 혼자 폴짝 뛰는 중 (petLoop hop이 창을 포물선으로 옮긴다)

type PetStore = {
  phase: PetPhase;
  gait: Gait; // 배회할 때의 걸음 (phase가 walk일 때만 뜻이 있다)
  oneShot: PetAction | null; // 잠깐 하는 동작 (손 흔들기·춤·알림 …). 있으면 다른 표정보다 우선
  direction: "left" | "right";
  hover: boolean; // 커서가 펫 위에 있음 (배회를 멈추고 또렷하게)
  setPhase: (p: PetPhase) => void;
  setGait: (g: Gait) => void;
  setDirection: (d: "left" | "right") => void;
  setHover: (h: boolean) => void;
  playAction: (a: PetAction, ms: number) => void;
  clearAction: () => void;
};

let timer: number | undefined;

export const usePet = create<PetStore>((set) => ({
  phase: "idle",
  gait: "walk",
  oneShot: null,
  direction: "left",
  hover: false,
  setPhase: (phase) => set({ phase }),
  setGait: (gait) => set({ gait }),
  setDirection: (direction) => set({ direction }),
  setHover: (hover) => set({ hover }),
  playAction: (a, ms) => {
    window.clearTimeout(timer);
    set({ oneShot: a });
    timer = window.setTimeout(() => set({ oneShot: null }), ms);
  },
  clearAction: () => {
    window.clearTimeout(timer);
    set({ oneShot: null });
  },
}));
