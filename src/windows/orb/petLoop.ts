// 펫의 이동 루프: 배회(50ms) · 드래그 폴링(16ms) · 놓은 뒤 낙하/던지기.
// 창을 옮기는 건 전부 여기서 setPosition으로 한다 (Rust는 창 크기·바닥 배치만).
// 좌표는 물리 픽셀. 핫 루프는 React 상태 대신 스토어 getState()와 모듈 전역 캐시를 읽는다.
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import type { Monitor } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { PetSize } from "../../shared/api";
import { dragProbe, resizeOrb, setOrbBounds } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { todayStr } from "../../shared/dates";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { runningTimers, useTimers } from "../../modules/timer/store";
import { ACT_MS, CHAT_FIRST_MS, CHAT_GAP_MS, GAIT_SPEED, IDLE_ACT_CHANCE, pickChat, pickIdleAct, pickMove } from "./behavior";
import type { Act, Gait } from "./behavior";
import { resizeHooks, useBubble } from "./bubbleStore";
import { useOrbStatus } from "./status";
import { usePet } from "./petStore";
import { boxFor, SHADOW_PAD, SPRITE_H } from "./pet/catalog";
import {
  clampX,
  easeOutCubic,
  randomBetween,
  scaledThrow,
  shatters,
  stepThrow,
  throwVelocity,
  walkBounds,
  wanderStep,
  WANDER_RANGES,
} from "./motion";
import type { Bounds, Flight, Sample, ThrowParams, Velocity } from "./motion";
import { runWreck } from "./wreck";

const WANDER_TICK_MS = 50;
const DRAG_POLL_MS = 16;
const USER_COOLDOWN_MS = 1500; // 잡았다 놓은 뒤 이만큼은 배회를 쉰다
const FALL_MS = 500;
const TUMBLE_MS = 1500;
const HOP_MS = 700; // 폴짝 한 번. pet.css jump 한 주기와 같다
const HOP_HEIGHT = 70; // 논리 px
const RUN_TIME = 0.5; // 달릴 때는 걷는 시간의 이만큼만 (빨라서 금방 화면 끝이다)
const ANGRY_THROWS = 3; // 이 시간 안에 이만큼 던지면 화낸다
const ANGRY_WINDOW_MS = 20_000;
const GREETING_KEY = "orbMorningGreetedOn"; // localStorage. 아침 인사는 하루 한 번

const win = getCurrentWindow();
// 창 왼쪽 위·크기(물리)와 배율. onMoved/rebounds가 갱신한다 — 루프마다 IPC로 묻지 않기 위한 사본
const pos = { x: 0, y: 0 };
const size = { w: 0, h: 0 };
let scale = 1;
let bounds: Bounds | null = null;
let lastUserActionAt = 0;
let panelOpen = false; // 패널이 펫 옆에 떠 있는 동안은 걷지 않는다 (패널은 연 자리에 그대로 있으므로)
// 말풍선으로 창이 넓어진 동안 펫 상자 바깥에 붙은 폭(물리). 펫은 말풍선을 단 채로 계속 걷는다 —
// left = 펫 왼쪽에 붙은 말풍선 폭(창 x가 그만큼 펫보다 왼쪽), right = 오른쪽. 접히면 둘 다 0
const bubbleExtra = { left: 0, right: 0 };

let lastMove: Promise<void> = Promise.resolve(); // 마지막 이동 IPC. 창 크기를 바꾸기 전에 기다린다 (뒤늦게 옛 자리로 옮기지 않게)

async function move(x: number, y: number) {
  pos.x = x;
  pos.y = y;
  lastMove = win.setPosition(new PhysicalPosition(x, y)).catch(() => {
    // 창이 사라지는 중 등. 다음 틱에 다시
  });
  await lastMove;
}

async function monitorHere(): Promise<Monitor | null> {
  return (
    (await monitorFromPoint(pos.x + size.w / 2, pos.y + size.h / 2)) ??
    (await currentMonitor()) ??
    (await primaryMonitor())
  );
}

// 창 위치·크기·배율을 다시 읽고, 지금 있는 모니터의 작업 영역으로 이동 범위를 다시 잡는다.
// 시작할 때와 드래그가 끝날 때(다른 모니터로 옮겼을 수 있다) 부른다.
export async function rebounds(): Promise<Bounds | null> {
  const [p, s, sc] = await Promise.all([win.outerPosition(), win.outerSize(), win.scaleFactor()]);
  pos.x = p.x;
  pos.y = p.y;
  size.w = s.width;
  size.h = s.height;
  scale = sc;
  const m = await monitorHere();
  if (!m) return (bounds = null);
  const a = m.workArea;
  bounds = walkBounds(
    { x: a.position.x, y: a.position.y, width: a.size.width, height: a.size.height },
    { width: size.w, height: size.h },
    Math.round(SHADOW_PAD.side * sc),
  );
  return bounds;
}

