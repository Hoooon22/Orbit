import { describe, expect, it } from "vitest";
import { chosung, isChosungQuery, matchesChosung } from "../../shared/hangul";
import { looksLaunchable, rankItems } from "./rank";
import type { LaunchItem } from "../../shared/api";

const item = (name: string, extra: Partial<LaunchItem> = {}): LaunchItem => ({
  id: name,
  name,
  target: name,
  kind: "app",
  custom: false,
  ...extra,
});

describe("hangul", () => {
  it("chosung", () => {
    expect(chosung("데스크톱메모")).toBe("ㄷㅅㅋㅌㅁㅁ");
    expect(chosung("Chrome 크롬")).toBe("Chrome ㅋㄹ");
    expect(isChosungQuery("ㅋㄹ")).toBe(true);
    expect(isChosungQuery("크롬")).toBe(false);
  });

  it("matchesChosung", () => {
    expect(matchesChosung("ㅋㄹ", "크롬")).toBe(15);
    expect(matchesChosung("ㄹ", "크롬")).toBe(10);
    expect(matchesChosung("ㅁㅁ", "크롬")).toBe(-1);
  });
});

describe("rankItems", () => {
  const NOW = 1_800_000_000_000;
  const items = [item("Chrome"), item("크롬", { custom: true }), item("Code"), item("Calculator")];

  it("초성 질의는 한글 이름을 찾는다", () => {
    expect(rankItems(items, {}, "ㅋㄹ", NOW).map((i) => i.name)).toEqual(["크롬"]);
  });

  it("자주·최근 쓴 항목이 앞으로", () => {
    const usage = { Code: { count: 5, lastUsed: NOW - 1000 } };
    expect(rankItems(items, usage, "c", NOW)[0].name).toBe("Code");
  });

  it("빈 질의는 최근 사용순", () => {
    const usage = {
      Chrome: { count: 1, lastUsed: NOW - 5000 },
      Calculator: { count: 1, lastUsed: NOW - 1000 },
    };
    expect(rankItems(items, usage, "", NOW).map((i) => i.name)).toEqual(["Calculator", "Chrome"]);
  });

  it("looksLaunchable", () => {
    expect(looksLaunchable("https://example.com")).toBe(true);
    expect(looksLaunchable("C:\\Users")).toBe(true);
    expect(looksLaunchable("크롬")).toBe(false);
  });
});
