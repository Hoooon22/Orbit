//! 클립보드 히스토리. Windows 클립보드 변경을 리스너로 받아 텍스트만 기록한다.
//! 파일은 문서 폴더가 아닌 로컬 데이터 폴더(%LOCALAPPDATA%)에 둔다 — 복사한 내용은 기기 종속이고
//! OneDrive로 올라가면 안 되며, 노트 루트에 두면 파일 워처가 매번 깨어난다.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::store::save_atomic;

const FILE: &str = "clipboard.json";
const MAX_ITEMS: usize = 200;
const MAX_TEXT: usize = 100_000; // 글자 수. 파일 통째 복사 같은 건 기록하지 않는다

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String, // 텍스트 해시. 같은 텍스트를 다시 복사하면 같은 항목이 앞으로 온다
    pub text: String,
    pub copied_at: u64,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub count: u32,
}

pub struct ClipState {
    items: Mutex<Vec<ClipItem>>,
    path: PathBuf,
    /// 앱이 스스로 클립보드에 쓴 직후의 변경 알림은 건너뛴다 (횟수가 부풀지 않게)
    skip_next: AtomicBool,
}

impl ClipState {
    pub fn load(local: &Path) -> Self {
        let path = local.join(FILE);
        let items = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self { items: Mutex::new(items), path, skip_next: AtomicBool::new(false) }
    }

    fn save(&self, items: &[ClipItem]) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = save_atomic(&self.path, &items);
    }
}

fn hash_id(text: &str) -> String {
    let mut h = DefaultHasher::new();
    text.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 순수 함수: 새 텍스트를 맨 앞에. 이미 있으면 앞으로 옮기고 횟수를 올린다.
/// 상한을 넘으면 고정하지 않은 항목을 뒤에서부터 지운다. 기록했으면 그 항목을 돌려준다.
fn push(items: &mut Vec<ClipItem>, text: String, now: u64) -> Option<ClipItem> {
    if text.trim().is_empty() || text.chars().count() > MAX_TEXT {
        return None;
    }
    let id = hash_id(&text);
    let item = match items.iter().position(|i| i.id == id) {
        Some(pos) => {
            let mut it = items.remove(pos);
            it.copied_at = now;
            it.count += 1;
            it
        }
        None => ClipItem { id, text, copied_at: now, pinned: false, count: 1 },
    };
    items.insert(0, item.clone());
    while items.len() > MAX_ITEMS {
        match items.iter().rposition(|i| !i.pinned) {
            Some(pos) => {
                items.remove(pos);
            }
            None => break,
        }
    }
    Some(item)
}

/// 비밀번호 관리자 등이 "기록하지 말라"고 표시한 내용인지
#[cfg(windows)]
fn excluded_by_source() -> bool {
    use clipboard_win::raw::{is_format_avail, register_format};
    // 표준 표시 형식. 형식이 있기만 해도 제외 요청으로 본다
    // (CanIncludeInClipboardHistory는 값이 0일 때만 제외지만, 이 형식을 굳이 넣는 프로그램은 대개 제외 목적이다)
    ["ExcludeClipboardContentFromMonitorProcessing", "CanIncludeInClipboardHistory"]
        .iter()
        .any(|name| register_format(name).is_some_and(|f| is_format_avail(f.get())))
}

/// 클립보드 변경 감시 스레드. 텍스트가 바뀔 때마다 기록하고 창들에 알린다.
#[cfg(windows)]
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        use clipboard_win::{formats, get_clipboard, Monitor};
        let Ok(mut monitor) = Monitor::new() else {
            return;
        };
        while let Ok(true) = monitor.recv() {
            let Some(state) = app.try_state::<ClipState>() else { continue };
            if state.skip_next.swap(false, Ordering::SeqCst) {
                continue;
            }
            if !enabled(&app) || excluded_by_source() {
                continue;
            }
            let Ok(text) = get_clipboard::<String, _>(formats::Unicode) else { continue };
            let Ok(mut items) = state.items.lock() else { continue };
            if push(&mut items, text, now_ms()).is_some() {
                state.save(&items);
                drop(items);
                let _ = app.emit("clipboard-changed", ());
            }
        }
    });
}

