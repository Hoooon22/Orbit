import { describe, expect, it } from "vitest";
import { elapsedOf, formatElapsed, runningTimers } from "./store";

describe("runningTimers", () => {
  const t = (id: string, startedAt?: number) => ({ id, name: id, elapsed: 0, startedAt });
  it("돌고 있는 것만, 가장 최근에 시작한 것부터", () => {
    expect(runningTimers([t("a"), t("b")])).toEqual([]);
    expect(runningTimers([t("a", 300), t("b"), t("c", 500), t("d", 100)]).map((x) => x.id)).toEqual(["c", "a", "d"]);
  });
});

describe("formatElapsed", () => {
  it("시:분:초, 분·초는 두 자리", () => {
    expect(formatElapsed(0)).toBe("0:00:00");
    expect(formatElapsed(59_999)).toBe("0:00:59");
    expect(formatElapsed(61_000)).toBe("0:01:01");
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(100 * 3_600_000 + 5_000)).toBe("100:00:05");
  });
});

describe("elapsedOf", () => {
  const base = { id: "a", name: "x", elapsed: 10_000 };
  it("멈춰 있으면 쌓인 시간만", () => {
    expect(elapsedOf(base, 999_999)).toBe(10_000);
  });
  it("돌고 있으면 시작 시각부터 지금까지를 더한다", () => {
    expect(elapsedOf({ ...base, startedAt: 1_000 }, 6_000)).toBe(15_000);
  });
  it("시계가 뒤로 가도 음수가 되지 않는다", () => {
    expect(elapsedOf({ ...base, startedAt: 9_000 }, 6_000)).toBe(10_000);
  });
});
