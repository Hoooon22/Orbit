//! 퀵 런처. 시작 메뉴의 바로가기(.lnk/.url)를 색인하고, 사용자가 더한 항목(경로·URL·폴더)과 함께
//! 이름으로 찾아 실행한다. 실행은 opener 플러그인(ShellExecute)에 맡겨 바로가기의 인자·작업 폴더도 그대로 쓴다.
//! 색인·사용 기록은 기기 종속이라 로컬 데이터 폴더에 둔다.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use crate::store::save_atomic;

const FILE: &str = "launcher.json";
const RESCAN_AFTER_MS: u64 = 10 * 60_000;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LaunchKind {
    App,
    Url,
    Folder,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LaunchItem {
    pub id: String,
    pub name: String,
    pub target: String, // .lnk 경로, 실행 파일, 폴더, URL
    pub kind: LaunchKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>, // 시작 메뉴의 상위 폴더명 등
    #[serde(default)]
    pub custom: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub count: u32,
    pub last_used: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct LauncherFile {
    #[serde(default)]
    custom: Vec<LaunchItem>,
    #[serde(default)]
    usage: HashMap<String, Usage>,
}

pub struct LauncherState {
    index: Mutex<Vec<LaunchItem>>, // 시작 메뉴 스캔 결과 (메모리 캐시)
    file: Mutex<LauncherFile>,
    path: PathBuf,
    scanned_at: Mutex<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherData {
    items: Vec<LaunchItem>,
    usage: HashMap<String, Usage>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn hash_id(s: &str) -> String {
    let mut h = DefaultHasher::new();
    s.to_lowercase().hash(&mut h);
    format!("{:016x}", h.finish())
}

/// 순수 함수: 대상 문자열로 종류 추정
fn infer_kind(target: &str) -> LaunchKind {
    let t = target.trim().to_lowercase();
    if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("mailto:") {
        LaunchKind::Url
    } else if Path::new(target).is_dir() {
        LaunchKind::Folder
    } else {
        LaunchKind::App
    }
}

fn start_menu_dirs() -> Vec<PathBuf> {
    ["ProgramData", "APPDATA"]
        .iter()
        .filter_map(|v| std::env::var_os(v))
        .map(|base| PathBuf::from(base).join("Microsoft\\Windows\\Start Menu\\Programs"))
        .filter(|p| p.is_dir())
        .collect()
}

/// 바로가기 재귀 수집. 제거 프로그램 바로가기는 뺀다.
fn scan_dir(dir: &Path, hint: Option<&str>, out: &mut Vec<LaunchItem>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().into_owned();
            scan_dir(&path, Some(&name), out);
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase());
        if !matches!(ext.as_deref(), Some("lnk") | Some("url")) {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let lower = stem.to_lowercase();
        if lower.starts_with("uninstall") || lower.starts_with("제거") || lower.contains("uninstall ") {
            continue;
        }
        let target = path.to_string_lossy().into_owned();
        out.push(LaunchItem {
            id: hash_id(&target),
            name: stem.to_string(),
            target,
            kind: if ext.as_deref() == Some("url") { LaunchKind::Url } else { LaunchKind::App },
            hint: hint.map(str::to_string),
            custom: false,
        });
    }
}

fn scan_all() -> Vec<LaunchItem> {
    let mut out = Vec::new();
    for dir in start_menu_dirs() {
        scan_dir(&dir, None, &mut out);
    }
    // 같은 이름이 양쪽(전체·사용자)에 있으면 하나만
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    out
}

impl LauncherState {
    pub fn load(local: &Path) -> Self {
        let path = local.join(FILE);
        let file = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self {
            index: Mutex::new(Vec::new()),
            file: Mutex::new(file),
            path,
            scanned_at: Mutex::new(0),
        }
    }

    fn save(&self, file: &LauncherFile) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = save_atomic(&self.path, file);
    }

    /// 오래됐으면 다시 스캔. 수백 개 파일이라 수십 ms.
    fn ensure_scanned(&self, force: bool) -> Result<usize, String> {
        let mut at = self.scanned_at.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        if force || *at == 0 || now - *at > RESCAN_AFTER_MS {
            let items = scan_all();
            let n = items.len();
            *self.index.lock().map_err(|e| e.to_string())? = items;
            *at = now;
            return Ok(n);
        }
        Ok(self.index.lock().map_err(|e| e.to_string())?.len())
    }
}

/// 시작할 때 미리 스캔해 두면 첫 검색이 바로 뜬다
pub fn warm_up(state: &LauncherState) {
    let _ = state.ensure_scanned(true);
}

#[tauri::command]
pub fn launcher_items(state: State<LauncherState>) -> Result<LauncherData, String> {
    state.ensure_scanned(false)?;
    let index = state.index.lock().map_err(|e| e.to_string())?;
    let file = state.file.lock().map_err(|e| e.to_string())?;
    let mut items = file.custom.clone();
    items.extend(index.iter().cloned());
    Ok(LauncherData { items, usage: file.usage.clone() })
}

#[tauri::command]
pub fn launcher_rescan(state: State<LauncherState>) -> Result<usize, String> {
    state.ensure_scanned(true)
}

/// 실행하고 사용 기록을 남긴다 (최근·자주 쓴 것이 검색 상위로)
#[tauri::command]
pub fn launch(app: AppHandle, state: State<LauncherState>, id: String) -> Result<(), String> {
    let target = {
        let file = state.file.lock().map_err(|e| e.to_string())?;
        let index = state.index.lock().map_err(|e| e.to_string())?;
        file.custom
            .iter()
            .chain(index.iter())
            .find(|i| i.id == id)
            .map(|i| i.target.clone())
    }
    .ok_or("항목을 찾지 못했습니다")?;
    app.opener()
        .open_path(&target, None::<&str>)
        .map_err(|e| e.to_string())?;
    let mut file = state.file.lock().map_err(|e| e.to_string())?;
    let u = file.usage.entry(id).or_default();
    u.count += 1;
    u.last_used = now_ms();
    state.save(&file);
    Ok(())
}

#[tauri::command]
pub fn launcher_add_custom(
    app: AppHandle,
    state: State<LauncherState>,
    name: String,
    target: String,
) -> Result<LaunchItem, String> {
    let name = name.trim().to_string();
    let target = target.trim().to_string();
    if name.is_empty() || target.is_empty() {
        return Err("이름과 대상을 모두 적어 주세요".into());
    }
    let item = LaunchItem {
        id: hash_id(&format!("custom:{target}")),
        kind: infer_kind(&target),
        name,
        target,
        hint: Some("직접 추가".into()),
        custom: true,
    };
    let mut file = state.file.lock().map_err(|e| e.to_string())?;
    file.custom.retain(|i| i.id != item.id);
    file.custom.push(item.clone());
    state.save(&file);
    let _ = app.emit("launcher-changed", ());
    Ok(item)
}

#[tauri::command]
pub fn launcher_remove_custom(
    app: AppHandle,
    state: State<LauncherState>,
    id: String,
) -> Result<(), String> {
    let mut file = state.file.lock().map_err(|e| e.to_string())?;
    file.custom.retain(|i| i.id != id);
    file.usage.remove(&id);
    state.save(&file);
    let _ = app.emit("launcher-changed", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn infer_kind_by_target() {
        assert_eq!(infer_kind("https://example.com"), LaunchKind::Url);
        assert_eq!(infer_kind("mailto:a@b.c"), LaunchKind::Url);
        assert_eq!(infer_kind(&std::env::temp_dir().to_string_lossy()), LaunchKind::Folder);
        assert_eq!(infer_kind("C:\\nope\\app.exe"), LaunchKind::App);
    }

    #[test]
    fn scan_dir_collects_shortcuts_and_skips_uninstallers() {
        let dir = std::env::temp_dir().join("orbit-test-launcher");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Tools")).unwrap();
        std::fs::write(dir.join("Chrome.lnk"), "").unwrap();
        std::fs::write(dir.join("Uninstall Chrome.lnk"), "").unwrap();
        std::fs::write(dir.join("Tools").join("Site.url"), "").unwrap();
        std::fs::write(dir.join("readme.txt"), "").unwrap();

        let mut out = Vec::new();
        scan_dir(&dir, None, &mut out);
        let mut names: Vec<&str> = out.iter().map(|i| i.name.as_str()).collect();
        names.sort();
        assert_eq!(names, ["Chrome", "Site"]);
        let site = out.iter().find(|i| i.name == "Site").unwrap();
        assert_eq!(site.kind, LaunchKind::Url);
        assert_eq!(site.hint.as_deref(), Some("Tools"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn usage_round_trips_through_file() {
        let dir = std::env::temp_dir().join("orbit-test-launcher-usage");
        let _ = std::fs::remove_dir_all(&dir);
        let state = LauncherState::load(&dir);
        {
            let mut f = state.file.lock().unwrap();
            f.usage.insert("x".into(), Usage { count: 3, last_used: 42 });
            state.save(&f);
        }
        let again = LauncherState::load(&dir);
        let f = again.file.lock().unwrap();
        assert_eq!(f.usage["x"].count, 3);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
