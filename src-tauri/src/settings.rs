//! 앱 설정. 노트 루트의 `.settings.json` 한 파일에 둔다.
//! WebView localStorage는 앱 식별자가 바뀌면 사라지고 창마다 따로라, 창이 여럿이 되어도
//! 한 곳에서 읽고 쓰도록 파일로 뺐다. Rust가 직접 읽어야 하는 값(단축키·오브 위치 등)도
//! 나중에 여기에 붙는다.

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::notes::{NotesRoot, QUICK_MEMO};
use crate::store::save_atomic;

const FILE: &str = ".settings.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String, // "dark" | "light"
    pub pinned: bool,  // 워크스페이스 창 항상 위
    pub sidebar_width: u32,
    pub font_size: u32,
    pub todo_panel_open: bool,
    pub tabs: Vec<String>,
    pub active_tab: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            pinned: false,
            sidebar_width: 240,
            font_size: 14,
            todo_panel_open: true,
            tabs: vec![QUICK_MEMO.into()],
            active_tab: QUICK_MEMO.into(),
        }
    }
}

/// None이면 아직 설정 파일이 없는 것 (첫 실행). 프런트가 localStorage 값을 옮겨 오는 데 쓴다.
pub struct SettingsState(pub Mutex<Option<Settings>>);

pub fn load(root: &std::path::Path) -> Option<Settings> {
    let text = std::fs::read_to_string(root.join(FILE)).ok()?;
    // 파일이 깨졌으면 기본값으로 시작하되 "파일 있음"으로 취급해 옛 localStorage를 다시 끌어오지 않는다
    Some(serde_json::from_str(&text).unwrap_or_default())
}

#[tauri::command]
pub fn read_settings(state: State<SettingsState>) -> Result<Option<Settings>, String> {
    Ok(state.0.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn write_settings(
    app: AppHandle,
    root: State<NotesRoot>,
    state: State<SettingsState>,
    settings: Settings,
) -> Result<(), String> {
    let mut cur = state.0.lock().map_err(|e| e.to_string())?;
    save_atomic(&root.0.join(FILE), &settings)?;
    *cur = Some(settings);
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"theme":"light"}"#).unwrap();
        assert_eq!(s.theme, "light");
        assert_eq!(s.sidebar_width, 240);
        assert_eq!(s.tabs, vec![QUICK_MEMO.to_string()]);
    }
}
