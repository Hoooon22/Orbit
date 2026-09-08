import { useEffect, useMemo, useState } from "react";
import { QUICK_MEMO, readNote, writeNote } from "../../shared/api";
import type { ClipItem } from "../../shared/api";
import { relativeTime } from "../../shared/dates";
import { fuzzyScore } from "../../shared/fuzzy";
import { reportError } from "../../shared/stores/error";
import { useSettings } from "../../shared/stores/settings";
import { useClipboard } from "./store";

type Props = {
  layout: "compact" | "full"; // compact: 오브 패널, full: 워크스페이스 전체 화면(전문 보기·정리 버튼)
};

// 첫 줄만, 너무 길면 자른다
function preview(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  return line.length > 120 ? line.slice(0, 120) + "…" : line;
}

// 복사한 내용을 검색해 다시 클립보드에 올리는 목록. 고정한 항목이 먼저 온다.
export default function ClipboardPanel({ layout }: Props) {
  const items = useClipboard((s) => s.items);
  const copy = useClipboard((s) => s.copy);
  const pin = useClipboard((s) => s.pin);
  const remove = useClipboard((s) => s.remove);
  const clear = useClipboard((s) => s.clear);
  const enabled = useSettings((s) => s.settings.clipboardEnabled);
  const update = useSettings((s) => s.update);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = items
      .map((it) => ({
        it,
        // 부분 문자열이면 최우선, 아니면 퍼지. 둘 다 아니면 제외
        score: !q ? 0 : it.text.toLowerCase().includes(q) ? 1000 : fuzzyScore(q, it.text),
      }))
      .filter((r) => r.score >= 0);
    return scored
      .sort((a, b) => Number(b.it.pinned) - Number(a.it.pinned) || b.score - a.score)
      .map((r) => r.it);
  }, [items, query]);

  const current = items.find((i) => i.id === selected) ?? null;

  // "복사됨" 표시는 잠깐만
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const doCopy = async (it: ClipItem) => {
    await copy(it.id);
    setCopied(it.id);
  };

  // 전문을 빠른 메모 끝에 덧붙인다
  const sendToQuickMemo = async (it: ClipItem) => {
    try {
      const cur = await readNote(QUICK_MEMO);
      const sep = cur.trim() ? "\n\n" : "";
      await writeNote(QUICK_MEMO, cur + sep + it.text + "\n");
      setCopied("memo:" + it.id);
    } catch (e) {
      reportError(e);
    }
  };

  const list = (
    <>
      <div className="clip-search">
        <input
          value={query}
          placeholder={enabled ? "복사한 내용 검색…" : "기록이 꺼져 있습니다"}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query) {
              e.stopPropagation();
              setQuery("");
            }
            if (e.key === "Enter" && results[0]) void doCopy(results[0]);
          }}
        />
      </div>
      <ul className="clip-list">
        {results.length === 0 && (
          <li className="clip-empty">{items.length === 0 ? "아직 복사한 내용이 없습니다" : "결과 없음"}</li>
        )}
        {results.map((it) => (
          <li
            key={it.id}
            className={
              "clip-item" +
              (it.pinned ? " pinned" : "") +
              (selected === it.id ? " selected" : "") +
              (copied === it.id ? " copied" : "")
            }
            onClick={() => {
              setSelected(it.id);
              void doCopy(it);
            }}
            title="클릭하면 클립보드에 복사"
          >
            <div className="clip-text">{preview(it.text)}</div>
            <div className="clip-meta">
              <span>{copied === it.id ? "복사됨" : relativeTime(it.copiedAt)}</span>
              {it.count > 1 && <span>· {it.count}회</span>}
              <span className="clip-actions">
                <button
                  title={it.pinned ? "고정 해제" : "고정 (정리해도 남음)"}
                  aria-label={it.pinned ? "고정 해제" : "고정"}
                  onClick={(e) => {
                    e.stopPropagation();
                    pin(it.id, !it.pinned);
                  }}
                >
                  {it.pinned ? "📌" : "📍"}
                </button>
                <button
                  title="삭제"
                  aria-label="삭제"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(it.id);
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  if (layout === "compact") return <div className="clip-panel compact">{list}</div>;

  return (
    <section className="clip-view">
      <header className="editor-header">
        <span className="todo-title">클립보드</span>
        <span className="clip-tools">
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => update({ clipboardEnabled: e.target.checked })}
            />
            기록
          </label>
          <button onClick={clear} title="고정한 항목만 남기고 전부 삭제">
            정리
          </button>
        </span>
      </header>
      <div className="clip-body">
        <div className="clip-panel">{list}</div>
        <div className="clip-detail">
          {current ? (
            <>
              <div className="clip-detail-actions">
                <button onClick={() => void doCopy(current)}>
                  {copied === current.id ? "복사됨" : "복사"}
                </button>
                <button onClick={() => void sendToQuickMemo(current)}>
                  {copied === "memo:" + current.id ? "빠른 메모에 붙였음" : "빠른 메모에 붙이기"}
                </button>
              </div>
              <pre className="clip-full">{current.text}</pre>
            </>
          ) : (
            <div className="clip-empty">왼쪽에서 항목을 고르면 전문이 보입니다</div>
          )}
        </div>
      </div>
    </section>
  );
}
