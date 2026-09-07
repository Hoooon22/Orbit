import { describe, expect, it } from "vitest";
import { matchCommands } from "./commands";

describe("matchCommands", () => {
  it("한글·영문 별칭 모두 찾는다", () => {
    expect(matchCommands("메모")[0].id).toBe("memo");
    expect(matchCommands("memo")[0].id).toBe("memo");
    expect(matchCommands("cal")[0].id).toBe("calendar");
    expect(matchCommands("할일")[0].id).toBe("todo");
  });

  it("앞부분 일치가 먼저, 초성도 된다", () => {
    expect(matchCommands("se")[0].id).toBe("settings");
    expect(matchCommands("sy")[0].id).toBe("sync");
    expect(matchCommands("ㅁㅁ")[0].id).toBe("memo");
    expect(matchCommands("ㅋㄹㅂㄷ")[0].id).toBe("clipboard");
  });

  it("빈 질의는 전부, 엉뚱한 질의는 없음", () => {
    expect(matchCommands("").length).toBeGreaterThan(5);
    expect(matchCommands("zzzzqq")).toEqual([]);
  });
});
