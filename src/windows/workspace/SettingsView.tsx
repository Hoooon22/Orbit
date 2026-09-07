import { useEffect, useState } from "react";
import {
  applyShortcuts,
  autostartEnabled,
  dataRoot,
  LAUNCHER_VIEW,
  openDataRoot,
  setAutostart,
  setOrbVisible,
} from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";

type Props = { onOpen: (path: string) => void };

// 설정 화면. 탭 하나(::settings)로 열리며 바꾸는 즉시 반영·저장된다.
export default function SettingsView({ onOpen }: Props) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [root, setRoot] = useState("");
  // 단축키는 적용 버튼을 눌러야 등록된다 (입력 도중 반쯤 적힌 키가 등록되지 않게)
  const [quickKey, setQuickKey] = useState(settings.shortcutQuickMemo);
  const [launcherKey, setLauncherKey] = useState(settings.shortcutLauncher);
  const [keyMsg, setKeyMsg] = useState("");
  // 자동 시작은 설정 파일이 아니라 OS(레지스트리 Run 키)가 진실이라 매번 물어본다
  const [autostart, setAutostartState] = useState<boolean | null>(null);

  useEffect(() => {
    dataRoot().then(setRoot).catch(reportError);
    autostartEnabled().then(setAutostartState).catch(reportError);
  }, []);

  return (
    <section className="settings-view">
      <header className="editor-header">
        <span className="todo-title">⚙️ 설정</span>
      </header>
      <div className="settings-body">
        <section className="settings-section">
          <h3>일반</h3>
          <label className="settings-row">
            <span>
              Windows 로그인 시 자동 시작
              <small>켜 두면 부팅 뒤 오브만 조용히 떠 있습니다. 리마인더도 이때부터 울립니다.</small>
            </span>
            <input
              type="checkbox"
              checked={autostart ?? false}
              disabled={autostart === null}
              onChange={(e) => {
                const on = e.target.checked;
                setAutostartState(on);
                setAutostart(on).catch((err) => {
                  reportError(err);
                  setAutostartState(!on);
                });
              }}
            />
          </label>
        </section>
        <section className="settings-section">
          <h3>단축키</h3>
          <label className="settings-row">
            <span>
              빠른 메모 열기
              <small>어디서든 워크스페이스의 빠른 메모로. 예: ctrl+alt+m</small>
            </span>
            <input
              className="settings-key"
              value={quickKey}
              spellCheck={false}
              onChange={(e) => setQuickKey(e.target.value)}
            />
          </label>
          <label className="settings-row">
            <span>
              런처 열기
              <small>오브를 런처 탭으로 펼칩니다. 예: alt+space (PowerToys Run과 겹치면 바꾸세요)</small>
            </span>
            <input
              className="settings-key"
              value={launcherKey}
              spellCheck={false}
              onChange={(e) => setLauncherKey(e.target.value)}
            />
          </label>
          <div className="settings-row">
            <span>
              <small>{keyMsg || "비워 두면 그 단축키는 쓰지 않습니다. 바꾼 뒤 적용을 누르세요."}</small>
            </span>
            <button
              onClick={() => {
                update({
                  shortcutQuickMemo: quickKey.trim().toLowerCase(),
                  shortcutLauncher: launcherKey.trim().toLowerCase(),
                });
                // 저장이 300ms 뒤라 그 뒤에 등록해야 새 값을 읽는다
                window.setTimeout(() => {
                  applyShortcuts()
                    .then(() => setKeyMsg("적용했습니다."))
                    .catch((e) => setKeyMsg(String(e)));
                }, 400);
              }}
            >
              적용
            </button>
          </div>
        </section>
        <section className="settings-section">
          <h3>화면</h3>
          <label className="settings-row">
            <span>테마</span>
            <select
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as "dark" | "light" })}
            >
              <option value="dark">다크</option>
              <option value="light">라이트</option>
            </select>
          </label>
          <label className="settings-row">
            <span>창을 항상 위에 고정</span>
            <input
              type="checkbox"
              checked={settings.pinned}
              onChange={(e) => update({ pinned: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>본문 글자 크기 (Ctrl+휠로도 조절)</span>
            <input
              type="number"
              min={10}
              max={32}
              value={settings.fontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 10 && v <= 32) update({ fontSize: v });
              }}
            />
          </label>
        </section>
        <section className="settings-section">
          <h3>오브</h3>
          <label className="settings-row">
            <span>
              화면에 오브 표시
              <small>트레이 메뉴의 "오브 표시/숨김"과 같습니다. 끌어서 옮기고, 클릭하면 펼쳐집니다.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.orbVisible}
              onChange={(e) => {
                update({ orbVisible: e.target.checked });
                setOrbVisible(e.target.checked).catch(reportError);
              }}
            />
          </label>
          <label className="settings-row">
            <span>
              접힌 오브 투명도
              <small>마우스를 올리거나 펼치면 잠시 또렷해집니다.</small>
            </span>
            <span className="settings-range">
              <input
                type="range"
                min={30}
                max={100}
                step={5}
                value={Math.round(settings.orbOpacity * 100)}
                onChange={(e) => update({ orbOpacity: Number(e.target.value) / 100 })}
              />
              {Math.round(settings.orbOpacity * 100)}%
            </span>
          </label>
        </section>
        <section className="settings-section">
          <h3>클립보드</h3>
          <label className="settings-row">
            <span>
              복사한 텍스트 기록
              <small>
                최근 200개를 %LOCALAPPDATA% 안에 저장합니다. 비밀번호 관리자가 "기록 금지"로 표시한 내용은 남기지 않습니다.
              </small>
            </span>
            <input
              type="checkbox"
              checked={settings.clipboardEnabled}
              onChange={(e) => update({ clipboardEnabled: e.target.checked })}
            />
          </label>
        </section>
        <section className="settings-section">
          <h3>런처</h3>
          <div className="settings-row">
            <span>
              직접 추가한 항목과 시작 메뉴 색인
              <small>한글 이름으로 영문 앱을 찾게 하거나 자주 여는 폴더·주소를 등록합니다.</small>
            </span>
            <button onClick={() => onOpen(LAUNCHER_VIEW)}>항목 관리</button>
          </div>
        </section>
        <section className="settings-section">
          <h3>데이터</h3>
          <div className="settings-row">
            <span>
              저장 위치
              <small>{root}</small>
            </span>
            <button onClick={() => openDataRoot().catch(reportError)}>폴더 열기</button>
          </div>
          <p className="settings-note">
            메모는 이 폴더에 마크다운(.md)으로, 할 일은 .todos.json에, 설정은 .settings.json에 저장됩니다.
          </p>
        </section>
      </div>
    </section>
  );
}
