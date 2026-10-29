import { describe, expect, it } from "vitest";
import { filterSlashItems, SLASH_ITEMS } from "./slashItems";

const ids = (q: string) => filterSlashItems(q).map((i) => i.id);

describe("filterSlashItems", () => {
  it("빈 질의는 전부", () => {
    expect(filterSlashItems("")).toEqual(SLASH_ITEMS);
  });

  it("한글 라벨·영문 별칭·초성으로 찾는다", () => {
    expect(ids("제목")).toEqual(["h1", "h2", "h3"]);
    expect(ids("h2")).toEqual(["h2"]);
    expect(ids("todo")).toEqual(["todo"]);
    expect(ids("ㅍㅇㅈ")).toEqual(["page"]);
    expect(ids("목록")).toEqual(["bullet", "number", "todo"]);
  });

  it("맞는 게 없으면 빈 목록", () => {
    expect(ids("zzz")).toEqual([]);
  });
});
