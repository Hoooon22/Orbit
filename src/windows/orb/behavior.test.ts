import { describe, expect, it } from "vitest";
import { ACT_MS, chatLines, pickChat, pickIdleAct, pickMove, pickWeighted } from "./behavior";

describe("pickWeighted", () => {
  const items = [
    ["a", 1],
    ["b", 3],
    ["c", 0],
  ] as const;
  it("maps r onto the weights in order and never picks a zero weight", () => {
    expect(pickWeighted(items, 0)).toBe("a");
    expect(pickWeighted(items, 0.24)).toBe("a");
    expect(pickWeighted(items, 0.25)).toBe("b");
    expect(pickWeighted(items, 0.999)).toBe("b");
  });
});

describe("pickIdleAct", () => {
  it("only picks acts that have a duration", () => {
    for (let i = 0; i < 100; i++) expect(ACT_MS[pickIdleAct(14, i / 100)]).toBeGreaterThan(0);
  });
  it("skips the energetic acts at night and leans sleepy", () => {
    const night = Array.from({ length: 200 }, (_, i) => pickIdleAct(2, i / 200));
    expect(night).not.toContain("jacks");
    expect(night).not.toContain("cheer");
    const sleepy = (a: string[]) => a.filter((x) => x === "yawn" || x === "doze").length;
    const day = Array.from({ length: 200 }, (_, i) => pickIdleAct(14, i / 200));
    expect(sleepy(night)).toBeGreaterThan(sleepy(day) * 2);
  });
});

describe("pickMove", () => {
  it("mostly walks, and reaches every move", () => {
    const moves = Array.from({ length: 100 }, (_, i) => pickMove(i / 100));
    expect(moves.filter((m) => m === "walk").length).toBeGreaterThan(50);
    expect(new Set(moves)).toEqual(new Set(["walk", "run", "tiptoe", "jump"]));
  });
});

describe("chat", () => {
  const texts = (hour: number, pending = 0, timers = 0) => chatLines({ hour, pending, timers }).map(([l]) => l.text);
  it("adds lines for the situation", () => {
    expect(texts(14, 3)).toContain("당장 할 일이 3개 남았어요");
    expect(texts(14).some((t) => t.includes("할 일"))).toBe(false);
    expect(texts(14, 0, 1).some((t) => t.includes("타이머"))).toBe(true);
    expect(texts(12).some((t) => t.includes("점심"))).toBe(true);
    expect(texts(1).some((t) => t.includes("잘 시간"))).toBe(true);
    expect(texts(14).some((t) => t.includes("잘 시간"))).toBe(false);
  });
  it("every line's act has a duration", () => {
    for (const hour of [1, 8, 12, 15, 19]) {
      for (const [l] of chatLines({ hour, pending: 1, timers: 1 })) if (l.act) expect(ACT_MS[l.act]).toBeGreaterThan(0);
    }
  });
  it("picks the last line at the top of the range", () => {
    expect(pickChat({ hour: 1, pending: 0, timers: 0 }, 0.999).text).toContain("잘 시간");
  });
});
