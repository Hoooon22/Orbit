import { PART_IDS, PARTS, useWreck } from "../wreck";
import { picoDefs, PICO_PARTS, picoHead } from "./picoParts";
import type { PetCharacterAction } from "./faces";

// 산산조각 난 피코. 작업 영역 크기로 넓힌 오브 창 위에 머리 + 조각 9개를 각각 스프라이트 크기 SVG 하나로 그린다.
// 조각은 자기 SVG 안 원래 자리에 있고, SVG의 위치(wreck.ts Pose)가 조각의 위치, 회전축은 조각 중심이다.
export default function WreckStage({ face, opacity }: { face: PetCharacterAction; opacity: number }) {
  const stage = useWreck((s) => s.stage);
  const poses = useWreck((s) => s.poses);
  if (!stage || !poses) return null;
  const u = stage.spriteH / 340;
  return (
    <div className="pet-wreck" style={{ opacity }}>
      {/* 그라데이션은 같은 문서 안이면 어느 SVG에서든 url(#id)로 닿는다 */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        {picoDefs()}
      </svg>
      {PART_IDS.map((id) => {
        const p = poses[id];
        const g = PARTS[id];
        return (
          <svg
            key={id}
            className="wp-char pet-pico"
            viewBox="0 0 240 340"
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: stage.spriteW,
              height: stage.spriteH,
              transform: `rotate(${p.a}deg)`,
              transformOrigin: `${g.cx * u}px ${g.cy * u}px`,
              filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))",
            }}
          >
            {id === "head" ? picoHead(face) : PICO_PARTS[id]}
          </svg>
        );
      })}
    </div>
  );
}
