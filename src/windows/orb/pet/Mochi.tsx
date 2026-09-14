import CharBox, { type CharProps } from "./CharBox";
import { FACES } from "./faces";

// 모치 (MOCHI) — 말랑한 찹쌀떡 정령. 머리 위 연기 한 가닥, 뭉툭한 팔다리.
export default function Mochi({ action = "idle", direction = "left", size = 120 }: CharProps) {
  return (
    <CharBox direction={direction} size={size}>
      <svg
        className="wp-char pet-mochi"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))" }}
      >
        <defs>
          <radialGradient id="mc-body" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0e7ff" />
          </radialGradient>
          <radialGradient id="mc-nub" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c7d2fe" />
          </radialGradient>
          <radialGradient id="mc-foot" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#c7d2fe" />
            <stop offset="100%" stopColor="#818cf8" />
          </radialGradient>
        </defs>

        <ellipse className="ground-shadow" cx="120" cy="322" rx="74" ry="7" fillOpacity="0.35" />

        <g className="body-wrap">
          <g className="leg leg-left">
            <ellipse cx="102" cy="252" rx="13" ry="20" fill="url(#mc-body)" />
            <ellipse cx="102" cy="280" rx="15" ry="9" fill="url(#mc-foot)" />
          </g>
          <g className="leg leg-right">
            <ellipse cx="138" cy="252" rx="13" ry="20" fill="url(#mc-body)" />
            <ellipse cx="138" cy="280" rx="15" ry="9" fill="url(#mc-foot)" />
          </g>

          <g className="arm arm-left">
            <ellipse cx="78" cy="190" rx="11" ry="22" fill="url(#mc-body)" />
            <circle cx="78" cy="212" r="11" fill="url(#mc-nub)" />
          </g>
          <g className="arm arm-right">
            <ellipse cx="162" cy="190" rx="11" ry="22" fill="url(#mc-body)" />
            <circle cx="162" cy="212" r="11" fill="url(#mc-nub)" />
          </g>

          <g className="torso">
            <ellipse cx="120" cy="200" rx="52" ry="50" fill="url(#mc-body)" />
            <path d="M86 200 Q120 220 154 200" stroke="#a5b4fc" strokeWidth="1" fill="none" opacity="0.5" />
            <ellipse cx="120" cy="220" rx="22" ry="14" fill="#eef2ff" opacity="0.7" />
          </g>

          <g className="head">
            <g className="antenna">
              <path d="M120 50 Q116 36 122 28 Q128 20 120 12" stroke="#a5b4fc" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle className="antenna-glow" cx="120" cy="18" r="12" fill="#a5b4fc" opacity="0.3" />
              <ellipse className="antenna-bulb" cx="120" cy="18" rx="7" ry="6" fill="#a5b4fc" />
              <path d="M120 12 Q124 18 120 24" stroke="#fff" strokeWidth="1" fill="none" opacity="0.7" />
            </g>
            <ellipse cx="120" cy="100" rx="60" ry="54" fill="url(#mc-body)" />
            <ellipse cx="120" cy="138" rx="48" ry="6" fill="#a5b4fc" opacity="0.18" />
            <ellipse cx="98" cy="78" rx="18" ry="10" fill="#fff" opacity="0.7" transform="rotate(-20 98 78)" />
            <ellipse cx="78" cy="110" rx="6" ry="4" fill="#fbcfe8" opacity="0.7" />
            <ellipse cx="162" cy="110" rx="6" ry="4" fill="#fbcfe8" opacity="0.7" />

            <g className="face">{FACES[action]}</g>
          </g>
        </g>
      </svg>
    </CharBox>
  );
}
