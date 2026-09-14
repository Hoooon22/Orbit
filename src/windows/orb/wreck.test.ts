import { describe, expect, it } from "vitest";
import { ASSEMBLE_TOTAL_MS, assembleDelay, assemblePose, burst, PART_IDS, PARTS, partBounds, standingY, stepBody } from "./wreck";
import type { Stage } from "./wreck";

const S: Stage = { w: 1920, h: 1040, spriteW: 85, spriteH: 120, padBottom: 8 };

// 0.5만 내는 난수: 조각이 전부 같은 방향·세기로 튀게 해 검증하기 쉽게
const half = () => 0.5;

describe("partBounds", () => {
  it("lays every part on the ground line and keeps it inside the window", () => {
    const u = S.spriteH / 340;
    for (const id of PART_IDS) {
      const b = partBounds(id, S);
      expect(b.minX).toBeLessThanOrEqual(0);
      expect(b.maxX).toBeLessThan(S.w);
      expect(b.ceilingY).toBeLessThanOrEqual(0);
      // 눕는 y에서 조각 아래쪽(cy + r)이 바닥선(viewBox 300)에 닿는다
      expect(b.groundY + (PARTS[id].cy + PARTS[id].r) * u).toBeCloseTo(standingY(S) + 300 * u);
    }
  });
});

describe("burst", () => {
  it("inherits part of the pet velocity and scales the spread with the impact", () => {
    const soft = burst({ x: 100, y: 100 }, { vx: 500, vy: 0 }, 1000, half);
    const hard = burst({ x: 100, y: 100 }, { vx: 500, vy: 0 }, 3000, half);
    for (const id of PART_IDS) {
      expect(soft[id].x).toBe(100);
      expect(soft[id].landed).toBe(false);
      expect(soft[id].vy).toBeLessThan(0); // 위로 튄다
      expect(Math.abs(hard[id].vy)).toBeGreaterThan(Math.abs(soft[id].vy));
      expect(Math.abs(hard[id].va)).toBeGreaterThan(Math.abs(soft[id].va));
    }
  });
  it("differs from throw to throw", () => {
    let n = 0;
    const rng = () => ((n += 7) % 13) / 13;
    const a = burst({ x: 0, y: 0 }, { vx: 0, vy: 0 }, 1000, rng);
    const b = burst({ x: 0, y: 0 }, { vx: 0, vy: 0 }, 1000, rng);
    expect(a.torso.vx).not.toBe(b.torso.vx);
    expect(a.torso.vx).not.toBe(a.head.vx);
  });
});

describe("stepBody", () => {
  it("falls, bounces, slows its spin on impact and eventually lands", () => {
    const bounds = partBounds("torso", S);
    let b = { x: 500, y: 100, a: 0, vx: 300, vy: 0, va: 400, landed: false };
    let bounced = false;
    for (let i = 0; i < 600 && !b.landed; i++) {
      const next = stepBody(b, 1 / 60, bounds);
      if (Math.abs(next.va) < Math.abs(b.va)) bounced = true;
      b = next;
    }
    expect(bounced).toBe(true);
    expect(b.landed).toBe(true);
    expect(b.y).toBe(bounds.groundY);
    expect(b.va).toBe(0);
    expect(stepBody(b, 1 / 60, bounds)).toBe(b); // 누운 조각은 그대로
  });
});

describe("scatter", () => {
  it("every part flies on its own, comes to rest on its own ground line within a few seconds, inside the window", () => {
    let n = 0;
    const rng = () => ((n += 7919) % 1000) / 1000;
    const bounds = Object.fromEntries(PART_IDS.map((id) => [id, partBounds(id, S)]));
    let bodies = burst({ x: 900, y: 400 }, { vx: 1500, vy: -300 }, 3000, rng);
    let frames = 0;
    while (frames < 60 * 8 && !PART_IDS.every((id) => bodies[id].landed)) {
      bodies = Object.fromEntries(PART_IDS.map((id) => [id, stepBody(bodies[id], 1 / 60, bounds[id])])) as typeof bodies;
      frames++;
    }
    expect(frames).toBeLessThan(60 * 8);
    const xs = new Set<number>();
    for (const id of PART_IDS) {
      expect(bodies[id].y).toBe(bounds[id].groundY);
      expect(bodies[id].x).toBeGreaterThanOrEqual(bounds[id].minX);
      expect(bodies[id].x).toBeLessThanOrEqual(bounds[id].maxX);
      xs.add(Math.round(bodies[id].x));
    }
    expect(xs.size).toBeGreaterThan(5); // 한 덩어리로 떨어지지 않는다
  });
});

describe("assemble", () => {
  it("starts at the resting pose and ends exactly at the target with the angle unwound", () => {
    const from = { x: 50, y: 900, a: 700 };
    const to = { x: 300, y: 912, a: 0 };
    expect(assemblePose(from, to, 0)).toEqual({ x: 50, y: 900, a: -20 }); // 700° = 340° = -20°
    expect(assemblePose(from, to, 1)).toEqual({ x: 300, y: 912, a: 0 });
    expect(assemblePose(from, to, -1)).toEqual(assemblePose(from, to, 0)); // 자기 차례 전엔 안 움직인다
  });
  it("orders head, then torso, arms, legs, all within the total", () => {
    expect(assembleDelay("head")).toBe(0);
    expect(assembleDelay("torso")).toBeLessThan(assembleDelay("upperarm-left"));
    expect(assembleDelay("forearm-left")).toBeLessThan(assembleDelay("thigh-left"));
    expect(assembleDelay("shin-right") + 300).toBeLessThanOrEqual(ASSEMBLE_TOTAL_MS);
  });
});
