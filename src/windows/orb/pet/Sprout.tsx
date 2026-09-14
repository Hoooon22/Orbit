import CharBox, { type CharProps } from "./CharBox";
import { FACES } from "./faces";

// 새싹 (SPROUT) — 잎눈 안테나, 잔가지 팔, 뿌리 발의 식물 아이.
export default function Sprout({ action = "idle", direction = "left", size = 120 }: CharProps) {
  return (
    <CharBox direction={direction} size={size}>
      <svg
        className="wp-char pet-sprout"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))" }}
      >
        <defs>
          <linearGradient id="sp-body" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#bbf7d0" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
          <linearGradient id="sp-head" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#dcfce7" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
          <linearGradient id="sp-leaf" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#86efac" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
        </defs>

        <ellipse className="ground-shadow" cx="120" cy="322" rx="64" ry="6" />

        <g className="body-wrap">
          <g className="leg leg-left">
            <path d="M96 232 Q92 250 96 270 Q104 280 108 270 Q112 252 108 234 Z" fill="url(#sp-body)" />
            <ellipse cx="102" cy="278" rx="14" ry="6" fill="#5b3a1f" />
          </g>
          <g className="leg leg-right">
            <path d="M144 232 Q148 250 144 270 Q136 280 132 270 Q128 252 132 234 Z" fill="url(#sp-body)" />
            <ellipse cx="138" cy="278" rx="14" ry="6" fill="#5b3a1f" />
          </g>

          <g className="arm arm-left">
            <rect x="74" y="170" width="8" height="38" rx="4" fill="#5b3a1f" />
            <path
              d="M62 210 q -4 -8 4 -10 q 8 -2 8 8 q 2 -10 10 -8 q 8 4 0 12 q 8 -2 6 6 q -4 8 -12 4 q -6 6 -12 -2 q -8 -4 -4 -10 z"
              fill="url(#sp-leaf)"
            />
            <path d="M78 212 v -10" stroke="#15803d" strokeWidth="1" fill="none" />
          </g>
          <g className="arm arm-right">
            <rect x="158" y="170" width="8" height="38" rx="4" fill="#5b3a1f" />
            <path
              d="M178 210 q 4 -8 -4 -10 q -8 -2 -8 8 q -2 -10 -10 -8 q -8 4 0 12 q -8 -2 -6 6 q 4 8 12 4 q 6 6 12 -2 q 8 -4 4 -10 z"
              fill="url(#sp-leaf)"
            />
            <path d="M162 212 v -10" stroke="#15803d" strokeWidth="1" fill="none" />
          </g>

          <g className="torso">
            <path d="M76 156 Q72 220 96 244 Q120 256 144 244 Q168 220 164 156 Q120 140 76 156 Z" fill="url(#sp-body)" />
            <path d="M96 200 Q120 212 144 200" stroke="#15803d" strokeWidth="1.2" fill="none" opacity="0.5" />
            <circle cx="120" cy="210" r="6" fill="#86efac" opacity="0.7" />
          </g>

          <g className="head">
            <g className="antenna">
              <path d="M118 50 q 0 -16 2 -28" stroke="#5b3a1f" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle className="antenna-glow" cx="120" cy="18" r="14" fill="#22c55e" opacity="0.25" />
              <path className="antenna-bulb" d="M120 8 q -10 4 -8 16 q 4 8 8 6 q 4 2 8 -6 q 2 -12 -8 -16 z" fill="#22c55e" />
              <path d="M120 12 v 14" stroke="#fff" strokeWidth="1" opacity="0.5" />
              <path d="M108 32 q -10 -2 -10 -10 q 10 -4 14 4 z" fill="url(#sp-leaf)" />
            </g>

            <path
              d="M62 92 Q60 60 92 50 Q120 44 148 50 Q180 60 178 92 Q180 132 144 144 Q120 148 96 144 Q60 132 62 92 Z"
              fill="url(#sp-head)"
            />
            <path d="M70 80 Q120 64 170 80" stroke="#22c55e" strokeWidth="1.5" fill="none" opacity="0.5" />
            <circle cx="84" cy="118" r="3.5" fill="#fbcfe8" opacity="0.7" />
            <circle cx="156" cy="118" r="3.5" fill="#fbcfe8" opacity="0.7" />

            <g className="face">{FACES[action]}</g>
          </g>
        </g>
      </svg>
    </CharBox>
  );
}
