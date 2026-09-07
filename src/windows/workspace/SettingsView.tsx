import { useEffect, useState } from "react";
import { dataRoot, openDataRoot } from "../../shared/api";
import { useSettings } from "../../shared/stores/settings";
import { reportError } from "../../shared/stores/error";

// 설정 화면. 탭 하나(::settings)로 열리며 바꾸는 즉시 반영·저장된다.
export default function SettingsView() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [root, setRoot] = useState("");

  useEffect(() => {
    dataRoot().then(setRoot).catch(reportError);
  }, []);

  return (
    <section className="settings-view">
      <header className="editor-header">
        <span className="todo-title">⚙️ 설정</span>
      </header>
      <div className="settings-body">
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
