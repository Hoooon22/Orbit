import { describe, expect, it } from "vitest";
import { activeSeconds, formatDuration, rankApps } from "./format";

describe("formatDuration", () => {
  it("초·분·시간 단위로 줄여 쓴다", () => {
    expect(formatDuration(0)).toBe("0초");
    expect(formatDuration(59)).toBe("59초");
    expect(formatDuration(60)).toBe("1분");
    expect(formatDuration(3599)).toBe("59분");
    expect(formatDuration(3600)).toBe("1시간");
    expect(formatDuration(3660)).toBe("1시간 1분");
  });
});

describe("rankApps / activeSeconds", () => {
  const day = { date: "2026-09-14", apps: { code: 300, chrome: 900, slack: 60 }, idle: 120 };
  it("많이 쓴 앱이 먼저", () => {
    expect(rankApps(day).map(([n]) => n)).toEqual(["chrome", "code", "slack"]);
  });
  it("활동 시간은 앱 합계 (자리 비움 제외)", () => {
    expect(activeSeconds(day)).toBe(1260);
  });
});
