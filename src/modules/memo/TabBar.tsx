import { useState } from "react";
import { QUICK_MEMO } from "../../shared/api";
import { noteName } from "./flatten";

type Props = {
  tabs: string[];
  active: string;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (dragged: string, target: string, pos: "before" | "after") => void;
  onNew: () => void; // "+" : 새 메모를 새 탭으로
};

// 편집기 위의 탭 줄 (크롬처럼). 가운데 버튼으로 닫고, 끌어서 순서를 바꾼다.
export default function TabBar({ tabs, active, onActivate, onClose, onReorder, onNew }: Props) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ path: string; pos: "before" | "after" } | null>(null);

  const posFromEvent = (e: React.DragEvent): "before" | "after" => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientX - r.left) / r.width < 0.5 ? "before" : "after";
  };

  return (
    <div className="tab-bar" role="tablist">
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
              if (!dragged || dragged === path) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropAt({ path, pos: posFromEvent(e) });
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const pos = posFromEvent(e);
              setDropAt(null);
              if (dragged && dragged !== path) onReorder(dragged, path, pos);
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
