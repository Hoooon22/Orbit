import { describe, expect, it } from "vitest";
import { parseTodoInput } from "./todoParse";

// 2026-09-07 (월) 10:00 기준
const NOW = new Date(2026, 8, 7, 10, 0);
const at = (y: number, m: number, d: number, h: number, mi: number) =>
  new Date(y, m - 1, d, h, mi).getTime();

describe("parseTodoInput", () => {
  it("날짜·시각이 없으면 본문만", () => {
    expect(parseTodoInput("  우유 사기 ", NOW)).toEqual({ text: "우유 사기" });
  });

  it("내일 오후 3시 회의", () => {
    expect(parseTodoInput("내일 오후 3시 회의", NOW)).toEqual({
      text: "회의",
      start: "2026-09-08",
      time: "15:00",
      remindAt: at(2026, 9, 8, 15, 0),
    });
  });

  it("오전·오후 표시 없는 1~6시는 오후, 그 외는 그대로", () => {
    expect(parseTodoInput("3시 치과", NOW).time).toBe("15:00");
    expect(parseTodoInput("9시 출근", NOW).time).toBe("09:00");
    expect(parseTodoInput("오전 3시 알람", NOW).time).toBe("03:00");
    expect(parseTodoInput("밤 11시 약", NOW).time).toBe("23:00");
    expect(parseTodoInput("오후 12시 점심", NOW).time).toBe("12:00");
  });

  it("3시 반, 3시 20분, 14:30", () => {
    expect(parseTodoInput("3시 반 미팅", NOW).time).toBe("15:30");
    expect(parseTodoInput("오후 3시 20분 미팅", NOW).time).toBe("15:20");
    expect(parseTodoInput("14:30 치과", NOW)).toMatchObject({ text: "치과", time: "14:30" });
  });

  it("3시간은 시각이 아니다", () => {
    expect(parseTodoInput("3시간 공부", NOW)).toEqual({ text: "3시간 공부" });
  });

  it("시각만 있고 이미 지났으면 내일", () => {
    expect(parseTodoInput("9시 회의", NOW).start).toBe("2026-09-08");
    expect(parseTodoInput("11시 회의", NOW).start).toBe("2026-09-07");
  });

  it("요일: 다가오는 요일, 오늘이면 오늘, 다음 주", () => {
    expect(parseTodoInput("금요일까지 보고서", NOW)).toEqual({
      text: "까지 보고서",
      start: "2026-09-11",
    });
    expect(parseTodoInput("월요일 회의", NOW).start).toBe("2026-09-07");
    expect(parseTodoInput("다음 주 월요일 회의", NOW).start).toBe("2026-09-14");
  });

  it("9/12 14:30, 9월 12일, 2026-10-01, 20일", () => {
    expect(parseTodoInput("9/12 14:30 치과", NOW)).toMatchObject({
      text: "치과",
      start: "2026-09-12",
      time: "14:30",
    });
    expect(parseTodoInput("9월 12일 생일", NOW).start).toBe("2026-09-12");
    expect(parseTodoInput("2026-10-01 여행", NOW).start).toBe("2026-10-01");
    expect(parseTodoInput("20일 월세", NOW).start).toBe("2026-09-20");
    expect(parseTodoInput("3일 월세", NOW).start).toBe("2026-10-03"); // 이미 지난 날짜 → 다음 달
  });

  it("날짜만 있으면 알림은 걸지 않는다", () => {
    expect(parseTodoInput("모레 제출", NOW)).toEqual({ text: "제출", start: "2026-09-09" });
  });
});