async function snapToGround() {
  const b = bounds ?? (await rebounds());
  if (!b) return;
  const x = clampX(pos.x, b);
  if (x !== pos.x || pos.y !== b.groundY) await move(x, b.groundY);
}

const play = (a: Act) => usePet.getState().playAction(a, ACT_MS[a]);

// 혼잣말: 상황에 맞는 한마디를 말풍선으로 띄우고 어울리는 동작을 한다
function chat() {
  const line = pickChat(
    {
      hour: new Date().getHours(),
      pending: pendingNow(useTodos.getState().todos),
      timers: runningTimers(useTimers.getState().timers).length,
    },
    Math.random(),
  );
  useBubble.getState().say(line.text);
  if (line.act) play(line.act);
}

// 폴짝: 창을 포물선으로 옮겨 한두 번 뛴다. 뛰는 동안은 phase가 jumping이라 배회·잡기·말풍선이 기다린다
async function hop(dir: 1 | -1) {
  const b = bounds;
  if (!b) return;
  const pet = usePet.getState();
  pet.setPhase("jumping");
  pet.setDirection(dir === 1 ? "right" : "left");
  const hops = Math.random() < 0.4 ? 2 : 1;
  for (let i = 0; i < hops; i++) {
    const from = pos.x;
    const to = clampX(Math.round(from + dir * randomBetween(30, 90) * scale), b);
    const height = HOP_HEIGHT * scale;
    await new Promise<void>((resolve) => {
      const start = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / HOP_MS);
        void move(Math.round(from + (to - from) * t), Math.round(b.groundY - height * 4 * t * (1 - t)));
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
  pet.setPhase("idle");
  useBubble.getState().flush(); // 뛰는 동안 미뤄 둔 말풍선
}

// ── 배회 ──
function startWander(): () => void {
  let dir: 1 | -1 = -1;
  let walking = false;
  let gait: Gait = "walk";
  let phaseEnd = Date.now() + randomBetween(2000, 4000);
  let nextChatAt = Date.now() + randomBetween(...CHAT_FIRST_MS);
  let inFlight = false;
  const freq = () => useSettings.getState().settings.petWander;

  const stopWalking = () => {
    walking = false;
    // 잡히는 등 다른 이유로 phase가 바뀐 뒤라면 건드리지 않는다
    if (usePet.getState().phase === "walk") usePet.getState().setPhase("idle");
  };
  const enterIdle = (now: number) => {
    stopWalking();
    const f = freq();
    const [lo, hi] = f === "off" ? [0, 0] : WANDER_RANGES[f].idle;
    phaseEnd = now + randomBetween(lo, hi);
    // 멈춰 선 김에: 가끔 한마디, 아니면 절반쯤은 동작 하나
    if (now >= nextChatAt) {
      nextChatAt = now + randomBetween(...CHAT_GAP_MS);
      chat();
    } else if (Math.random() < IDLE_ACT_CHANCE) {
      play(pickIdleAct(new Date().getHours(), Math.random()));
    }
  };
  const enterWalk = async (now: number) => {
    const f = freq();
    if (f === "off") return;
    // 숨겨 둔 창을 걷게 하지 않는다 (보이지 않는 곳에서 위치만 흘러간다)
    if (!(await win.isVisible().catch(() => true))) {
      phaseEnd = now + 5000;
      return;
    }
    dir = Math.random() < 0.5 ? -1 : 1;
    const picked = pickMove(Math.random());
    // 말풍선이 떠 있는 동안은 뛰지 않고 걷는다 (뛰는 동안은 창을 넓히거나 줄일 수 없다)
    const m = picked === "jump" && useBubble.getState().expanded ? "walk" : picked;
    if (m === "jump") {
      // 걷는 대신 폴짝 뛰고 다시 잠깐 서 있는다 (다 뛸 때까지 틱은 phase에 막힌다)
      phaseEnd = now + randomBetween(1500, 3000);
      void hop(dir);
      return;
    }
    walking = true;
    gait = m;
    const [lo, hi] = WANDER_RANGES[f].walk;
    phaseEnd = now + randomBetween(lo, hi) * (gait === "run" ? RUN_TIME : 1);
    usePet.getState().setGait(gait);
    usePet.getState().setPhase("walk");
    usePet.getState().setDirection(dir === 1 ? "right" : "left");
  };

  const tick = async () => {
    if (inFlight) return;
    const b = bounds;
    const pet = usePet.getState();
    const st = useOrbStatus.getState();
    const bub = useBubble.getState();
    // 창을 넓히거나 줄이는 중(말풍선이 아직/이미 없음)에는 한 박자 쉰다 — 그 사이 옮기면 Rust의 창 조정과 어긋난다
    if (bub.expanded && !bub.current && !bub.timers) return;
    // 마우스를 올리거나 말풍선이 떠 있어도 멈추지 않는다 (말풍선은 창에 붙어 따라온다). 눌러서 패널을 열면 멈춘다
    const blocked =
      freq() === "off" ||
      !b ||
      panelOpen ||
      pet.oneShot !== null ||
      (pet.phase !== "idle" && pet.phase !== "walk") ||
      st.away ||
      st.meeting !== null ||
      Date.now() - lastUserActionAt < USER_COOLDOWN_MS;
    if (blocked) {
      if (walking) stopWalking();
      return;
    }
    const now = Date.now();
    if (now >= phaseEnd) {
      if (walking) enterIdle(now);
      else {
        await enterWalk(now);
        return; // 기다리는 사이 상태가 바뀌었을 수 있다. 첫걸음은 다음 틱에
      }
    }
    if (!walking) return;
    const step = Math.max(1, Math.round(((GAIT_SPEED[gait] * WANDER_TICK_MS) / 1000) * scale));
    // 걷는 건 펫 상자 기준. 말풍선이 붙은 쪽은 그 폭만큼 일찍 돌아서서 말풍선이 화면 밖으로 나가지 않게 한다
    const petX = pos.x + bubbleExtra.left;
    const r = wanderStep(petX, dir, step, { ...b, minX: b.minX + bubbleExtra.left, maxX: b.maxX - bubbleExtra.right });
    if (r.dir !== dir) {
      dir = r.dir;
      usePet.getState().setDirection(dir === 1 ? "right" : "left");
    }
    if (r.x === petX && pos.y === b.groundY) return;
    inFlight = true;
    try {
      await move(r.x - bubbleExtra.left, b.groundY);
    } finally {
      inFlight = false;
    }
  };
  const id = window.setInterval(() => void tick(), WANDER_TICK_MS);
  return () => window.clearInterval(id);
}

// ── 잡기 · 놓기 · 던지기 ──
let dragPoll: number | undefined;
let samples: Sample[] = [];
let throwTimes: number[] = []; // 최근에 던져진 시각들 (화낼지 판단)

// Pet.tsx가 마우스가 4px 넘게 움직였을 때 부른다. 시작했으면 true.
// OS 드래그(startDragging)를 쓰지 않는다 — OS 이동 루프가 도는 동안은 IPC가 멈춰 놓는 순간을 늦게 알고,
// 말풍선 접기(창 x 이동)와도 어긋난다. 대신 16ms마다 커서를 읽어 잡은 지점을 유지하며 창을 직접 옮기고,
// 버튼이 떨어지면 놓은 것으로 본다. 커서 표본은 던진 속도 계산에도 쓴다.
export function beginDrag(): boolean {
  const pet = usePet.getState();
  if (useBubble.getState().expanded || (pet.phase !== "idle" && pet.phase !== "walk")) return false;
  lastUserActionAt = Date.now();
  pet.clearAction();
  pet.setPhase("held");
  samples = [];
  let inFlight = false;
  let grip: { dx: number; dy: number } | null = null; // 커서 − 창 왼쪽 위 (처음 표본에서 잰다)
  dragPoll = window.setInterval(async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const [x, y, pressed] = await dragProbe();
      const t = performance.now();
      samples.push({ t, x, y });
      while (samples.length > 2 && t - samples[0].t > 260) samples.shift();
      if (!pressed) {
        void release();
        return;
      }
      if (!grip) grip = { dx: x - pos.x, dy: y - pos.y };
      await move(Math.round(x - grip.dx), Math.round(y - grip.dy));
    } catch {
      void release();
    } finally {
      inFlight = false;
    }
  }, DRAG_POLL_MS);
  return true;
}

