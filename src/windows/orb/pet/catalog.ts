import type { PetKind, PetSize, PetWander } from "../../../shared/api";

// 설정 화면과 오브 창이 같이 쓰는 펫 목록·크기 표. 값은 WorkPet과 같다.
export const PET_KINDS: { id: PetKind; name: string; emoji: string }[] = [
  { id: "pico", name: "피코", emoji: "🤖" },
  { id: "mofu", name: "모푸", emoji: "🧡" },
  { id: "sprout", name: "새싹", emoji: "🌱" },
  { id: "nova", name: "노바", emoji: "🛰️" },
  { id: "mochi", name: "모치", emoji: "🍡" },
];

export const PET_SIZES: { id: PetSize; name: string }[] = [
  { id: "small", name: "작게" },
  { id: "medium", name: "보통" },
  { id: "large", name: "크게" },
];

export const PET_WANDERS: { id: PetWander; name: string }[] = [
  { id: "off", name: "끔" },
  { id: "low", name: "가끔" },
  { id: "normal", name: "보통" },
  { id: "high", name: "자주" },
];

// 스프라이트 높이(논리 px)
export const SPRITE_H: Record<PetSize, number> = { small: 80, medium: 120, large: 160 };

// drop-shadow(0 6px 6px)가 잘리지 않게 창에 두는 여백(논리 px). 좌우 6, 아래 8
export const SHADOW_PAD = { side: 6, bottom: 8 };

// 창 논리 크기. Rust orb::pet_box와 같은 식이어야 한다 (시작 시 Rust가, 크기 변경 시 프론트가 계산)
export function boxFor(size: PetSize): { width: number; height: number } {
  const h = SPRITE_H[size] ?? SPRITE_H.medium;
  return { width: Math.round((h * 240) / 340) + SHADOW_PAD.side * 2, height: h + SHADOW_PAD.bottom };
}

export const isPetKind = (v: unknown): v is PetKind => PET_KINDS.some((k) => k.id === v);
