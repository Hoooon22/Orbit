import { describe, expect, it } from "vitest";
import {
  addDays,
  dday,
  ddayLabel,
  eventsOn,
  monthGrid,
  nextOccurrence,
  occurrence,
  upcoming,
} from "./calendar";
import type { CalEvent } from "../../shared/api";

const ev = (p: Partial<CalEvent> & { date: string }): CalEvent => ({
  id: p.date + (p.title ?? ""),
  title: "x",
  ...p,
});

describe("calendar", () => {
  it("monthGrid: 6행 7열, 일요일 시작, 2026-02는 2/1이 일요일", () => {
    const g = monthGrid(2026, 1);
    expect(g).toHaveLength(6);
    expect(g.every((r) => r.length === 7)).toBe(true);
    expect(g[0][0]).toBe("2026-02-01");
    expect(g[3][6]).toBe("2026-02-28");
    expect(g[4][0]).toBe("2026-03-01");
  });

  it("dday·라벨", () => {
    expect(dday("2026-09-10", "2026-09-07")).toBe(3);
    expect(ddayLabel(3)).toBe("D-3");
    expect(ddayLabel(0)).toBe("D-Day");
    expect(ddayLabel(-2)).toBe("D+2");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("매년 반복: 윤년 2/29는 평년 2/28, 지났으면 내년", () => {
    const leap = ev({ date: "2024-02-29", repeat: "yearly" });
    expect(occurrence(leap, 2026)).toBe("2026-02-28");
    expect(occurrence(leap, 2028)).toBe("2028-02-29");
    const bday = ev({ date: "1990-09-01", repeat: "yearly" });
    expect(nextOccurrence(bday, "2026-09-07")).toBe("2027-09-01");
    expect(nextOccurrence(bday, "2026-08-07")).toBe("2026-09-01");
  });

  it("eventsOn: 여러 날 일정과 반복 일정", () => {
    const trip = ev({ date: "2026-09-10", endDate: "2026-09-12", title: "여행" });
    const bday = ev({ date: "1990-09-11", repeat: "yearly", title: "생일" });
    const other = ev({ date: "2026-10-01" });
    const on = eventsOn([trip, bday, other], "2026-09-11").map((e) => e.title);
    expect(on).toEqual(["여행", "생일"]);
    expect(eventsOn([trip], "2026-09-13")).toEqual([]);
  });

  it("upcoming: 기간 안 발생을 날짜·시각순으로", () => {
    const a = ev({ date: "2026-09-09", time: "14:00", title: "a" });
    const b = ev({ date: "2026-09-09", title: "b" }); // 종일이 먼저
    const c = ev({ date: "2026-09-08", title: "c" });
    const far = ev({ date: "2026-09-20", title: "far" });
    const past = ev({ date: "2026-09-06", title: "past" });
    expect(upcoming([a, b, c, far, past], "2026-09-07", 7).map((o) => o.ev.title)).toEqual([
      "c",
      "b",
      "a",
    ]);
  });
});
