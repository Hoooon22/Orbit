import { useEffect, useState } from "react";
import {
  applyShortcuts,
  autostartEnabled,
  dataRoot,
  openDataRoot,
  resetOrbPosition,
  setAutostart,
  setOrbVisible,
} from "../../shared/api";
import { relativeTime } from "../../shared/dates";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";
import { useGoogle } from "../../modules/calendar/googleStore";

type Props = { onOpenLauncher: () => void };

// Orbit 설정 화면. 바꾸는 즉시 반영·저장된다.
export default function SettingsView({ onOpenLauncher }: Props) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [root, setRoot] = useState("");
  // 단축키는 적용 버튼을 눌러야 등록된다 (입력 도중 반쯤 적힌 키가 등록되지 않게)
  const [quickKey, setQuickKey] = useState(settings.shortcutQuickMemo);
  const [launcherKey, setLauncherKey] = useState(settings.shortcutLauncher);
  const [keyMsg, setKeyMsg] = useState("");
  // 구글 캘린더
  const google = useGoogle((s) => s.status);
  const connecting = useGoogle((s) => s.connecting);
  const syncing = useGoogle((s) => s.syncing);
  const gConnect = useGoogle((s) => s.connect);
  const gDisconnect = useGoogle((s) => s.disconnect);
  const gSetClient = useGoogle((s) => s.setClient);
  const gToggle = useGoogle((s) => s.setCalendarEnabled);
  const gSync = useGoogle((s) => s.sync);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [gMsg, setGMsg] = useState("");
  // 숨김 단어는 쉼표로 적고, 입력이 끝나면(포커스 아웃) 저장한다
  const [hiddenDraft, setHiddenDraft] = useState(settings.googleHiddenTitles.join(", "));
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
              <small>어디서든 Orbit 창의 메모 화면을 빠른 메모로. 예: ctrl+alt+m</small>
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
              <small>Orbit 창을 열고 실행 칸에 커서를 둡니다. 예: alt+space (PowerToys Run과 겹치면 바꾸세요)</small>
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
            <span>Orbit 창을 항상 위에 고정</span>
            <input
              type="checkbox"
              checked={settings.pinned}
              onChange={(e) => update({ pinned: e.target.checked })}
            />
          </label>
          <label className="settings-row">
            <span>메모 본문 글자 크기 (Ctrl+휠로도 조절)</span>
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
              <small>트레이 메뉴의 "오브 표시/숨김"과 같습니다. 끌어서 옮기고, 클릭하면 이 창이 열립니다.</small>
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
          <div className="settings-row">
            <span>
              오브 위치 초기화
              <small>오브가 안 보이면(모니터를 뗀 뒤 화면 밖에 남는 등) 주 모니터 오른쪽 아래로 되돌리고 켭니다.</small>
            </span>
            <button
              onClick={() => {
                update({ orbVisible: true, orbX: null, orbY: null });
                resetOrbPosition().catch(reportError);
              }}
            >
              되돌리기
            </button>
          </div>
          <label className="settings-row">
            <span>
              오브 투명도
              <small>마우스를 올리면 잠시 또렷해집니다.</small>
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
          <h3>구글 캘린더</h3>
          <p className="settings-note">
            Google Cloud Console에서 만든 <b>데스크톱 앱</b> OAuth 클라이언트의 ID와 비밀번호를 넣고, 계정을 하나씩 추가하세요.
            (만드는 방법은 README의 "구글 캘린더 연결" 참고) 일정은 읽기 전용으로 가져와 15분마다 갱신됩니다.
          </p>
          <div className="settings-row settings-google-client">
            <input
              value={clientId}
              placeholder={google?.configured ? "클라이언트 ID (저장됨 — 바꾸려면 다시 입력)" : "클라이언트 ID (…apps.googleusercontent.com)"}
              spellCheck={false}
              onChange={(e) => setClientId(e.target.value)}
            />
            <input
              value={clientSecret}
              placeholder={google?.configured ? "클라이언트 비밀번호 (저장됨)" : "클라이언트 비밀번호 (GOCSPX-…)"}
              spellCheck={false}
              type="password"
              onChange={(e) => setClientSecret(e.target.value)}
            />
            <button
              disabled={!clientId.trim() || !clientSecret.trim()}
              onClick={() => {
                void gSetClient(clientId, clientSecret).then(() => {
                  setClientId("");
                  setClientSecret("");
                  setGMsg("클라이언트 정보를 저장했습니다. 이제 계정을 추가하세요.");
                });
              }}
            >
              저장
            </button>
          </div>
          {google?.accounts.map((acc) => (
            <div key={acc.email} className="settings-google-account">
              <div className="settings-row">
                <span>
                  {acc.email}
                  <small>보여 줄 캘린더를 고르세요</small>
                </span>
                <button onClick={() => void gDisconnect(acc.email)}>연결 해제</button>
              </div>
              <div className="settings-google-cals">
                {acc.calendars.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) => void gToggle(acc.email, c.id, e.target.checked)}
                    />
                    <span className="calendar-color" style={{ background: c.color ?? "var(--accent)" }} />
                    {c.summary}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="settings-row">
            <span>
              Orbit에서 숨길 구글 일정 제목
              <small>
                제목에 이 단어가 들어가면 안 보입니다 (구글에는 그대로). 쉼표로 여러 개. 캘린더 화면의 구글 일정 상세에서 "이 제목 숨기기"로도 추가됩니다.
              </small>
            </span>
            <input
              className="settings-hidden-titles"
              value={hiddenDraft}
              placeholder="예: office, 출근"
              spellCheck={false}
              onChange={(e) => setHiddenDraft(e.target.value)}
              onBlur={() =>
                update({
                  googleHiddenTitles: hiddenDraft
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <div className="settings-row">
            <span>
              <small>
                {gMsg ||
                  (google?.error
                    ? `⚠ ${google.error}`
                    : google?.lastSync
                      ? `마지막 동기화 ${relativeTime(google.lastSync)}`
                      : google?.accounts.length
                        ? "아직 동기화 전"
                        : "연결된 계정이 없습니다. 계정이 두 개면 두 번 추가하세요.")}
              </small>
            </span>
            <span className="settings-google-actions">
              {(google?.accounts.length ?? 0) > 0 && (
                <button onClick={() => void gSync()} disabled={syncing}>
                  {syncing ? "받는 중…" : "지금 동기화"}
                </button>
              )}
              <button
                disabled={!google?.configured || connecting}
                title={google?.configured ? "브라우저에서 Google 로그인" : "먼저 클라이언트 정보를 저장하세요"}
                onClick={() => {
                  setGMsg("브라우저에서 로그인하세요. 끝나면 여기로 돌아옵니다…");
                  void gConnect().then((email) =>
                    setGMsg(email ? `${email} 연결됨. 일정을 받아오는 중…` : ""),
                  );
                }}
              >
                {connecting ? "로그인 대기 중…" : "+ Google 계정 추가"}
              </button>
            </span>
          </div>
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
            <button onClick={onOpenLauncher}>항목 관리</button>
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
