// 산산조각: 세게 던져진 피코가 부딪히면 머리 + 조각 9개가 각각 독립된 물체로 날아가 바닥·벽에 튕기고,
// 다 멈추면 머리가 먼저 제자리로 일어난 뒤 조각이 몸통→위팔→아래팔→허벅지→정강이 순서로 머리에 붙는다.
// 좌표는 작업 영역 크기로 넓힌 오브 창 안의 논리 px. 조각 하나의 "위치"는 그 조각이 원래 자리에 그려진
// 스프라이트 상자의 왼쪽 위다 — 조각이 전부 같은 상자 자리로 오면 원래 모습이 된다.
// 순수 계산(burst·stepBody·assemblePose)은 여기, 그리기는 pet/WreckStage.tsx, 창 넓히기·되돌리기는 petLoop.
import { create } from "zustand";
import { stepThrow, THROW } from "./motion";
import type { Bounds } from "./motion";

export type PartId =
  | "head"
  | "torso"
  | "upperarm-left"
  | "upperarm-right"
  | "forearm-left"
  | "forearm-right"
  | "thigh-left"
  | "thigh-right"
  | "shin-left"
  | "shin-right";

// viewBox(240×340) 안 조각의 중심, 누웠을 때 반두께, 붙는 순서(머리 다음 0부터). Pico.tsx 그림과 맞춰야 한다
export const PARTS: Record<PartId, { cx: number; cy: number; r: number; order: number }> = {
  head: { cx: 120, cy: 100, r: 49, order: -1 },
  torso: { cx: 120, cy: 194, r: 44, order: 0 },
  "upperarm-left": { cx: 78, cy: 181, r: 10, order: 1 },
  "upperarm-right": { cx: 162, cy: 181, r: 10, order: 1 },
  "forearm-left": { cx: 78, cy: 205, r: 10, order: 2 },
  "forearm-right": { cx: 162, cy: 205, r: 10, order: 2 },
  "thigh-left": { cx: 102, cy: 244, r: 10, order: 3 },
  "thigh-right": { cx: 138, cy: 244, r: 10, order: 3 },
  "shin-left": { cx: 102, cy: 268, r: 10, order: 4 },
  "shin-right": { cx: 138, cy: 268, r: 10, order: 4 },
};
export const PART_IDS = Object.keys(PARTS) as PartId[];

const VIEW_H = 340;
const GROUND_LINE = 300; // viewBox에서 발이 닿는 선 (발바닥 289, 그림자 322 사이)

export type Stage = {
  w: number; // 넓힌 창의 논리 크기
  h: number;
  spriteW: number; // 스프라이트 상자(논리)
  spriteH: number;
  padBottom: number; // 상자 아래 그림자 여백 — 서 있을 때 발이 h - padBottom에
};

export type Pose = { x: number; y: number; a: number }; // 상자 왼쪽 위(px), 조각 중심 기준 기울기(deg)
export type Body = Pose & { vx: number; vy: number; va: number; landed: boolean };
export type Rng = () => number; // [0, 1)

const unit = (s: Stage) => s.spriteH / VIEW_H;

// 서 있는 상자의 y
export const standingY = (s: Stage) => s.h - s.padBottom - s.spriteH;

// 조각별 이동 범위: 조각 자체가 창 안에 머물고, 눕는 높이가 바닥선에 닿도록
export function partBounds(id: PartId, s: Stage): Bounds {
  const p = PARTS[id];
  const u = unit(s);
  return {
    minX: -(p.cx - p.r) * u,
    maxX: s.w - (p.cx + p.r) * u,
    ceilingY: -(p.cy - p.r) * u,
    groundY: standingY(s) + (GROUND_LINE - p.cy - p.r) * u,
  };
}

// 부딪힌 순간: 펫이 튕긴 속도 일부를 물려받고, 충돌 속도에 비례해 사방으로 튄다. 그래서 던질 때마다 다르다
export function burst(start: { x: number; y: number }, v: { vx: number; vy: number }, impact: number, rng: Rng): Record<PartId, Body> {
  const out = {} as Record<PartId, Body>;
  for (const id of PART_IDS) {
    const ang = rng() * Math.PI * 2;
    const speed = impact * (0.3 + rng() * 0.6);
    out[id] = {
      x: start.x,
      y: start.y,
      a: 0,
      vx: v.vx * 0.6 + Math.cos(ang) * speed,
      vy: v.vy * 0.6 + Math.sin(ang) * speed - impact * 0.3, // 위로 튀는 성분
      va: (rng() < 0.5 ? -1 : 1) * impact * (0.15 + rng() * 0.35), // deg/s
      landed: false,
    };
  }
  return out;
}

