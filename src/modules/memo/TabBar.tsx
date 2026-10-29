import { useState } from "react";
import { QUICK_MEMO } from "../../shared/api";
import { noteName } from "./flatten";

type Props = {
  tabs: string[];
  active: string;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (dragged: string, target: string, pos: "before" | "after") => void;
  onPlace: (path: string, index: number) => void; // 트리·즐겨찾기에서 끌어온 메모를 index 자리에
  onNew: () => void; // "+" : 새 메모를 새 탭으로
};

// 편집기 위의 탭 줄 (크롬처럼). 가운데 버튼으로 닫고, 끌어서 순서를 바꾸고, 목록의 메모를 끌어다 놓으면 그 자리에 탭이 생긴다.
export default function TabBar({ tabs, active, onActivate, onClose, onReorder, onPlace, onNew }: Props) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ path: string; pos: "before" | "after" } | null>(null);
  const [over, setOver] = useState(false); // 빈 자리(맨 뒤)에 끌어온 메모를 올리는 중

  // 트리("text/plain"에 경로)나 즐겨찾기("application/x-fav")에서 끌어온 것인지 (탭끼리 끄는 건 "application/x-tab")
  const isExternal = (e: React.DragEvent) =>
    !e.dataTransfer.types.includes("application/x-tab") &&
    (e.dataTransfer.types.includes("application/x-fav") || e.dataTransfer.types.includes("text/plain"));
  // 메모만 받는다 (폴더는 .md가 아님)
  const externalPath = (e: React.DragEvent): string | null => {
    const p = e.dataTransfer.getData("application/x-fav") || e.dataTransfer.getData("text/plain");
    return /\.md$/i.test(p) ? p : null;
  };

  const posFromEvent = (e: React.DragEvent): "before" | "after" => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientX - r.left) / r.width < 0.5 ? "before" : "after";
  };

  return (
    <div
      className={"tab-bar" + (over ? " drop-over" : "")}
      role="tablist"
      onDragOver={(e) => {
        if (!isExternal(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const p = externalPath(e);
        if (!p) return;
        e.preventDefault();
        onPlace(p, tabs.length);
      }}
    >
      {tabs.map((path) => {
        const label = path === QUICK_MEMO ? "⚡ 빠른 메모" : noteName(path);
        const marker = dropAt?.path === path && dragged !== path ? ` drop-${dropAt.pos}` : "";
        return (
          <div
            key={path}
            role="tab"
            aria-selected={path === active}
            className={"tab" + (path === active ? " selected" : "") + marker}
            title={path === QUICK_MEMO ? "빠른 메모" : path}
            draggable
            onClick={() => onActivate(path)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(path);
            }}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // 트리가 읽는 "text/plain" 대신 전용 타입만 실어 서로 간섭하지 않게 한다
              e.dataTransfer.setData("application/x-tab", path);
              setDragged(path);
            }}
            onDragEnd={() => {
              setDragged(null);
              setDropAt(null);
            }}
            onDragOver={(e) => {
              const ext = isExternal(e);
              if (!ext && (!dragged || dragged === path)) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = ext ? "copy" : "move";
              setOver(false);
              setDropAt({ path, pos: posFromEvent(e) });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const pos = posFromEvent(e);
              setDropAt(null);
              setOver(false);
              if (dragged) {
                if (dragged !== path) onReorder(dragged, path, pos);
                return;
              }
              const p = externalPath(e);
              if (!p) return;
              const i = tabs.filter((t) => t !== p).indexOf(path);
              onPlace(p, pos === "before" ? i : i + 1);
            }}
          >
            <span className="tab-label">{label}</span>
            <button
              className="tab-close"
              title="탭 닫기 (Ctrl+W, 가운데 버튼)"
              aria-label={`${label} 탭 닫기`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <button className="tab-add" title="새 메모를 새 탭으로 (Ctrl+T)" aria-label="새 탭" onClick={onNew}>
        +
      </button>
    </div>
  );
}