#[cfg(not(windows))]
pub fn spawn(_app: AppHandle) {}

fn enabled(app: &AppHandle) -> bool {
    app.try_state::<crate::settings::SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|c| c.clone().unwrap_or_default().clipboard_enabled))
        .unwrap_or(true)
}

fn modify(
    app: &AppHandle,
    state: &ClipState,
    f: impl FnOnce(&mut Vec<ClipItem>),
) -> Result<(), String> {
    let mut items = state.items.lock().map_err(|e| e.to_string())?;
    f(&mut items);
    state.save(&items);
    drop(items);
    let _ = app.emit("clipboard-changed", ());
    Ok(())
}

#[tauri::command]
pub fn clipboard_history(state: State<ClipState>) -> Result<Vec<ClipItem>, String> {
    Ok(state.items.lock().map_err(|e| e.to_string())?.clone())
}

/// 항목을 다시 클립보드에 올린다 (다른 앱에서 Ctrl+V)
#[tauri::command]
pub fn clipboard_copy(app: AppHandle, state: State<ClipState>, id: String) -> Result<(), String> {
    let text = {
        let items = state.items.lock().map_err(|e| e.to_string())?;
        items.iter().find(|i| i.id == id).map(|i| i.text.clone())
    }
    .ok_or("항목이 없습니다")?;
    #[cfg(windows)]
    {
        state.skip_next.store(true, Ordering::SeqCst);
        clipboard_win::set_clipboard(clipboard_win::formats::Unicode, &text)
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    let _ = (&app, text);
    // 복사한 항목은 최근으로 올린다
    modify(&app, &state, |items| {
        if let Some(pos) = items.iter().position(|i| i.id == id) {
            let mut it = items.remove(pos);
            it.copied_at = now_ms();
            items.insert(0, it);
        }
    })
}

#[tauri::command]
pub fn clipboard_pin(
    app: AppHandle,
    state: State<ClipState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    modify(&app, &state, |items| {
        if let Some(it) = items.iter_mut().find(|i| i.id == id) {
            it.pinned = pinned;
        }
    })
}

#[tauri::command]
pub fn clipboard_remove(app: AppHandle, state: State<ClipState>, id: String) -> Result<(), String> {
    modify(&app, &state, |items| items.retain(|i| i.id != id))
}

/// 고정하지 않은 항목 전체 삭제
#[tauri::command]
pub fn clipboard_clear(app: AppHandle, state: State<ClipState>) -> Result<(), String> {
    modify(&app, &state, |items| items.retain(|i| i.pinned))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(items: &[ClipItem]) -> Vec<&str> {
        items.iter().map(|i| i.text.as_str()).collect()
    }

    #[test]
    fn push_moves_duplicates_to_front_and_counts() {
        let mut items = Vec::new();
        push(&mut items, "a".into(), 1);
        push(&mut items, "b".into(), 2);
        push(&mut items, "a".into(), 3);
        assert_eq!(texts(&items), ["a", "b"]);
        assert_eq!(items[0].count, 2);
        assert_eq!(items[0].copied_at, 3);
    }

    #[test]
    fn push_ignores_blank_and_huge() {
        let mut items = Vec::new();
        assert!(push(&mut items, "   \n".into(), 1).is_none());
        assert!(push(&mut items, "x".repeat(MAX_TEXT + 1), 1).is_none());
        assert!(items.is_empty());
    }

    #[test]
    fn cap_keeps_pinned() {
        let mut items = Vec::new();
        push(&mut items, "pinned".into(), 0);
        items[0].pinned = true;
        for i in 0..(MAX_ITEMS + 10) {
            push(&mut items, format!("t{i}"), i as u64 + 1);
        }
        assert_eq!(items.len(), MAX_ITEMS);
        assert!(items.iter().any(|i| i.text == "pinned"));
        assert_eq!(items[0].text, format!("t{}", MAX_ITEMS + 9)); // 최신이 맨 앞
    }
}
