import CharBox, { type CharProps } from "./CharBox";
import { FACES } from "./faces";

// 모푸 (MOFU) — 복숭아색 털뭉치 토끼. 피코 골격을 공유해 같은 애니메이션이 그대로 먹는다.
export default function Mofu({ action = "idle", direction = "left", size = 120 }: CharProps) {
  return (
    <CharBox direction={direction} size={size}>
      <svg
        className="wp-char pet-mofu"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))" }}
      >
        <defs>
          <radialGradient id="mofu-fur" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff7ed" />
            <stop offset="100%" stopColor="#fed7aa" />
          </radialGradient>
          <radialGradient id="mofu-ear" cx="50%" cy="20%" r="80%">
            <stop offset="0%" stopColor="#fed7aa" />
            <stop offset="100%" stopColor="#fb923c" />
          </radialGradient>
          <radialGradient id="mofu-paw" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#fff7ed" />
            <stop offset="100%" stopColor="#fdba74" />
          </radialGradient>
        </defs>

        <ellipse className="ground-shadow" cx="120" cy="322" rx="68" ry="6" />

        <g className="body-wrap">
          <g className="leg leg-left">
            <ellipse cx="102" cy="252" rx="12" ry="22" fill="url(#mofu-fur)" />
            <ellipse cx="102" cy="278" rx="14" ry="8" fill="#fb923c" />
            <ellipse cx="100" cy="276" rx="3" ry="2" fill="#fff7ed" opacity="0.6" />
          </g>
          <g className="leg leg-right">
            <ellipse cx="138" cy="252" rx="12" ry="22" fill="url(#mofu-fur)" />
            <ellipse cx="138" cy="278" rx="14" ry="8" fill="#fb923c" />
            <ellipse cx="140" cy="276" rx="3" ry="2" fill="#fff7ed" opacity="0.6" />
          </g>

          <g className="arm arm-left">
            <ellipse cx="78" cy="190" rx="10" ry="22" fill="url(#mofu-fur)" />
            <circle cx="78" cy="212" r="11" fill="url(#mofu-paw)" />
            <ellipse cx="76" cy="214" rx="2" ry="3" fill="#fb923c" opacity="0.7" />
          </g>
          <g className="arm arm-right">
            <ellipse cx="162" cy="190" rx="10" ry="22" fill="url(#mofu-fur)" />
            <circle cx="162" cy="212" r="11" fill="url(#mofu-paw)" />
            <ellipse cx="164" cy="214" rx="2" ry="3" fill="#fb923c" opacity="0.7" />
          </g>

          <g className="torso">
            <ellipse cx="120" cy="196" rx="48" ry="52" fill="url(#mofu-fur)" />
            <ellipse cx="120" cy="206" rx="28" ry="34" fill="#fff7ed" opacity="0.7" />
            <path d="M112 170 q 8 -6 16 0 q -4 4 -8 4 q -4 0 -8 -4 z" fill="#fed7aa" />
          </g>

          <g className="head">
            <g className="antenna">
              <ellipse cx="88" cy="38" rx="11" ry="26" fill="url(#mofu-ear)" transform="rotate(-12 88 38)" />
              <ellipse cx="88" cy="42" rx="5" ry="18" fill="#fb923c" opacity="0.5" transform="rotate(-12 88 42)" />
              <ellipse cx="152" cy="38" rx="11" ry="26" fill="url(#mofu-ear)" transform="rotate(12 152 38)" />
              <ellipse cx="152" cy="42" rx="5" ry="18" fill="#fb923c" opacity="0.5" transform="rotate(12 152 42)" />
              <circle className="antenna-glow" cx="120" cy="18" r="11" fill="#fb923c" opacity="0.25" />
              <circle className="antenna-bulb" cx="120" cy="18" r="6" fill="#fb923c" />
            </g>

            <circle cx="120" cy="100" r="56" fill="url(#mofu-fur)" />
            <ellipse cx="120" cy="112" rx="40" ry="28" fill="#fff7ed" opacity="0.45" />
            <circle cx="82" cy="108" r="1.5" fill="#c2410c" />
            <circle cx="84" cy="116" r="1.5" fill="#c2410c" />
            <circle cx="158" cy="108" r="1.5" fill="#c2410c" />
            <circle cx="156" cy="116" r="1.5" fill="#c2410c" />
            <path d="M117 108 q 3 -4 6 0 q -3 3 -6 0 z" fill="#fb7185" />

            <g className="face">{FACES[action]}</g>
          </g>
        </g>
      </svg>
    </CharBox>
  );
}
