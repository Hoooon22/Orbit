import { describe, expect, it } from "vitest";
import { closeTab, cycleTab, EMPTY, openTab, pruneTabs, remapTabs, reorderTabs } from "./tabs";

describe("탭", () => {
  it("열기: 활성 탭이 바뀌고, 새 탭은 활성 탭 오른쪽에, 이미 열린 메모는 그 탭으로", () => {
    let t = openTab(EMPTY, "a.md");
    expect(t).toEqual({ tabs: ["a.md"], active: "a.md" }); // 빠른 메모 탭이 a로 바뀜
    t = openTab(t, "b.md", true);
    expect(t).toEqual({ tabs: ["a.md", "b.md"], active: "b.md" });
    t = openTab({ ...t, active: "a.md" }, "c.md", true);
    expect(t.tabs).toEqual(["a.md", "c.md", "b.md"]);
    expect(openTab(t, "b.md", true)).toEqual({ tabs: ["a.md", "c.md", "b.md"], active: "b.md" });
  });

  it("닫기: 활성 탭을 닫으면 오른쪽, 끝이면 왼쪽, 마지막이면 빠른 메모", () => {
    const t = { tabs: ["a.md", "b.md", "c.md"], active: "b.md" };
    expect(closeTab(t, "b.md")).toEqual({ tabs: ["a.md", "c.md"], active: "c.md" });
    expect(closeTab({ ...t, active: "c.md" }, "c.md")).toEqual({ tabs: ["a.md", "b.md"], active: "b.md" });
    expect(closeTab(t, "a.md")).toEqual({ tabs: ["b.md", "c.md"], active: "b.md" });
    expect(closeTab({ tabs: ["a.md"], active: "a.md" }, "a.md")).toEqual(EMPTY);
    expect(closeTab(t, "x.md")).toBe(t);
  });

  it("이름 변경·이동을 따라간다 (폴더 안, 하위 페이지 폴더 포함)", () => {
    const t = { tabs: ["회의.md", "회의/안건.md", "폴더/x.md", "QuickMemo.md"], active: "회의/안건.md" };
    expect(remapTabs(t, "회의.md", "주간.md")).toEqual({
      tabs: ["주간.md", "주간/안건.md", "폴더/x.md", "QuickMemo.md"],
      active: "주간/안건.md",
    });
    expect(remapTabs(t, "폴더", "새폴더").tabs[2]).toBe("새폴더/x.md");
    // 옮긴 결과 같은 탭이 둘이 되면 하나로 합친다
    const dup = remapTabs({ tabs: ["a.md", "b.md"], active: "a.md" }, "a.md", "b.md");
    expect(dup).toEqual({ tabs: ["b.md"], active: "b.md" });
  });

  it("없어진 메모의 탭은 닫히고 빠른 메모는 남는다", () => {
    const t = { tabs: ["QuickMemo.md", "a.md", "b.md"], active: "a.md" };
    expect(pruneTabs(t, (p) => p === "b.md")).toEqual({ tabs: ["QuickMemo.md", "b.md"], active: "b.md" });
  });

  it("순서 바꾸기와 옆 탭으로 이동", () => {
    const t = { tabs: ["a.md", "b.md", "c.md"], active: "a.md" };
    expect(reorderTabs(t, "a.md", "c.md", "after").tabs).toEqual(["b.md", "c.md", "a.md"]);
    expect(reorderTabs(t, "c.md", "a.md", "before").tabs).toEqual(["c.md", "a.md", "b.md"]);
    expect(cycleTab(t, -1).active).toBe("c.md");
    expect(cycleTab(t, 1).active).toBe("b.md");
  });
});
