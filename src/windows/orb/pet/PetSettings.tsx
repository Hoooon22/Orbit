import type { PetSize, PetWander } from "../../../shared/api";
import { useSettings } from "../../../shared/stores/settings";
import { PET_KINDS, PET_SIZES, PET_WANDERS } from "./catalog";

// 투명도 슬라이더는 0~90%(0 = 또렷, 90 = 거의 안 보임). 저장값 orbOpacity는 불투명도 1.0~0.1
const MAX_TRANSPARENCY = 90;
const transparencyOf = (opacity: number) => Math.min(MAX_TRANSPARENCY, Math.max(0, Math.round((1 - opacity) * 100)));

// 펫 캐릭터·크기·돌아다니기·투명도 설정 줄 4개. Orbit 설정 화면과 펫 패널이 같이 쓴다.
export default function PetSettings() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const transparency = transparencyOf(settings.orbOpacity);
  return (
    <>
      <div className="settings-row">
        <span>
          캐릭터
          <small>화면 바닥을 걸어 다니는 펫. 클릭하면 패널이 열리고, 끌어서 옮기거나 던질 수 있습니다.</small>
        </span>
        <span className="pet-picker" role="radiogroup" aria-label="캐릭터">
          {PET_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={settings.petKind === k.id}
              title={k.name}
              onClick={() => update({ petKind: k.id })}
            >
              <span className="pet-picker-emoji">{k.emoji}</span>
              {k.name}
            </button>
          ))}
        </span>
      </div>
      <label className="settings-row">
        <span>크기</span>
        <select value={settings.petSize} onChange={(e) => update({ petSize: e.target.value as PetSize })}>
          {PET_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-row">
        <span>
          돌아다니기
          <small>서 있다가 가끔 좌우로 걷습니다. 끄면 제자리에 서 있습니다(자리를 비우거나 회의 중일 때도 멈춥니다).</small>
        </span>
        <select value={settings.petWander} onChange={(e) => update({ petWander: e.target.value as PetWander })}>
          {PET_WANDERS.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-row">
        <span>
          투명도
          <small>0%면 또렷하고 90%면 거의 안 보입니다. 마우스를 올리면 잠시 또렷해집니다.</small>
        </span>
        <span className="settings-range">
          <input
            type="range"
            min={0}
            max={MAX_TRANSPARENCY}
            step={5}
            value={transparency}
            onChange={(e) => update({ orbOpacity: (100 - Number(e.target.value)) / 100 })}
          />
          {transparency}%
        </span>
      </label>
    </>
  );
}
