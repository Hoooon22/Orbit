import type { ReactNode } from "react";
import type { PetCharacterAction } from "./faces";

export type CharProps = {
  action?: PetCharacterAction;
  direction?: "left" | "right";
  size?: number; // 스프라이트 높이(논리 px). 폭은 viewBox 비율로
};

// 캐릭터 SVG를 감싸는 상자. 오른쪽을 볼 때는 통째로 뒤집는다 (WorkPet은 framer-motion rotateY — 여기서는 CSS transition).
export default function CharBox({ direction, size, children }: { direction: "left" | "right"; size: number; children: ReactNode }) {
  return (
    <div
      className="pet-char-box"
      style={{
        width: Math.round((size * 240) / 340),
        height: size,
        transform: direction === "right" ? "rotateY(180deg)" : undefined,
      }}
    >
      {children}
    </div>
  );
}
