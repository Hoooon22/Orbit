import { useMemo, useState } from "react";
import type { LaunchItem } from "../../shared/api";
import { looksLaunchable, rankItems } from "./rank";
import { COMMANDS, matchCommands } from "./commands";
import type { Command, CommandId } from "./commands";
import { useLauncher } from "./store";

type Props = {
  onLaunched: () => void; // 앱을 실행한 뒤 창을 숨긴다
  onCommand: (id: CommandId) => void; // "/" 명령 실행 (화면 이동 등)
};

const ICON: Record<LaunchItem["kind"], string> = { app: "🚀", url: "🌐", folder: "📁" };

type Row =
  | { kind: "app"; item: LaunchItem }
  | { kind: "cmd"; cmd: Command }
  | { kind: "add"; target: string };

// 홈의 실행 칸. 앱 이름(초성도 됨)을 치고 Enter. "/"로 시작하면 Orbit 명령(/메모, /todo …).
// Tab은 맨 위 항목 이름으로 자동완성. 주소·경로를 그대로 치면 항목으로 더할 수 있다.
export default function Launcher({ onLaunched, onCommand }: Props) {
  const items = useLauncher((s) => s.items);
  const usage = useLauncher((s) => s.usage);
  const launch = useLauncher((s) => s.launch);
  const addCustom = useLauncher((s) => s.addCustom);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const isCommand = query.startsWith("/");

  const rows = useMemo<Row[]>(() => {
    if (isCommand) return matchCommands(query.slice(1)).map((cmd) => ({ kind: "cmd", cmd }));
    const apps: Row[] = rankItems(items, usage, query).map((item) => ({ kind: "app", item }));
    if (apps.length === 0 && looksLaunchable(query)) apps.push({ kind: "add", target: query.trim() });
    return apps;
  }, [isCommand, items, usage, query]);

  const active = rows.length === 0 ? 0 : Math.min(index, rows.length - 1);

  const run = async (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "cmd") {
      setQuery("");
      onCommand(row.cmd.id);
      return;
    }
    if (row.kind === "add") {
      const t = row.target;
      await addCustom(t.replace(/^https?:\/\//, "").split("/")[0] || t, t);
      setQuery("");
      return;
    }
    setQuery("");
    onLaunched();
    await launch(row.item.id);
  };

  // Tab: 맨 위 항목의 이름으로 채운다 (명령은 "/한글 별칭")
  const complete = () => {
    const row = rows[active];
    if (!row) return;
    if (row.kind === "cmd") setQuery("/" + row.cmd.aliases[0]);
    else if (row.kind === "app") setQuery(row.item.name);
  };

  const label = (row: Row) => {
    if (row.kind === "cmd") return row.cmd.label;
    if (row.kind === "add") return `"${row.target}" 항목으로 추가`;
    return row.item.name;
  };
  const icon = (row: Row) => (row.kind === "cmd" ? row.cmd.icon : row.kind === "add" ? "＋" : ICON[row.item.kind]);
  const hint = (row: Row) =>
    row.kind === "cmd" ? "/" + row.cmd.aliases.slice(0, 2).join(" /") : row.kind === "app" ? row.item.hint : undefined;
  const key = (row: Row) => (row.kind === "cmd" ? "c:" + row.cmd.id : row.kind === "add" ? "add" : row.item.id);

  return (
    <div className="launcher">
      <div className="launcher-search">
        <input
          value={query}
          spellCheck={false}
          placeholder="앱 이름, 주소, 폴더… ( / 로 Orbit 명령, Tab 자동완성)"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => (rows.length ? (Math.min(i, rows.length - 1) + 1) % rows.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => (rows.length ? (Math.min(i, rows.length - 1) - 1 + rows.length) % rows.length : 0));
            } else if (e.key === "Tab") {
              e.preventDefault();
              complete();
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
        {rows.length === 0 && (
          <li className="clip-empty">
            {isCommand
              ? `명령 없음 — ${COMMANDS.slice(0, 4).map((c) => "/" + c.aliases[0]).join(" ")} …`
              : query
                ? "찾는 항목이 없습니다"
                : items.length
                  ? "최근 실행한 항목이 여기 보입니다. /메모 처럼 /로 Orbit 명령"
                  : "시작 메뉴를 읽는 중…"}
          </li>
        )}
        {rows.map((row, i) => (
          <li
            key={key(row)}
            className={"launcher-item" + (i === active ? " active" : "") + (row.kind === "add" ? " add" : "")}
            onMouseMove={() => setIndex(i)}
            onClick={() => void run(i)}
            title={row.kind === "app" ? row.item.target : undefined}
          >
            <span className="launcher-icon">{icon(row)}</span>
            <span className="launcher-name">{label(row)}</span>
            {hint(row) && <span className="launcher-hint">{hint(row)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
