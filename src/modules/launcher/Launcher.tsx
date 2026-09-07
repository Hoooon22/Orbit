import { useMemo, useState } from "react";
import type { LaunchItem } from "../../shared/api";
import { looksLaunchable, rankItems } from "./rank";
import { useLauncher } from "./store";

type Props = {
  onLaunched: () => void; // 실행 뒤 창을 숨긴다
};

const ICON: Record<LaunchItem["kind"], string> = { app: "🚀", url: "🌐", folder: "📁" };

// 오브 패널의 런처. 이름(초성도 됨)을 치고 Enter. 주소·경로를 그대로 치면 항목으로 더할 수 있다.
export default function Launcher({ onLaunched }: Props) {
  const items = useLauncher((s) => s.items);
  const usage = useLauncher((s) => s.usage);
  const launch = useLauncher((s) => s.launch);
  const addCustom = useLauncher((s) => s.addCustom);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const results = useMemo(() => rankItems(items, usage, query), [items, usage, query]);
  const canAdd = results.length === 0 && looksLaunchable(query);
  const rows = canAdd ? results.length + 1 : results.length;
  const active = rows === 0 ? 0 : Math.min(index, rows - 1);

  const run = async (i: number) => {
    if (canAdd && i === results.length) {
      const t = query.trim();
      await addCustom(t.replace(/^https?:\/\//, "").split("/")[0] || t, t);
      setQuery("");
      return;
    }
    const it = results[i];
    if (!it) return;
    setQuery("");
    onLaunched();
    await launch(it.id);
  };

  return (
    <div className="launcher">
      <div className="launcher-search">
        <input
          value={query}
          spellCheck={false}
          placeholder="앱 이름, 주소, 폴더… (초성도 됩니다)"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => (rows ? (Math.min(i, rows - 1) + 1) % rows : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => (rows ? (Math.min(i, rows - 1) - 1 + rows) % rows : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              void run(active);
            } else if (e.key === "Escape" && query) {
              e.stopPropagation(); // 입력이 있으면 지우기만, 비어 있으면 창이 닫힌다
              setQuery("");
            }
          }}
        />
      </div>
      <ul className="launcher-list">
        {rows === 0 && (
          <li className="clip-empty">
            {query ? "찾는 항목이 없습니다" : items.length ? "최근 실행한 항목이 여기 보입니다" : "시작 메뉴를 읽는 중…"}
          </li>
        )}
        {results.map((it, i) => (
          <li
            key={it.id}
            className={"launcher-item" + (i === active ? " active" : "")}
            onMouseMove={() => setIndex(i)}
            onClick={() => void run(i)}
            title={it.target}
          >
            <span className="launcher-icon">{ICON[it.kind]}</span>
            <span className="launcher-name">{it.name}</span>
            {it.hint && <span className="launcher-hint">{it.hint}</span>}
          </li>
        ))}
        {canAdd && (
          <li
            className={"launcher-item add" + (active === results.length ? " active" : "")}
            onMouseMove={() => setIndex(results.length)}
            onClick={() => void run(results.length)}
          >
            <span className="launcher-icon">＋</span>
            <span className="launcher-name">"{query.trim()}" 항목으로 추가</span>
          </li>
        )}
      </ul>
    </div>
  );
}
