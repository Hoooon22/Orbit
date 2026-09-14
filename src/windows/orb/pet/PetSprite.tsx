import type { ReactElement } from "react";
import type { PetKind } from "../../../shared/api";
import type { PetCharacterAction } from "./faces";
import type { CharProps } from "./CharBox";
import Pico from "./Pico";
import Mofu from "./Mofu";
import Sprout from "./Sprout";
import Nova from "./Nova";
import Mochi from "./Mochi";

// 펫이 하는 동작. 표정 12종(faces.tsx)보다 넓은 어휘라 아래 표로 접는다.
export type PetAction =
  | "idle"
  | "walk"
  | "sleep"
  | "wave"
  | "dance"
  | "stretch"
  | "alert"
  | "tumble"
  | "think"
  | "surprise"
  | "smile";

const FACE: Record<PetAction, PetCharacterAction> = {
  idle: "idle",
  smile: "smile",
  walk: "walking",
  sleep: "sleep",
  wave: "wave",
  dance: "dance",
  stretch: "smile",
  alert: "alert",
  tumble: "cry",
  think: "think",
  surprise: "surprise",
};

const COMPONENT: Record<PetKind, (p: CharProps) => ReactElement> = {
  pico: Pico,
  mofu: Mofu,
  sprout: Sprout,
  nova: Nova,
  mochi: Mochi,
};

export default function PetSprite({
  kind,
  action,
  direction,
  size,
}: {
  kind: PetKind;
  action: PetAction;
  direction: "left" | "right";
  size: number;
}) {
  const Char = COMPONENT[kind] ?? Pico;
  return <Char action={FACE[action]} direction={direction} size={size} />;
}
