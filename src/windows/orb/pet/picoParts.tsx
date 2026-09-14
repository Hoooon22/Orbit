import type { ReactElement } from "react";
import { FACES, type PetCharacterAction } from "./faces";
import type { PartId } from "../wreck";

// 피코의 그림 조각. Pico.tsx가 골격 안에 끼워 한 마리로 그리고, WreckStage.tsx가 산산조각 날 때 조각마다 따로 그린다.
// 조각 중심 좌표는 wreck.ts PARTS와 맞춰야 한다.

export const picoDefs = () => (
  <defs>
    <linearGradient id="pico-shell" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#ffffff" />
      <stop offset="100%" stopColor="#e8edf5" />
    </linearGradient>
    <linearGradient id="pico-shell-deep" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#f3f4f6" />
      <stop offset="100%" stopColor="#cfd6e2" />
    </linearGradient>
    <linearGradient id="pico-screen" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#0b1220" />
      <stop offset="100%" stopColor="#1a2542" />
    </linearGradient>
    <radialGradient id="pico-core" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stopColor="#93c5fd" />
      <stop offset="60%" stopColor="#2563eb" />
      <stop offset="100%" stopColor="#1d4ed8" />
    </radialGradient>
    <linearGradient id="pico-foot" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stopColor="#475569" />
      <stop offset="100%" stopColor="#1f2937" />
    </linearGradient>
  </defs>
);

export const PICO_PARTS: Record<Exclude<PartId, "head">, ReactElement> = {
  // 다리: 엉덩이(102,234)에서 허벅지가, 무릎(102,255)에서 정강이가 돈다
  "thigh-left": (
    <g className="thigh-left">
      <rect x="93" y="232" width="18" height="24" rx="8" fill="url(#pico-shell-deep)" />
      <rect x="93" y="232" width="18" height="6" rx="3" fill="#cbd5e1" />
    </g>
  ),
  "shin-left": (
    <g className="shin shin-left">
      <circle cx="102" cy="255" r="8" fill="url(#pico-shell-deep)" />
      <rect x="94" y="255" width="16" height="20" rx="7" fill="url(#pico-shell-deep)" />
      <ellipse cx="102" cy="280" rx="16" ry="9" fill="url(#pico-foot)" />
    </g>
  ),
  "thigh-right": (
    <g className="thigh-right">
      <rect x="129" y="232" width="18" height="24" rx="8" fill="url(#pico-shell-deep)" />
      <rect x="129" y="232" width="18" height="6" rx="3" fill="#cbd5e1" />
    </g>
  ),
  "shin-right": (
    <g className="shin shin-right">
      <circle cx="138" cy="255" r="8" fill="url(#pico-shell-deep)" />
      <rect x="130" y="255" width="16" height="20" rx="7" fill="url(#pico-shell-deep)" />
      <ellipse cx="138" cy="280" rx="16" ry="9" fill="url(#pico-foot)" />
    </g>
  ),
  // 팔: 어깨(78,170)에서 위팔이, 팔꿈치(78,190)에서 아래팔이 돈다
  "upperarm-left": (
    <g className="upperarm-left">
      <circle cx="78" cy="170" r="9" fill="url(#pico-shell-deep)" />
      <rect x="70" y="172" width="16" height="20" rx="8" fill="url(#pico-shell)" />
    </g>
  ),
  "forearm-left": (
    <g className="forearm forearm-left">
      <circle cx="78" cy="190" r="7" fill="url(#pico-shell-deep)" />
      <rect x="71" y="190" width="14" height="18" rx="7" fill="url(#pico-shell)" />
      <circle cx="78" cy="212" r="10" fill="#e8edf5" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx="78" cy="212" r="4" fill="#94a3b8" opacity="0.4" />
    </g>
  ),
  "upperarm-right": (
    <g className="upperarm-right">
      <circle cx="162" cy="170" r="9" fill="url(#pico-shell-deep)" />
      <rect x="154" y="172" width="16" height="20" rx="8" fill="url(#pico-shell)" />
    </g>
  ),
  "forearm-right": (
    <g className="forearm forearm-right">
      <circle cx="162" cy="190" r="7" fill="url(#pico-shell-deep)" />
      <rect x="155" y="190" width="14" height="18" rx="7" fill="url(#pico-shell)" />
      <circle cx="162" cy="212" r="10" fill="#e8edf5" stroke="#cbd5e1" strokeWidth="1" />
      <circle cx="162" cy="212" r="4" fill="#94a3b8" opacity="0.4" />
    </g>
  ),
  torso: (
    <g className="torso">
      <rect x="76" y="148" width="88" height="92" rx="22" fill="url(#pico-shell)" stroke="#dbeafe" strokeWidth="1.2" />
      <rect x="86" y="158" width="68" height="72" rx="14" fill="#f8faff" stroke="#dbeafe" strokeWidth="1" />
      <line x1="120" y1="158" x2="120" y2="230" stroke="#e5e7eb" strokeWidth="1" />
      <circle cx="120" cy="194" r="13" fill="url(#pico-core)" />
      <circle cx="120" cy="194" r="13" fill="none" stroke="#1d4ed8" strokeWidth="1" opacity="0.6" />
      <circle className="core-pulse" cx="120" cy="194" r="6" fill="#bfdbfe" opacity="0.85" />
      <circle cx="98" cy="222" r="2" fill="#22c55e" />
      <circle cx="106" cy="222" r="2" fill="#f59e0b" />
      <circle cx="114" cy="222" r="2" fill="#94a3b8" />
    </g>
  ),
};

export const picoHead = (action: PetCharacterAction) => (
  <g className="head">
    <g className="antenna">
      <line x1="120" y1="48" x2="120" y2="22" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      <circle className="antenna-bulb" cx="120" cy="18" r="6" fill="#3b82f6" />
      <circle className="antenna-glow" cx="120" cy="18" r="11" fill="#3b82f6" opacity="0.25" />
    </g>
    <rect x="58" y="50" width="124" height="98" rx="28" fill="url(#pico-shell)" stroke="#dbeafe" strokeWidth="1.2" />
    <path d="M70 62 q 0 -10 10 -10 h 30" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
    <circle cx="55" cy="100" r="8" fill="url(#pico-shell-deep)" />
    <circle cx="55" cy="100" r="4" fill="#64748b" />
    <circle cx="185" cy="100" r="8" fill="url(#pico-shell-deep)" />
    <circle cx="185" cy="100" r="4" fill="#64748b" />
    <rect x="72" y="74" width="96" height="56" rx="14" fill="url(#pico-screen)" />
    <rect x="72" y="74" width="96" height="56" rx="14" fill="none" stroke="#0a0e1a" strokeWidth="1" />
    <path d="M78 80 L96 80 L78 92 Z" fill="#ffffff" opacity="0.06" />
    <g className="face">{FACES[action]}</g>
  </g>
);
