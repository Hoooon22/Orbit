import { useState } from "react";
import { useSettings } from "../../shared/stores/settings";
import { useLauncher } from "./store";

// 워크스페이스의 런처 관리 화면: 직접 추가한 항목, 시작 메뉴 다시 읽기
export default function LauncherSettings() {
  const items = useLauncher((s) => s.items);
  const addCustom = useLauncher((s) => s.addCustom);
  const removeCustom = useLauncher((s) => s.removeCustom);
  const rescan = useLauncher((s) => s.rescan);
  const shortcut = useSettings((s) => s.settings.shortcutLauncher);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [scanMsg, setScanMsg] = useState("");

  const custom = items.filter((i) => i.custom);
  const scanned = items.length - custom.length;

  const submit = async () => {
    if (!name.trim() || !target.trim()) return;
    await addCustom(name, target);
    setName("");
    setTarget("");
  };

  return (
    <section className="settings-view">
      <header className="editor-header">
        <span className="todo-title">런처</span>
      </header>
      <div className="settings-body">
        <p className="settings-note">
          홈 화면의 실행 칸{shortcut ? `(또는 ${shortcut})` : ""}에서 앱 이름을 치고 Enter로 실행합니다. 한글 초성("ㅋㄹ" → 크롬)도 됩니다. 영문 앱을 한글로 찾고 싶으면 아래에 한글 이름으로 항목을 더하세요.
        </p>

        <section className="settings-section">
          <h3>직접 추가한 항목</h3>
          {custom.length === 0 && <p className="settings-note">아직 없습니다.</p>}
          {custom.map((it) => (
            <div key={it.id} className="settings-row">
              <span>
                {it.name}
                <small>{it.target}</small>
              </span>
              <button onClick={() => removeCustom(it.id)}>삭제</button>
            </div>
          ))}
          <form
            className="launcher-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              value={name}
              placeholder="이름 (예: 크롬)"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              value={target}
              placeholder="실행 파일·폴더 경로 또는 URL"
              spellCheck={false}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button type="submit" disabled={!name.trim() || !target.trim()}>
              추가
            </button>
          </form>
        </section>

        <section className="settings-section">
          <h3>시작 메뉴</h3>
          <div className="settings-row">
            <span>
              바로가기 {scanned}개
              <small>{scanMsg || "새 프로그램을 설치했으면 다시 읽으세요. 10분마다 자동으로도 읽습니다."}</small>
            </span>
            <button
              onClick={() => {
                setScanMsg("읽는 중…");
                void rescan().then((n) => setScanMsg(`${n}개를 읽었습니다.`));
              }}
            >
              다시 읽기
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
