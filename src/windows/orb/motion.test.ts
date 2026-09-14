import { describe, expect, it } from "vitest";
import { stepThrow, throwVelocity, walkBounds, wanderStep, THROW, scaledThrow, clampX } from "./motion";
import type { Bounds } from "./motion";

const B: Bounds = { minX: -6, maxX: 1000, groundY: 900, ceilingY: 0 };

describe("walkBounds", () => {
  it("lets the sprite reach the edges by the side padding and puts the ground at the work-area bottom", () => {
    const b = walkBounds({ x: 0, y: 0, width: 1920, height: 1040 }, { width: 97, height: 128 }, 6);
    expect(b).toEqual({ minX: -6, maxX: 1920 - 97 + 6, groundY: 1040 - 128, ceilingY: 0 });
  });
  it("works on a monitor with negative coordinates", () => {
    const b = walkBounds({ x: -1920, y: -80, width: 1920, height: 1040 }, { width: 97, height: 128 }, 0);
    expect(b.minX).toBe(-1920);
    expect(b.groundY).toBe(-80 + 1040 - 128);
  });
});

describe("wanderStep", () => {
  it("steps and flips at the edges", () => {
    expect(wanderStep(500, -1, 4, B)).toEqual({ x: 496, dir: -1 });
    expect(wanderStep(-4, -1, 4, B)).toEqual({ x: -6, dir: 1 });
    expect(wanderStep(999, 1, 4, B)).toEqual({ x: 1000, dir: -1 });
  });
  it("clampX keeps a dropped pet on screen", () => {
    expect(clampX(-500, B)).toBe(-6);
    expect(clampX(5000, B)).toBe(1000);
  });
});

describe("throwVelocity", () => {
  it("uses only the last 70ms of samples", () => {
    const s = [
      { t: 0, x: 0, y: 0 },
      { t: 500, x: 0, y: 0 }, // 오래 멈춰 있다가
      { t: 550, x: 50, y: -20 }, // 마지막 50ms에 휙
    ];
    const v = throwVelocity(s);
    expect(v.vx).toBeCloseTo(1000);
    expect(v.vy).toBeCloseTo(-400);
  });
  it("caps the speed", () => {
    const v = throwVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 16, x: 400, y: 0 },
    ]);
    expect(v.speed).toBe(3200);
    expect(v.vx).toBeCloseTo(3200);
  });
  it("is zero with too few or too close samples", () => {
    expect(throwVelocity([{ t: 0, x: 0, y: 0 }]).speed).toBe(0);
    expect(
      throwVelocity([
        { t: 0, x: 0, y: 0 },
        { t: 5, x: 100, y: 0 },
      ]).speed,
    ).toBe(0);
  });
});

describe("stepThrow", () => {
  it("falls under gravity and bounces off the ground with friction", () => {
    const r = stepThrow({ x: 100, y: 899, vx: 200, vy: 1000 }, 0.01, B);
    expect(r.landed).toBe(false);
    expect(r.next.y).toBe(B.groundY);
    expect(r.next.vy).toBeLessThan(0); // 튕겨 올라감
    expect(r.next.vx).toBeCloseTo(200 * THROW.friction);
  });
  it("bounces off walls and the ceiling", () => {
    const wall = stepThrow({ x: B.maxX - 1, y: 500, vx: 1000, vy: 0 }, 0.01, B);
    expect(wall.next.x).toBe(B.maxX);
    expect(wall.next.vx).toBeCloseTo(-1000 * THROW.wall);
    const ceil = stepThrow({ x: 500, y: 1, vx: 0, vy: -1000 }, 0.01, B);
    expect(ceil.next.y).toBe(B.ceilingY);
    expect(ceil.next.vy).toBeGreaterThan(0);
  });
  it("lands when slow enough on the ground", () => {
    const r = stepThrow({ x: 100, y: B.groundY, vx: 10, vy: 10 }, 0.01, B);
    expect(r.landed).toBe(true);
    expect(r.next).toEqual({ x: 100.1, y: B.groundY, vx: 0, vy: 0 });
  });
  it("scales length constants with the monitor scale", () => {
    const k = scaledThrow(2);
    expect(k.gravity).toBe(THROW.gravity * 2);
    expect(k.minLaunch).toBe(THROW.minLaunch * 2);
    expect(k.wall).toBe(THROW.wall); // 비율은 그대로
  });
});
