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
    pub orb_visible: bool,
    pub orb_opacity: f64, // 접힌 오브의 투명도 0.3~1.0 (마우스를 올리면 잠시 또렷)
    pub orb_x: Option<i32>, // 접힌 오브의 위치 (물리 픽셀). 없으면 화면 오른쪽 아래
    pub orb_y: Option<i32>,
    pub clipboard_enabled: bool, // 클립보드 기록 (끄면 감시는 계속하되 기록만 안 함)
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
            orb_visible: true,
            orb_opacity: 1.0,
            orb_x: None,
            orb_y: None,
            clipboard_enabled: true,
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

pub fn save(root: &std::path::Path, settings: &Settings) -> Result<(), String> {
    save_atomic(&root.join(FILE), settings)
}

/// 전체 덮어쓰기. 첫 실행에 옛 localStorage 값을 옮겨 올 때만 쓴다.
#[tauri::command]
pub fn write_settings(
    app: AppHandle,
    root: State<NotesRoot>,
    state: State<SettingsState>,
    settings: Settings,
) -> Result<(), String> {
    let mut cur = state.0.lock().map_err(|e| e.to_string())?;
    save(&root.0, &settings)?;
    *cur = Some(settings);
    let _ = app.emit("settings-changed", ());
    Ok(())
}

/// 바뀐 필드만 받아 현재 설정에 병합한다. 창(워크스페이스·오브)마다 자기 사본을 통째로 쓰면
/// 다른 창이 방금 바꾼 값(오브 위치 등)을 옛 값으로 되돌리므로, 변경은 반드시 이 경로로 한다.
#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    root: State<NotesRoot>,
    state: State<SettingsState>,
    patch: serde_json::Value,
) -> Result<Settings, String> {
    let serde_json::Value::Object(patch) = patch else {
        return Err("patch는 객체여야 합니다".into());
    };
    let mut cur = state.0.lock().map_err(|e| e.to_string())?;
    let mut merged = serde_json::to_value(cur.clone().unwrap_or_default()).map_err(|e| e.to_string())?;
    if let serde_json::Value::Object(map) = &mut merged {
        map.extend(patch);
    }
    let next: Settings = serde_json::from_value(merged).map_err(|e| e.to_string())?;
    save(&root.0, &next)?;
    *cur = Some(next.clone());
    let _ = app.emit("settings-changed", ());
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_merges_only_given_fields() {
        let base = Settings { theme: "light".into(), orb_x: Some(10), ..Default::default() };
        let mut v = serde_json::to_value(&base).unwrap();
        let patch = serde_json::json!({"orbX": 99, "orbY": 5}).as_object().cloned().unwrap();
        v.as_object_mut().unwrap().extend(patch);
        let next: Settings = serde_json::from_value(v).unwrap();
        assert_eq!(next.theme, "light"); // 건드리지 않은 필드 유지
        assert_eq!((next.orb_x, next.orb_y), (Some(99), Some(5)));
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let s: Settings = serde_json::from_str(r#"{"theme":"light"}"#).unwrap();
        assert_eq!(s.theme, "light");
        assert_eq!(s.sidebar_width, 240);
        assert_eq!(s.tabs, vec![QUICK_MEMO.to_string()]);
    }
}
