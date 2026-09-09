import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { termResize, termStart, termWrite } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";

// AI 화면: 메모 폴더에서 claude를 띄운 터미널. 세션은 Rust(term.rs)에 하나뿐이므로
// xterm도 모듈에 하나만 만들고 DOM만 옮겨 붙인다 (다른 탭에 갔다 와도 화면이 그대로 남는다).
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let host: HTMLDivElement | null = null;
let opened = false;
let exited = false;

// xterm은 CSS 변수를 못 읽으므로 지금 테마의 색을 계산해 넘긴다
function colors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: v("--bg-panel"),
    foreground: v("--fg"),
    cursor: v("--accent"),
    selectionBackground: v("--accent-soft"),
  };
}

function ensure(): [Terminal, FitAddon, HTMLDivElement] {
  if (term && fit && host) return [term, fit, host];
  const css = getComputedStyle(document.documentElement);
  const t = new Terminal({
    fontFamily: css.getPropertyValue("--font-term").trim(),
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: colors(),
  });
  const f = new FitAddon();
  t.loadAddon(f);
  t.onData((data) => {
    // 세션이 끝난 뒤 아무 키나 누르면 다시 시작한다
    if (exited) {
      exited = false;
      termStart(t.cols, t.rows).catch(reportError);
      return;
    }
    termWrite(data).catch(reportError);
  });
  void listen<string>("term-output", (e) => t.write(e.payload));
  void listen("term-exit", () => {
    exited = true;
    t.write("\r\n\x1b[2m세션이 끝났습니다. 아무 키나 누르면 다시 시작합니다.\x1b[0m\r\n");
  });
  const h = document.createElement("div");
  h.className = "term-host";
  term = t;
  fit = f;
  host = h;
  return [t, f, h];
}

export default function TerminalView() {
  const boxRef = useRef<HTMLDivElement>(null);
  const theme = useSettings((s) => s.settings.theme);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const [t, f, h] = ensure();
    box.appendChild(h);
    if (!opened) {
      t.open(h);
      opened = true;
    }
    f.fit();
    termStart(t.cols, t.rows).catch(reportError);
    const ro = new ResizeObserver(() => {
      f.fit();
      termResize(t.cols, t.rows).catch(() => {});
    });
    ro.observe(box);
    t.focus();
    return () => {
      ro.disconnect();
      h.remove();
    };
  }, []);

  useEffect(() => {
    if (term) term.options.theme = colors();
  }, [theme]);

  return <div className="term" ref={boxRef} />;
}
