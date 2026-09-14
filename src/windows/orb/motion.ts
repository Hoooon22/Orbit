// 펫 이동의 순수 계산. 좌표는 전부 물리 픽셀(창 위치·모니터 작업 영역과 같은 단위).
// 상수는 WorkPet의 값을 100% 배율 기준으로 두고, petLoop가 배율만큼 키워서 넘긴다.
import type { PetWander } from "../../shared/api";

export type Bounds = {
  minX: number; // 창 x의 최소 (스프라이트가 화면 왼쪽 끝에 닿는 곳)
  maxX: number;
  groundY: number; // 창 y: 아래 변이 작업 영역 바닥
  ceilingY: number; // 창 y의 최소 (던졌을 때 튕기는 천장)
};

export type WorkArea = { x: number; y: number; width: number; height: number };

// 걸어 다닐 수 있는 창 좌표 범위. sidePad = 창 양옆의 투명 여백(물리) — 그만큼 밖으로 나가야 스프라이트가 끝에 닿는다
export function walkBounds(area: WorkArea, win: { width: number; height: number }, sidePad: number): Bounds {
  return {
    minX: area.x - sidePad,
    maxX: area.x + area.width - win.width + sidePad,
    groundY: area.y + area.height - win.height,
    ceilingY: area.y,
  };
}

export const clampX = (x: number, b: Bounds) => Math.max(b.minX, Math.min(b.maxX, x));

// 배회 한 걸음. 끝에 닿으면 방향을 바꾼다
export function wanderStep(x: number, dir: 1 | -1, step: number, b: Bounds): { x: number; dir: 1 | -1 } {
  const nx = x + dir * step;
  if (nx <= b.minX) return { x: b.minX, dir: 1 };
  if (nx >= b.maxX) return { x: b.maxX, dir: -1 };
  return { x: nx, dir };
}

// 배회 빈도: 서 있는 시간·걷는 시간 범위(ms). 자주 = 덜 서 있고 오래 걷는다
export const WANDER_RANGES: Record<Exclude<PetWander, "off">, { idle: [number, number]; walk: [number, number] }> = {
  low: { idle: [6000, 12000], walk: [2500, 5000] },
  normal: { idle: [2500, 5500], walk: [3500, 8000] },
  high: { idle: [800, 2200], walk: [5500, 11000] },
};

export const randomBetween = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// ── 던지기 ──
export type Sample = { t: number; x: number; y: number };
export type Velocity = { vx: number; vy: number; speed: number };

// 놓기 직전 windowMs 동안의 커서 표본으로 초속을 구한다. 표본이 모자라거나 시간이 너무 짧으면 0
export function throwVelocity(samples: Sample[], windowMs = 70, maxSpeed = 3200): Velocity {
  if (samples.length < 2) return { vx: 0, vy: 0, speed: 0 };
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > windowMs) break;
    first = samples[i];
  }
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.012) return { vx: 0, vy: 0, speed: 0 };
  let vx = (last.x - first.x) / dt;
  let vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    vx *= maxSpeed / speed;
    vy *= maxSpeed / speed;
    return { vx, vy, speed: maxSpeed };
  }
  return { vx, vy, speed };
}

export type ThrowParams = {
  gravity: number; // px/s²
  wall: number; // 벽·천장 반발
  ground: number; // 바닥 반발
  friction: number; // 바닥에 닿을 때마다 vx에 곱함
  restVy: number; // 이보다 느리면 멈춘 것으로
  restVx: number;
  minLaunch: number; // 이보다 느리면 던진 게 아니라 놓은 것
};

export const THROW: ThrowParams = {
  gravity: 2600,
  wall: 0.55,
  ground: 0.32,
  friction: 0.82,
  restVy: 70,
  restVx: 35,
  minLaunch: 260,
};

// 배율이 다른 모니터에서도 같은 손맛이 나게 길이 단위 상수를 배율만큼 키운다
export const scaledThrow = (scale: number): ThrowParams => ({
  ...THROW,
  gravity: THROW.gravity * scale,
  restVy: THROW.restVy * scale,
  restVx: THROW.restVx * scale,
  minLaunch: THROW.minLaunch * scale,
});

export type Flight = { x: number; y: number; vx: number; vy: number };

// 포물선 한 프레임. 벽·천장·바닥에서 튕기고, 바닥에서 충분히 느려지면 landed.
// impact = 이 프레임에 부딪힌 면에 수직인 속도(px/s). 안 부딪혔으면 0
export function stepThrow(
  f: Flight,
  dt: number,
  b: Bounds,
  k: ThrowParams = THROW,
): { next: Flight; landed: boolean; impact: number } {
  let { x, y, vx, vy } = f;
  let impact = 0;
  vy += k.gravity * dt;
  x += vx * dt;
  y += vy * dt;
  if (x < b.minX) {
    x = b.minX;
    impact = Math.abs(vx);
    vx = -vx * k.wall;
  } else if (x > b.maxX) {
    x = b.maxX;
    impact = Math.abs(vx);
    vx = -vx * k.wall;
  }
  if (y < b.ceilingY) {
    // 천장에 닿으면 튕겨 내린다. 안 그러면 OS가 창을 위 끝에 붙잡은 채 vy만 음수라 옆으로 미끄러진다
    y = b.ceilingY;
    impact = Math.max(impact, Math.abs(vy));
    vy = Math.abs(vy) * k.wall;
  }
  if (y >= b.groundY) {
    y = b.groundY;
    impact = Math.max(impact, Math.abs(vy));
    if (Math.abs(vy) < k.restVy && Math.abs(vx) < k.restVx) {
      return { next: { x, y, vx: 0, vy: 0 }, landed: true, impact };
    }
    vy = -vy * k.ground;
    vx *= k.friction;
  }
  return { next: { x, y, vx, vy }, landed: false, impact };
}

// 이보다 약하게 부딪히면 그냥 튕기고, 중간 이상이면 피코가 산산조각 난다 (px/s, 100% 배율 기준).
// 흩어지는 세기는 문턱이 아니라 실제 충돌 속도에 비례한다 (wreck.ts)
export const SHATTER_SPEED = 1000;

export const shatters = (impact: number, scale: number) => impact >= SHATTER_SPEED * scale;
