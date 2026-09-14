import CharBox, { type CharProps } from "./CharBox";
import { FACES } from "./faces";

// 노바 (NOVA) — 헬멧 바이저 얼굴, 통신 안테나의 꼬마 우주인.
export default function Nova({ action = "idle", direction = "left", size = 120 }: CharProps) {
  return (
    <CharBox direction={direction} size={size}>
      <svg
        className="wp-char pet-nova"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: "100%", height: "100%", filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.22))" }}
      >
        <defs>
          <linearGradient id="nv-suit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f5f3ff" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
          <linearGradient id="nv-suit-deep" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ddd6fe" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <radialGradient id="nv-visor" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#312e81" />
            <stop offset="100%" stopColor="#0c0a1e" />
          </radialGradient>
          <radialGradient id="nv-helm" cx="50%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ddd6fe" />
          </radialGradient>
          <linearGradient id="nv-boot" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#1e1b4b" />
          </linearGradient>
        </defs>

        <ellipse className="ground-shadow" cx="120" cy="322" rx="70" ry="6" />

        <g className="body-wrap">
          <g className="leg leg-left">
            <rect x="92" y="232" width="20" height="42" rx="10" fill="url(#nv-suit-deep)" />
            <rect x="92" y="248" width="20" height="3" fill="#a78bfa" opacity="0.7" />
            <ellipse cx="102" cy="280" rx="17" ry="10" fill="url(#nv-boot)" />
            <rect x="92" y="276" width="20" height="3" fill="#a78bfa" opacity="0.9" />
          </g>
          <g className="leg leg-right">
            <rect x="128" y="232" width="20" height="42" rx="10" fill="url(#nv-suit-deep)" />
            <rect x="128" y="248" width="20" height="3" fill="#a78bfa" opacity="0.7" />
            <ellipse cx="138" cy="280" rx="17" ry="10" fill="url(#nv-boot)" />
            <rect x="128" y="276" width="20" height="3" fill="#a78bfa" opacity="0.9" />
          </g>

          <g className="arm arm-left">
            <circle cx="78" cy="170" r="10" fill="url(#nv-suit-deep)" />
            <rect x="69" y="172" width="18" height="34" rx="9" fill="url(#nv-suit)" />
            <rect x="69" y="186" width="18" height="3" fill="#a78bfa" opacity="0.7" />
            <circle cx="78" cy="212" r="11" fill="url(#nv-boot)" />
            <circle cx="78" cy="212" r="5" fill="#c4b5fd" opacity="0.5" />
          </g>
          <g className="arm arm-right">
            <circle cx="162" cy="170" r="10" fill="url(#nv-suit-deep)" />
            <rect x="153" y="172" width="18" height="34" rx="9" fill="url(#nv-suit)" />
            <rect x="153" y="186" width="18" height="3" fill="#a78bfa" opacity="0.7" />
            <circle cx="162" cy="212" r="11" fill="url(#nv-boot)" />
            <circle cx="162" cy="212" r="5" fill="#c4b5fd" opacity="0.5" />
          </g>

          <g className="torso">
            <rect x="74" y="146" width="92" height="94" rx="26" fill="url(#nv-suit)" stroke="#ddd6fe" strokeWidth="1.2" />
            <rect x="92" y="174" width="56" height="40" rx="8" fill="#1e1b4b" />
            <rect x="98" y="180" width="44" height="6" rx="2" fill="#a78bfa" opacity="0.7" />
            <circle cx="102" cy="200" r="3" fill="#22c55e" />
            <circle cx="114" cy="200" r="3" fill="#f59e0b" />
            <circle cx="126" cy="200" r="3" fill="#ef4444" />
            <circle cx="138" cy="200" r="3" fill="#a78bfa" />
            <circle cx="120" cy="226" r="6" fill="#fbbf24" />
            <path d="M120 222 v 8 M116 226 h 8" stroke="#1e1b4b" strokeWidth="1.2" />
          </g>

          <g className="head">
            <g className="antenna">
              <line x1="120" y1="50" x2="120" y2="22" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" />
              <circle className="antenna-glow" cx="120" cy="18" r="11" fill="#ef4444" opacity="0.25" />
              <circle className="antenna-bulb" cx="120" cy="18" r="6" fill="#ef4444" />
              <circle cx="120" cy="18" r="2" fill="#fff" opacity="0.7" />
            </g>
            <circle cx="120" cy="100" r="58" fill="url(#nv-helm)" stroke="#c4b5fd" strokeWidth="1.5" />
            <path d="M74 78 q 6 -22 28 -28" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.85" />
            <path
              d="M70 92 Q70 70 90 66 L 150 66 Q170 70 170 92 L 170 122 Q170 132 158 134 L 82 134 Q70 132 70 122 Z"
              fill="url(#nv-visor)"
            />
            <path d="M78 78 L 100 74 L 78 100 Z" fill="#fff" opacity="0.12" />
            <path d="M158 124 L 168 116 L 168 128 Z" fill="#fff" opacity="0.08" />
            <circle cx="62" cy="100" r="6" fill="url(#nv-suit-deep)" />
            <circle cx="62" cy="100" r="3" fill="#a78bfa" />
            <circle cx="178" cy="100" r="6" fill="url(#nv-suit-deep)" />
            <circle cx="178" cy="100" r="3" fill="#a78bfa" />

            <g className="face">{FACES[action]}</g>
          </g>
        </g>
      </svg>
    </CharBox>
  );
}
