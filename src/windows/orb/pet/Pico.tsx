import CharBox, { type CharProps } from "./CharBox";
import { picoDefs, PICO_PARTS, picoHead } from "./picoParts";

// 피코 (PICO) — 화면 얼굴의 작은 로봇. 다른 캐릭터 4종이 이 골격(어깨·엉덩이·안테나 축)을 공유한다.
// 피코만 팔꿈치·무릎이 있는 2단 관절이고(.forearm/.shin), 그림은 조각(picoParts.tsx)으로 나뉘어 있어
// 세게 던져지면 WreckStage가 조각마다 따로 그려 화면에 흩뿌린다.
export default function Pico({ action = "idle", direction = "left", size = 120 }: CharProps) {
  return (
    <CharBox direction={direction} size={size}>
      <svg
        className="wp-char pet-pico"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))" }}
      >
        {picoDefs()}

        <ellipse className="ground-shadow" cx="120" cy="322" rx="70" ry="6" />

        <g className="body-wrap">
          <g className="leg leg-left">
            {PICO_PARTS["thigh-left"]}
            {PICO_PARTS["shin-left"]}
          </g>
          <g className="leg leg-right">
            {PICO_PARTS["thigh-right"]}
            {PICO_PARTS["shin-right"]}
          </g>

          <g className="arm arm-left">
            {PICO_PARTS["upperarm-left"]}
            {PICO_PARTS["forearm-left"]}
          </g>
          <g className="arm arm-right">
            {PICO_PARTS["upperarm-right"]}
            {PICO_PARTS["forearm-right"]}
          </g>

          {PICO_PARTS.torso}
          {picoHead(action)}
        </g>
      </svg>
    </CharBox>
  );
}
