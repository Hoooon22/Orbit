import { useEffect, useRef, useState } from "react";
import { captureCancel, captureColor, captureMode, captureRegion, captureShot } from "../../shared/api";
import type { CaptureMode } from "../../shared/api";

const LOUPE = 144; // 루페 한 변 (CSS px)
const ZOOM = 12; // 배율. 144/12 = 12 소스 픽셀이 정수로 맞아 칸이 어긋나지 않는다
const SRC = LOUPE / ZOOM;
const OFFSET = 24; // 커서와 루페 사이
const MIN_SEL = 4; // 이보다 작은 드래그는 클릭으로 보고 무시

type Pt = { x: number; y: number };
const hex2 = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();

// 모니터 하나를 덮는 오버레이. Rust가 미리 찍어 둔 화면을 배경으로 놓고,
// 영역 모드는 드래그한 사각형을, 색상 모드는 커서 아래 픽셀을 Rust에 넘긴다.
// 좌표는 전부 CSS 논리 px로 보내고 물리 px 변환은 Rust(to_physical)가 한다.
export default function CaptureOverlay() {
  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const pixels = useRef<CanvasRenderingContext2D | null>(null); // 스냅샷을 물리 크기로 그린 캔버스 (색 표본용)
  const [start, setStart] = useState<Pt | null>(null);
  const [cur, setCur] = useState<Pt | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [hex, setHex] = useState("");
  const loupe = useRef<HTMLCanvasElement>(null);
  const dpr = window.devicePixelRatio;

  useEffect(() => {
    let url: string | null = null;
    const bail = () => void captureCancel();
    captureMode().then(setMode).catch(bail);
    captureShot()
      .then((buf) => {
        url = URL.createObjectURL(new Blob([buf], { type: "image/png" }));
        setShotUrl(url);
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          pixels.current = ctx;
        };
        img.src = url;
      })
      .catch(bail);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") bail();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  // 색상 모드: 커서가 움직일 때마다 루페를 다시 그리고 가운데 픽셀을 읽는다
  useEffect(() => {
    if (mode !== "color" || !hover || !pixels.current || !loupe.current) return;
    const src = pixels.current;
    const ctx = loupe.current.getContext("2d");
    if (!ctx) return;
    const sx = Math.round(hover.x * dpr);
    const sy = Math.round(hover.y * dpr);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(src.canvas, sx - SRC / 2, sy - SRC / 2, SRC, SRC, 0, 0, LOUPE, LOUPE);
    const [r, g, b] = src.getImageData(sx, sy, 1, 1).data;
    setHex(`#${hex2(r)}${hex2(g)}${hex2(b)}`);
  }, [mode, hover, dpr]);

  const sel =
    start && cur
      ? {
          x: Math.min(start.x, cur.x),
          y: Math.min(start.y, cur.y),
          w: Math.abs(cur.x - start.x),
          h: Math.abs(cur.y - start.y),
        }
      : null;

  const onUp = () => {
    if (mode !== "region") return;
    const s = sel;
    setStart(null);
    setCur(null);
    if (!s || s.w < MIN_SEL || s.h < MIN_SEL) return;
    captureRegion(s.x, s.y, s.w, s.h).catch(() => void captureCancel());
  };

  // 루페는 커서 오른쪽 아래에, 화면 끝에 닿으면 반대편으로
  const loupePos = hover
    ? {
        left: hover.x + OFFSET + LOUPE > window.innerWidth - 8 ? hover.x - OFFSET - LOUPE : hover.x + OFFSET,
        top: hover.y + OFFSET + LOUPE + 26 > window.innerHeight - 8 ? hover.y - OFFSET - LOUPE - 26 : hover.y + OFFSET,
      }
    : null;

  return (
    <div
      className="capture-root"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (mode === "color") {
          if (hex) captureColor(hex).catch(() => void captureCancel());
          return;
        }
        setStart({ x: e.clientX, y: e.clientY });
        setCur({ x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => {
        const p = { x: e.clientX, y: e.clientY };
        if (start) setCur(p);
        if (mode === "color") setHover(p);
      }}
      onMouseUp={onUp}
      onMouseLeave={() => setHover(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        void captureCancel();
      }}
    >
      {shotUrl && <img className="capture-shot" src={shotUrl} alt="" draggable={false} />}
      {mode === "region" &&
        (sel ? (
          <>
            <div className="capture-dim" style={{ left: 0, top: 0, width: "100%", height: sel.y }} />
            <div className="capture-dim" style={{ left: 0, top: sel.y + sel.h, width: "100%", bottom: 0 }} />
            <div className="capture-dim" style={{ left: 0, top: sel.y, width: sel.x, height: sel.h }} />
            <div className="capture-dim" style={{ left: sel.x + sel.w, top: sel.y, right: 0, height: sel.h }} />
            <div className="capture-sel" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }} />
            <div className="capture-size" style={{ left: sel.x + sel.w + 6, top: sel.y + sel.h + 6 }}>
              {Math.round(sel.w * dpr)}×{Math.round(sel.h * dpr)}
            </div>
          </>
        ) : (
          <div className="capture-dim" style={{ inset: 0 }} />
        ))}
      {mode === "color" && loupePos && (
        <div className="capture-loupe" style={loupePos}>
          <canvas ref={loupe} width={LOUPE} height={LOUPE} />
          <span className="capture-loupe-center" />
          {hex && (
            <div className="capture-hex">
              <i style={{ background: hex }} />
              {hex}
            </div>
          )}
        </div>
      )}
      {mode && (
        <div className="capture-hint">
          {mode === "region" ? "끌어서 영역 캡처 · Esc 취소" : "클릭해서 색 복사 · Esc 취소"}
        </div>
      )}
    </div>
  );
}
