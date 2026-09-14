import type { ReactElement } from "react";

// WorkPet에서 가져온 표정 12종. 캐릭터 5종이 같은 얼굴 좌표(viewBox 240×340의 머리 영역)를 공유한다.
// 색·애니메이션은 pet.css가 클래스(.eye .mouth .zzz …)로 준다.
export type PetCharacterAction =
  | "idle"
  | "walking"
  | "smile"
  | "cry"
  | "sleep"
  | "wave"
  | "love"
  | "dance"
  | "alert"
  | "think"
  | "surprise"
  | "angry";

export const FACES: Record<PetCharacterAction, ReactElement> = {
  idle: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye eye-left" />
      <circle cx="140" cy="98" r="6" className="eye eye-right" />
      <rect x="112" y="112" width="16" height="3" rx="1.5" className="mouth" />
    </g>
  ),
  walking: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <circle cx="140" cy="98" r="6" className="eye" />
      <rect x="112" y="112" width="16" height="3" rx="1.5" className="mouth" />
    </g>
  ),
  smile: (
    <g className="face-eyes">
      <path d="M94 100 Q100 92 106 100" className="eye-arc" />
      <path d="M134 100 Q140 92 146 100" className="eye-arc" />
      <path d="M104 112 Q120 122 136 112" className="mouth-arc" />
      <circle cx="86" cy="110" r="4" className="blush" />
      <circle cx="154" cy="110" r="4" className="blush" />
    </g>
  ),
  cry: (
    <g className="face-eyes">
      <path d="M94 100 Q100 108 106 100" className="eye-arc cry-arc" />
      <path d="M134 100 Q140 108 146 100" className="eye-arc cry-arc" />
      <path d="M108 116 Q120 108 132 116" className="mouth-arc cry-mouth" />
      <path className="tear tear-1" d="M98 104 Q95 112 98 118 Q101 112 98 104 Z" />
      <path className="tear tear-2" d="M142 104 Q139 112 142 118 Q145 112 142 104 Z" />
    </g>
  ),
  sleep: (
    <g className="face-eyes">
      <rect x="92" y="98" width="16" height="3" rx="1.5" className="eye-line" />
      <rect x="132" y="98" width="16" height="3" rx="1.5" className="eye-line" />
      <text className="zzz zzz-1" x="158" y="76">
        z
      </text>
      <text className="zzz zzz-2" x="170" y="62">
        Z
      </text>
      <text className="zzz zzz-3" x="184" y="48">
        Z
      </text>
    </g>
  ),
  wave: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <circle cx="140" cy="98" r="6" className="eye" />
      <path d="M104 112 Q120 120 136 112" className="mouth-arc" />
    </g>
  ),
  love: (
    <g className="face-eyes">
      <path
        className="heart-eye"
        d="M100 92 c -6 -7 -16 1 -10 8 c 2 3 7 7 10 10 c 3 -3 8 -7 10 -10 c 6 -7 -4 -15 -10 -8 z"
        transform="translate(-8 0) scale(0.7) translate(38 38)"
      />
      <path
        className="heart-eye"
        d="M140 92 c -6 -7 -16 1 -10 8 c 2 3 7 7 10 10 c 3 -3 8 -7 10 -10 c 6 -7 -4 -15 -10 -8 z"
        transform="translate(32 0) scale(0.7) translate(38 38)"
      />
      <path d="M104 116 Q120 124 136 116" className="mouth-arc" />
    </g>
  ),
  dance: (
    <g className="face-eyes">
      <path d="M94 100 Q100 92 106 100" className="eye-arc" />
      <path d="M134 100 Q140 92 146 100" className="eye-arc" />
      <ellipse cx="120" cy="116" rx="9" ry="5" className="mouth-open" />
    </g>
  ),
  alert: (
    <g className="face-eyes">
      <rect x="98" y="86" width="4" height="14" rx="1.5" className="excl" />
      <rect x="98" y="104" width="4" height="4" rx="1.5" className="excl" />
      <rect x="138" y="86" width="4" height="14" rx="1.5" className="excl" />
      <rect x="138" y="104" width="4" height="4" rx="1.5" className="excl" />
    </g>
  ),
  think: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <path d="M132 96 q 0 -8 8 -8 q 8 0 8 8 q 0 5 -8 8 v 4" className="qmark" />
      <circle cx="140" cy="116" r="2" className="qmark-dot" />
    </g>
  ),
  surprise: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="8" className="eye eye-big" />
      <circle cx="140" cy="98" r="8" className="eye eye-big" />
      <circle cx="120" cy="116" r="4" className="mouth-o" />
    </g>
  ),
  angry: (
    <g className="face-eyes">
      <rect x="91" y="89" width="14" height="3" rx="1.5" className="brow brow-l" />
      <rect x="135" y="89" width="14" height="3" rx="1.5" className="brow brow-r" />
      <circle cx="100" cy="100" r="5" className="eye" />
      <circle cx="140" cy="100" r="5" className="eye" />
      <path d="M108 118 Q120 110 132 118" className="mouth-arc mouth-frown" />
    </g>
  ),
};