// 조각 한 프레임: 포물선·튕김은 펫 던지기와 같은 물리, 회전은 부딪힐 때마다 줄고 멈추면 그대로 눕는다
export function stepBody(b: Body, dt: number, bounds: Bounds): Body {
  if (b.landed) return b;
  const r = stepThrow(b, dt, bounds, THROW);
  let va = b.va;
  if (r.impact > 0) va *= 0.55;
  if (r.landed) va = 0;
  return { ...r.next, a: b.a + va * dt, va, landed: r.landed };
}

// ── 붙기 ──
export const ASSEMBLE = { headMs: 320, startMs: 300, gapMs: 170, partMs: 300, holdMs: 200 };
export const assembleDelay = (id: PartId) => (id === "head" ? 0 : ASSEMBLE.startMs + PARTS[id].order * ASSEMBLE.gapMs);
export const assembleMs = (id: PartId) => (id === "head" ? ASSEMBLE.headMs : ASSEMBLE.partMs);
export const ASSEMBLE_TOTAL_MS = ASSEMBLE.startMs + 4 * ASSEMBLE.gapMs + ASSEMBLE.partMs + ASSEMBLE.holdMs;

// 살짝 지나쳤다 돌아오는 "촥" 느낌
export const backOut = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

// 누운 자리에서 목표 자리로. 기울기는 가까운 쪽으로 돌아 0이 된다
export function assemblePose(from: Pose, to: Pose, t: number): Pose {
  const e = backOut(t);
  const a0 = ((from.a % 360) + 540) % 360 - 180;
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, a: a0 - a0 * e };
}

// ── 그리기용 상태 ──
type WreckStore = { stage: Stage | null; poses: Record<PartId, Pose> | null };
export const useWreck = create<WreckStore>(() => ({ stage: null, poses: null }));

const SCATTER_MAX_MS = 8000; // 혹시 영영 안 멈추면 여기서 끊는다
const SETTLE_MS = 350; // 다 멈춘 뒤 붙기 시작까지

function frames(fn: (dt: number, elapsed: number) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let last = t0;
    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      if (fn(dt, now - t0)) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// 흩어졌다 붙을 때까지. 붙고 나서 서 있는 상자의 x(창 안 논리 px)를 돌려준다
export async function runWreck(o: {
  stage: Stage;
  start: { x: number; y: number };
  v: { vx: number; vy: number };
  impact: number;
  rng?: Rng;
}): Promise<number> {
  const { stage } = o;
  const bounds = Object.fromEntries(PART_IDS.map((id) => [id, partBounds(id, stage)])) as Record<PartId, Bounds>;
  let bodies = burst(o.start, o.v, o.impact, o.rng ?? Math.random);
  useWreck.setState({ stage, poses: bodies });

  await frames((dt, elapsed) => {
    bodies = Object.fromEntries(PART_IDS.map((id) => [id, stepBody(bodies[id], dt, bounds[id])])) as Record<PartId, Body>;
    useWreck.setState({ poses: bodies });
    return PART_IDS.every((id) => bodies[id].landed) || elapsed > SCATTER_MAX_MS;
  });
  await new Promise((r) => window.setTimeout(r, SETTLE_MS));

  const standX = Math.max(0, Math.min(stage.w - stage.spriteW, bodies.head.x));
  const target: Pose = { x: standX, y: standingY(stage), a: 0 };
  const from = bodies;
  await frames((_dt, elapsed) => {
    const poses = Object.fromEntries(
      PART_IDS.map((id) => [id, assemblePose(from[id], target, (elapsed - assembleDelay(id)) / assembleMs(id))]),
    ) as Record<PartId, Pose>;
    useWreck.setState({ poses });
    return elapsed >= ASSEMBLE_TOTAL_MS;
  });
  useWreck.setState({ stage: null, poses: null });
  return standX;
}
