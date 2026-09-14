import { useRef } from "react";
import { todayStr } from "../../shared/dates";
import { useSettings } from "../../shared/stores/settings";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { eventsOn } from "../../modules/calendar/calendar";
import Bubble from "./Bubble";
import { useBubble } from "./bubbleStore";
import { useOrbStatus } from "./status";
import { usePet } from "./petStore";
import { beginDrag } from "./petLoop";
import PetSprite from "./pet/PetSprite";
import type { PetAction } from "./pet/PetSprite";
import { boxFor, SPRITE_H } from "./pet/catalog";

type Props = {
  opacity: number; // 설정의 불투명도 (0.1~1 = 투명도 90~0%). 마우스를 올리면 잠시 또렷하게
  onActivate: () => void;
};

const MIN_OPACITY = 0.1; // 투명도 90%까지만 — 아예 안 보이면 잡을 수 없다
const AWAY_OPACITY = 0.3;

const DRAG_THRESHOLD = 4; // px. 이보다 덜 움직였으면 클릭으로 본다

// 오브 = 펫 한 마리. 클릭하면 옆에 패널을 열고, 끌면 잡아서 옮긴다(놓으면 떨어지거나 날아간다).
// startDragging()이 마우스를 가져가 버려 mouseup이 오지 않으므로, 끌기 시작 전에 클릭 여부를 판정한다.
export default function Pet({ opacity, onActivate }: Props) {
  const kind = useSettings((s) => s.settings.petKind);
  const petSize = useSettings((s) => s.settings.petSize);
  const pending = useTodos((s) => pendingNow(s.todos)); // 노란 배지 = 당장 할 일만
  const events = useAllEvents();
  const todayEvents = eventsOn(events, todayStr()).length;
  const alert = useTodos((s) => s.fired.length > 0);
  const bubble = useBubble((s) => s.current);
  const side = useBubble((s) => s.side);
  const away = useOrbStatus((s) => s.away);
  const meeting = useOrbStatus((s) => s.meeting);
  const phase = usePet((s) => s.phase);
  const oneShot = usePet((s) => s.oneShot);
  const direction = usePet((s) => s.direction);
  const hover = usePet((s) => s.hover);
  const down = useRef<{ x: number; y: number } | null>(null);

  // 표정: 잠깐 하는 동작 > 잡힘/낙하/비행(놀람) > 걷기 > 자리 비움(잠) > 회의(생각) > 평소
  const action: PetAction =
    oneShot ??
    (phase === "held" || phase === "falling" || phase === "throwing"
      ? "surprise"
      : phase === "walk"
        ? "walk"
        : away
          ? "sleep"
          : meeting
            ? "think"
            : "idle");

  const tip =
    `Orbit — 클릭하면 패널, 끌어서 옮기기` +
    (pending ? `\n당장 할 일 ${pending}` : "") +
    (todayEvents ? `\n오늘 일정 ${todayEvents}` : "") +
    (meeting ? `\n회의 중 · ${meeting.title} · ~${meeting.endLabel}` : "") +
    (away ? "\n자리 비움" : "") +
    (alert ? "\n닫지 않은 알림 있음" : "");
  const box = boxFor(petSize);

  return (
    <div className={"orb-root" + (bubble ? ` side-${side}` : "")}>
      <div
        className="pet"
        role="button"
        aria-label="Orbit 패널 열기"
        title={tip}
        style={{
          width: box.width,
          height: box.height,
          // 자리 비움이면 흐리게 (설정이 더 흐리면 그대로)
          opacity: hover ? 1 : Math.min(away ? AWAY_OPACITY : 1, Math.max(MIN_OPACITY, opacity)),
        }}
        onMouseEnter={() => {
          usePet.getState().setHover(true);
          useOrbStatus.getState().wake();
        }}
        onMouseLeave={() => {
          usePet.getState().setHover(false);
          down.current = null;
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          down.current = { x: e.clientX, y: e.clientY };
          // 말풍선은 끌기 전에 접는다 (접을 때 창 x가 바뀌므로 OS 드래그 중엔 못 접는다)
          if (useBubble.getState().current) useBubble.getState().dismiss();
        }}
        onMouseMove={(e) => {
          const d = down.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < DRAG_THRESHOLD) return;
          if (beginDrag()) down.current = null; // 아직 말풍선이 접히는 중이면 다음 mousemove에 다시
        }}
        onMouseUp={(e) => {
          if (e.button !== 0 || !down.current) return;
          down.current = null;
          useOrbStatus.getState().wake();
          usePet.getState().playAction("smile", 1500); // 눌러 주면 좋아한다
          onActivate();
        }}
      >
        <PetSprite kind={kind} action={action} direction={direction} size={SPRITE_H[petSize] ?? SPRITE_H.medium} />
        {pending > 0 && <span className="orb-badge">{pending > 99 ? "99+" : pending}</span>}
        {todayEvents > 0 && <span className="orb-badge events">{todayEvents}</span>}
      </div>
      <Bubble />
    </div>
  );
}