async function release() {
  if (dragPoll === undefined) return;
  window.clearInterval(dragPoll);
  dragPoll = undefined;
  const v = throwVelocity(samples);
  samples = [];
  lastUserActionAt = Date.now();
  const b = await rebounds(); // 다른 모니터로 옮겼으면 그 모니터를 새 집으로
  const pet = usePet.getState();
  if (!b) {
    pet.setPhase("idle");
    return;
  }
  const k = scaledThrow(scale);
  if (v.speed >= k.minLaunch) await fly(v, b, k);
  else await fall(b);
  lastUserActionAt = Date.now();
  useSettings.getState().update({ orbX: pos.x });
  useBubble.getState().flush(); // 잡고 있는 동안 미뤄 둔 말풍선
}

async function fly(v: Velocity, b: Bounds, k: ThrowParams) {
  const pet = usePet.getState();
  pet.setPhase("throwing");
  pet.setDirection(v.vx >= 0 ? "right" : "left");
  let f: Flight = { x: pos.x, y: pos.y, vx: v.vx, vy: v.vy };
  // 피코만 조각으로 나뉘어 있다. 세게(SHATTER_SPEED 이상) 부딪히는 순간 날기를 멈추고 산산조각으로 넘어간다
  const canWreck = useSettings.getState().settings.petKind === "pico";
  let impact = 0;
  await new Promise<void>((resolve) => {
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      const r = stepThrow(f, dt, b, k);
      f = r.next;
      // 벽에 튕겨 방향이 바뀌면 그쪽을 본다
      if (Math.abs(f.vx) > 60 * scale) usePet.getState().setDirection(f.vx >= 0 ? "right" : "left");
      lastUserActionAt = Date.now();
      void move(Math.round(f.x), Math.round(f.y));
      if (canWreck && shatters(r.impact, scale)) {
        impact = r.impact;
        resolve();
      } else if (r.landed) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  if (!(impact > 0 && (await wreck(f, impact)))) {
    // 날아가는 동안 배율이 다른 모니터로 넘어갔을 수 있다
    await rebounds();
    await snapToGround();
  }
  pet.setPhase("idle");
  // 자꾸 던지면 어지러워하는 대신 화낸다
  const now = Date.now();
  throwTimes = throwTimes.filter((t) => now - t < ANGRY_WINDOW_MS);
  throwTimes.push(now);
  if (throwTimes.length >= ANGRY_THROWS) {
    throwTimes = [];
    play("angry");
    useBubble.getState().say("그만 던져요! 💢");
  } else {
    pet.playAction("tumble", TUMBLE_MS);
  }
}

// 산산조각: 창을 지금 모니터의 작업 영역 전체로 넓혀 조각들이 화면을 굴러다니게 하고(wreck.ts),
// 다 붙으면 붙은 자리에 펫 상자 크기로 되돌린다. 넓힌 동안은 클릭이 아래 창으로 통과한다.
// 모니터를 못 찾으면 false — 보통 착지로 마무리한다
async function wreck(f: Flight, impact: number): Promise<boolean> {
  const m = await monitorHere();
  if (!m) return false;
  const a = m.workArea;
  const sc = m.scaleFactor;
  const petSize = useSettings.getState().settings.petSize;
  const spriteH = SPRITE_H[petSize] ?? SPRITE_H.medium;
  const start = { x: (pos.x - a.position.x) / sc + SHADOW_PAD.side, y: (pos.y - a.position.y) / sc };
  await lastMove;
  await win.setIgnoreCursorEvents(true).catch(() => undefined);
  await setOrbBounds(a.position.x, a.position.y, a.size.width, a.size.height);
  const standX = await runWreck({
    stage: {
      w: a.size.width / sc,
      h: a.size.height / sc,
      spriteW: Math.round((spriteH * 240) / 340),
      spriteH,
      padBottom: SHADOW_PAD.bottom,
    },
    start,
    v: { vx: f.vx / sc, vy: f.vy / sc },
    impact: impact / sc,
  });
  const box = boxFor(petSize);
  const bw = Math.round(box.width * sc);
  const bh = Math.round(box.height * sc);
  await setOrbBounds(
    a.position.x + Math.round((standX - SHADOW_PAD.side) * sc),
    a.position.y + a.size.height - bh,
    bw,
    bh,
  );
  await win.setIgnoreCursorEvents(false).catch(() => undefined);
  await rebounds();
  await snapToGround();
  return true;
}

async function fall(b: Bounds) {
  const pet = usePet.getState();
  const x = clampX(pos.x, b);
  if (pos.y < b.groundY) {
    pet.setPhase("falling");
    const from = pos.y;
    await new Promise<void>((resolve) => {
      const start = performance.now();
      let lastY = from;
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / FALL_MS);
        const y = Math.round(from + (b.groundY - from) * easeOutCubic(t));
        if (y !== lastY) {
          void move(x, y);
          lastY = y;
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  } else if (x !== pos.x || pos.y !== b.groundY) {
    await move(x, b.groundY);
  }
  pet.setPhase("idle");
}

// ── 상태 → 동작 ──
function startReactions(): () => void {
  const unAway = useOrbStatus.subscribe((s, prev) => {
    if (prev.away && !s.away) usePet.getState().playAction("wave", 4500); // 돌아온 사용자에게 손 흔들기
  });
  const unFired = useTodos.subscribe((s, prev) => {
    if (prev.fired.length > 0 && s.fired.length === 0) usePet.getState().playAction("dance", 3000); // 알림을 다 닫으면 춤
  });
  return () => {
    unAway();
    unFired();
  };
}

// ── 인사 ──
// 켜면 손을 흔들고, 아침(06~11시)에는 하루 한 번 말풍선으로 당장 할 일을 알려 준다
function greet(): () => void {
  const wave = window.setTimeout(() => usePet.getState().playAction("wave", 2800), 1000);
  const hour = new Date().getHours();
  let greeted = "";
  try {
    greeted = localStorage.getItem(GREETING_KEY) ?? "";
  } catch {
    // localStorage를 못 읽으면 매번 인사해도 괜찮다
  }
  const today = todayStr();
  let morning: number | undefined;
  if (hour >= 6 && hour < 11 && greeted !== today) {
    // 할 일 스토어가 읽힐 시간을 준다
    morning = window.setTimeout(() => {
      try {
        localStorage.setItem(GREETING_KEY, today);
      } catch {
        // 저장 못 해도 동작에는 지장 없음
      }
      const pending = pendingNow(useTodos.getState().todos);
      play("stretch");
      useBubble.getState().push({
        key: "morning",
        title: "좋은 아침이에요 ☀️",
        body: pending ? `당장 할 일 ${pending}개가 기다려요` : "오늘 당장 할 일은 비어 있어요",
        view: "home",
      });
    }, 3500);
  }
  return () => {
    window.clearTimeout(wave);
    window.clearTimeout(morning);
  };
}

// ── 크기 변경·배율 변경 → 창 크기 다시 맞추기 ──
function startSizeSync(): () => void {
  const apply = async (petSize: PetSize) => {
    if (useBubble.getState().expanded) return; // 말풍선이 열려 있으면 폭이 섞인다. 다음 변경 때
    const box = boxFor(petSize);
    bounds = null; // 새 바닥이 잡힐 때까지 배회 틱이 옛 y로 되돌리지 않게
    await resizeOrb(box.width, box.height);
    await rebounds();
    await snapToGround();
  };
  const unSettings = useSettings.subscribe((s, prev) => {
    if (s.settings.petSize !== prev.settings.petSize) apply(s.settings.petSize).catch(reportError);
  });
  const unScale = win.onScaleChanged(() => {
    apply(useSettings.getState().settings.petSize).catch(reportError);
  });
  return () => {
    unSettings();
    void unScale.then((f) => f());
  };
}

// 오브 창이 뜰 때 한 번. 되돌리는 함수를 준다 (StrictMode 이중 마운트 대비)
export function startPetLoops(): () => void {
  let cancelled = false;
  const unMoved = win.onMoved(({ payload }) => {
    // 프로그램 이동(배회·말풍선 펼침)에도 오므로 여기서는 사본만 맞춘다. 위치 저장은 release()가
    pos.x = payload.x;
    pos.y = payload.y;
  });
  const unPanel = listen<boolean>("panel-changed", (e) => {
    panelOpen = e.payload;
  });
  // 말풍선 창 조정 앞뒤: 가던 이동이 끝나길 기다리고, 끝나면 창 자리·붙은 폭을 다시 읽는다
  resizeHooks.before = () => lastMove;
  resizeHooks.after = async (side) => {
    const [p, s] = await Promise.all([win.outerPosition(), win.outerSize()]);
    pos.x = p.x;
    pos.y = p.y;
    const extra = side ? Math.max(0, s.width - size.w) : 0;
    bubbleExtra.left = side === "left" ? extra : 0;
    bubbleExtra.right = side === "right" ? extra : 0;
  };
  rebounds()
    .then(() => (cancelled ? undefined : snapToGround()))
    .catch(reportError);
  const stops = [startWander(), startReactions(), startSizeSync(), greet()];
  return () => {
    cancelled = true;
    stops.forEach((f) => f());
    void unMoved.then((f) => f());
    void unPanel.then((f) => f());
    if (dragPoll !== undefined) {
      window.clearInterval(dragPoll);
      dragPoll = undefined;
    }
  };
}
