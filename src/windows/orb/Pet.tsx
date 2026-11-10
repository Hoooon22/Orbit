import { useRef } from "react";
import { todayStr } from "../../shared/dates";
import { useSettings } from "../../shared/stores/settings";
import { pendingNow, useTodos } from "../../modules/todo/store";
import { useAllEvents } from "../../modules/calendar/googleStore";
import { useTimers } from "../../modules/timer/store";
import { eventsOn } from "../../modules/calendar/calendar";
import Bubble from "./Bubble";
import TimerPlate from "./TimerPlate";
import { useBubble } from "./bubbleStore";
import { useOrbStatus } from "./status";
import { usePet } from "./petStore";
import { beginDrag } from "./petLoop";
import PetSprite from "./pet/PetSprite";
import type { PetAction } from "./pet/PetSprite";
import WreckStage from "./pet/WreckStage";
import { useWreck } from "./wreck";
import { boxFor, SPRITE_H } from "./pet/catalog";

type Props = {
  opacity: number; // 설정의 불투명도 (0.1~1 = 투명도 90~0%). 마우스를 올리면 잠시 또렷하게
  onActivate: () => void;
};

const MIN_OPACITY = 0.1; // 투명도 90%까지만 — 아예 안 보이면 잡을 수 없다
const AWAY_OPACITY = 0.3;

const DRAG_THRESHOLD = 4; // px. 이보다 덜 움직였으면 클릭으로 본다
const HOVER_BUBBLE_MS = 500; // 이만큼 머물러야 타이머 말풍선이 뜬다

// 오브 = 펫 한 마리. 클릭하면 옆에 패널을 열고, 끌면 잡아서 옮긴다(놓으면 떨어지거나 날아간다).
// 끌기는 petLoop가 커서를 폴링해 창을 옮기므로(OS 드래그 아님) 4px 넘게 움직인 순간 넘긴다.
export default function Pet({ opacity, onActivate }: Props) {
  const kind = useSettings((s) => s.settings.petKind);
  const petSize = useSettings((s) => s.settings.petSize);
  const pending = useTodos((s) => pendingNow(s.todos)); // 툴팁용 (배지는 그리지 않는다)
  const events = useAllEvents();
  const todayEvents = eventsOn(events, todayStr()).length;
  const alert = useTodos((s) => s.fired.length > 0);
  const bubble = useBubble((s) => s.current);
  const timerBubble = useBubble((s) => s.timers);
  const side = useBubble((s) => s.side);
  const away = useOrbStatus((s) => s.away);
  const meeting = useOrbStatus((s) => s.meeting);
  const phase = usePet((s) => s.phase);
  const gait = usePet((s) => s.gait);
  const oneShot = usePet((s) => s.oneShot);
  const direction = usePet((s) => s.direction);
  const hover = usePet((s) => s.hover);
  const wrecked = useWreck((s) => s.stage !== null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  // 타이머 말풍선: 창(펫) 위에 잠깐 머물면 돌고 있는 타이머 목록을 옆에 띄우고, 창을 벗어나거나 누르면 닫는다.
  // .pet이 아니라 창 전체(.orb-root)의 enter/leave로 본다 — 창이 넓어지며 펫이 한쪽으로 붙는 순간
  // .pet에는 mouseleave가 잘못 올 수 있다. 바로 띄우지 않는 건 패널을 열러 올 때마다 번쩍이지 않게.
  const closeTimerBubble = () => {
    window.clearTimeout(hoverTimer.current);
    useBubble.getState().hideTimers();
  };
  const armTimerBubble = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      if (useTimers.getState().timers.some((t) => !!t.startedAt)) useBubble.getState().showTimers();
    }, HOVER_BUBBLE_MS);
  };

  // 표정: 잠깐 하는 동작 > 잡힘/낙하/비행(놀람) > 폴짝 > 걷기(걸음에 따라) > 자리 비움(잠) > 회의(생각) > 평소
  const action: PetAction =
    oneShot ??
    (phase === "held" || phase === "falling" || phase === "throwing"
      ? "surprise"
      : phase === "jumping"
        ? "jump"
        : phase === "walk"
          ? gait
          : away
            ? "sleep"
            : meeting
              ? "think"
              : "idle");

  // 상태 요약. 화면에는 그리지 않고 data-tip으로만 둔다 (툴팁·aria-label은 위 주석의 이유로 안 쓴다)
  const tip =
    `Orbit — 클릭하면 패널, 끌어서 옮기기` +
    (pending ? `\n당장 할 일 ${pending}` : "") +
    (todayEvents ? `\n오늘 일정 ${todayEvents}` : "") +
    (meeting ? `\n회의 중 · ${meeting.title} · ~${meeting.endLabel}` : "") +
    (away ? "\n자리 비움" : "") +
    (alert ? "\n닫지 않은 알림 있음" : "");
  const box = boxFor(petSize);
  // 자리 비움이면 흐리게 (설정이 더 흐리면 그대로)
  const petOpacity = hover ? 1 : Math.min(away ? AWAY_OPACITY : 1, Math.max(MIN_OPACITY, opacity));

  // 피코가 산산조각 난 동안은 창이 작업 영역 전체라 펫 상자 대신 조각들을 그린다 (잡을 수 없다)
  if (wrecked) {
    return (
      <div className="orb-root">
        <WreckStage face="surprise" opacity={petOpacity} />
      </div>
    );
  }

  return (
    <div
      className={"orb-root" + (bubble || timerBubble ? ` side-${side}` : "")}
      onMouseEnter={armTimerBubble}
      onMouseLeave={closeTimerBubble}
    >
      {/* role="button"·aria-label·title을 주지 않는다: 접근성 컨트롤이 되면 마우스를 올릴 때 Windows가
          펫 뒤에 반투명 흰 강조 상자를 그린다 (투명 창이라 그대로 보인다) */}
      <div
        className={`pet pet-${petSize}`}
        data-tip={tip}
        style={{
          width: box.width,
          height: box.height,
          opacity: petOpacity,
        }}
        onMouseEnter={() => {
          usePet.getState().setHover(true);
          useOrbStatus.getState().wake();
        }}
        onMouseLeave={() => {
          usePet.getState().setHover(false);
          down.current = null;
        }}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          // 기본 동작을 막지 않으면 Chromium이 SVG 그림의 네이티브 드래그를 시작해 반투명 고스트가 펫 뒤에 남고
          // mouseup을 삼킨다 (클릭이 씹히고 흰 배경이 보이던 원인)
          e.preventDefault();
          down.current = { x: e.clientX, y: e.clientY };
          // 말풍선은 끌기 전에 접는다 (접을 때 창 x가 바뀌므로 OS 드래그 중엔 못 접는다)
          if (useBubble.getState().current) useBubble.getState().dismiss();
          closeTimerBubble();
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
          usePet.getState().playAction(Math.random() < 0.25 ? "love" : "smile", 1500); // 눌러 주면 좋아한다 (가끔 하트 눈)
          onActivate();
        }}
      >
        <PetSprite kind={kind} action={action} direction={direction} size={SPRITE_H[petSize] ?? SPRITE_H.medium} />
        <TimerPlate />
      </div>
      <Bubble />
    </div>
  );
}
