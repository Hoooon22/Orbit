// 펫이 혼자 있을 때 무엇을 할지 고르는 순수 계산: 서 있을 때의 동작 · 움직이는 방식 · 혼잣말.
// 난수는 밖에서 받아(r = 0 이상 1 미만) 테스트에서 고정할 수 있다. 실제 재생·이동은 petLoop가 한다.
import type { PetAction } from "./pet/PetSprite";

// 가중치 뽑기. 가중치 합이 0이면 첫 항목
export function pickWeighted<T>(items: readonly (readonly [T, number])[], r: number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let at = r * total;
  for (const [v, w] of items) {
    if (at < w) return v;
    at -= w;
  }
  return items[0][0];
}

// 잠깐 하는 동작의 길이(ms). "한 번" 재생하는 것(yawn·look·sit·spin·sneeze·doze)은 pet.css의 길이와 같아야 한다
export const ACT_MS = {
  stretch: 2100,
  wave: 2500,
  dance: 3000,
  think: 3000,
  love: 3000,
  angry: 3000,
  yawn: 2800,
  look: 3200,
  sit: 7000,
  cheer: 2200,
  jacks: 3600,
  spin: 1600,
  sneeze: 1500,
  sing: 4800,
  doze: 4200,
} satisfies Partial<Record<PetAction, number>>;

export type Act = keyof typeof ACT_MS;

// 걷다가 멈춰 설 때 이 확률로 아래 동작 하나를 한다
export const IDLE_ACT_CHANCE = 0.45;

// [동작, 낮 가중치, 밤(23~6시) 가중치] — 밤에는 졸린 동작이 많다
const IDLE_ACTS: readonly (readonly [Act, number, number])[] = [
  ["look", 5, 3],
  ["stretch", 3, 3],
  ["sit", 3, 4],
  ["yawn", 2, 7],
  ["doze", 1, 7],
  ["sing", 3, 1],
  ["jacks", 2, 0],
  ["cheer", 2, 0],
  ["spin", 2, 1],
  ["sneeze", 2, 2],
  ["wave", 2, 1],
  ["dance", 1, 0],
];

export const isNight = (hour: number) => hour >= 23 || hour < 6;

export function pickIdleAct(hour: number, r: number): Act {
  const night = isNight(hour);
  return pickWeighted(
    IDLE_ACTS.map(([a, day, late]) => [a, night ? late : day] as const),
    r,
  );
}

// 걸음. 속도는 논리 px/s
export type Gait = "walk" | "run" | "tiptoe";
export const GAIT_SPEED: Record<Gait, number> = { walk: 80, run: 190, tiptoe: 40 };

// 움직이기 시작할 때: 대개 걷고, 가끔 달리거나 살금살금 가거나 폴짝 뛴다
export type Move = Gait | "jump";
const MOVES: readonly (readonly [Move, number])[] = [
  ["walk", 62],
  ["run", 15],
  ["tiptoe", 10],
  ["jump", 13],
];
export const pickMove = (r: number): Move => pickWeighted(MOVES, r);

// ── 혼잣말 ──
export type ChatContext = {
  hour: number;
  pending: number; // 당장 할 일 개수
  timers: number; // 돌고 있는 타이머 개수
};
export type ChatLine = { text: string; act?: Act };

// 지금 상황에 맞는 말은 가중치를 높여 아무 말보다 자주 나오게 한다
export function chatLines(c: ChatContext): (readonly [ChatLine, number])[] {
  const lines: (readonly [ChatLine, number])[] = [
    [{ text: "오늘도 화이팅이에요!", act: "cheer" }, 1],
    [{ text: "물 한 잔 어때요? 💧" }, 1],
    [{ text: "어깨 한번 쭉 펴요", act: "stretch" }, 1],
    [{ text: "잠깐 먼 곳을 보면서 눈 좀 쉬어요", act: "look" }, 1],
    [{ text: "흥얼흥얼 ♪", act: "sing" }, 1],
    [{ text: "저 여기 있어요!", act: "wave" }, 1],
    [{ text: "같이 있으니까 좋아요", act: "love" }, 1],
    [{ text: "에… 에취! 누가 제 얘기 하나 봐요", act: "sneeze" }, 1],
  ];
  if (c.pending > 0) lines.push([{ text: `당장 할 일이 ${c.pending}개 남았어요`, act: "think" }, 3]);
  if (c.timers > 0) lines.push([{ text: "타이머 도는 중! 집중, 집중 🔥", act: "jacks" }, 3]);
  if (c.hour >= 6 && c.hour < 10) lines.push([{ text: "좋은 아침! 오늘도 잘 부탁해요", act: "wave" }, 3]);
  if (c.hour >= 12 && c.hour < 14) lines.push([{ text: "점심은 챙겨 먹었어요? 🍚" }, 3]);
  if (c.hour >= 15 && c.hour < 17) lines.push([{ text: "간식 먹을 시간 아닌가요? 🍪", act: "dance" }, 3]);
  if (c.hour >= 18 && c.hour < 21) lines.push([{ text: "오늘 하루도 수고했어요", act: "cheer" }, 3]);
  if (isNight(c.hour)) lines.push([{ text: "하암… 늦었어요. 슬슬 잘 시간이에요", act: "yawn" }, 6]);
  return lines;
}

export const pickChat = (c: ChatContext, r: number): ChatLine => pickWeighted(chatLines(c), r);

// 혼잣말 사이 간격(ms). 가끔만 — 켠 직후 첫마디는 조금 일찍
export const CHAT_FIRST_MS: [number, number] = [2 * 60_000, 4 * 60_000];
export const CHAT_GAP_MS: [number, number] = [6 * 60_000, 14 * 60_000];
