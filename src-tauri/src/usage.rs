//! 앱 사용 시간 통계. 5초마다 포그라운드 창의 실행 파일 이름을 보고 그 앱에 시간을 더한다.
//! 자리 비움(idle.rs) 중에는 앱 대신 `idle`에 더해 "실제로 쓴 시간"만 남긴다.
//! 파일은 클립보드처럼 로컬 데이터 폴더(%LOCALAPPDATA%)에 둔다 — 기기 종속이고 동기화할 이유가 없다.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::idle;
use crate::store::save_atomic;

const FILE: &str = "usage.json";
const TICK: Duration = Duration::from_secs(5);
/// 절전·정지 뒤 첫 틱은 이만큼만 인정한다 (자는 동안 시간이 한 앱에 몰리지 않게)
const MAX_GAP_SECS: u64 = 15;
const PERSIST_EVERY_SECS: u64 = 60;
const KEEP_DAYS: usize = 30;

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub date: String, // YYYY-MM-DD (로컬)
    pub apps: BTreeMap<String, u64>, // 실행 파일 이름(소문자, 확장자 없음) → 초
    pub idle: u64, // 자리 비움 초
}

pub struct UsageState {
    days: Mutex<Vec<DayUsage>>, // 날짜 오름차순, 마지막이 오늘
    path: PathBuf,
    last_tick: Mutex<Option<u64>>, // epoch ms
    was_idle: AtomicBool,
    last_saved: AtomicU64, // epoch ms
}

impl UsageState {
    pub fn load(local: &Path) -> Self {
        let path = local.join(FILE);
        let days = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self {
            days: Mutex::new(days),
            path,
            last_tick: Mutex::new(None),
            was_idle: AtomicBool::new(false),
            last_saved: AtomicU64::new(0),
        }
    }

    fn save(&self, days: &[DayUsage]) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = save_atomic(&self.path, &days);
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 포그라운드 창을 가진 프로세스의 실행 파일 이름 (소문자, 확장자 없음)
#[cfg(windows)]
fn foreground_app() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        ok.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        Path::new(&path)
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
    }
}

#[cfg(not(windows))]
fn foreground_app() -> Option<String> {
    None
}

/// 자기 자신(orbit)은 세지 않는다
fn self_name() -> &'static str {
    static NAME: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    NAME.get_or_init(|| {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_lowercase()))
            .unwrap_or_else(|| "orbit".into())
    })
}

/// 순수 함수: date 항목을 찾거나 만들어 elapsed를 더한다. 자리 비움이면 idle에, 아니면 app에.
/// app이 None(포그라운드 없음·자기 자신)이면 어디에도 더하지 않는다. 보관 일수를 넘으면 앞에서 지운다.
pub fn accumulate(days: &mut Vec<DayUsage>, date: &str, app: Option<&str>, elapsed: u64, is_idle: bool) {
    if elapsed == 0 {
        return;
    }
    if days.last().map(|d| d.date.as_str()) != Some(date) {
        days.push(DayUsage { date: date.to_string(), ..Default::default() });
    }
    let day = days.last_mut().expect("just pushed");
    if is_idle {
        day.idle += elapsed;
    } else if let Some(app) = app {
        *day.apps.entry(app.to_string()).or_insert(0) += elapsed;
    }
    while days.len() > KEEP_DAYS {
        days.remove(0);
    }
}

fn usage_enabled(app: &AppHandle) -> bool {
    app.try_state::<crate::settings::SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|c| c.clone().unwrap_or_default().usage_enabled))
        .unwrap_or(true)
}

/// 한 번 검사: 자리 비움 전이 알림 → 포그라운드 앱에 시간 더하기 → 창들에 알림 → 주기적으로 저장
pub fn tick(app: &AppHandle) {
    let Some(state) = app.try_state::<UsageState>() else { return };
    let now = now_ms();
    let elapsed = {
        let Ok(mut last) = state.last_tick.lock() else { return };
        let e = last.map(|l| now.saturating_sub(l) / 1000).unwrap_or(0).min(MAX_GAP_SECS);
        *last = Some(now);
        e
    };
    let secs = idle::seconds();
    let was = state.was_idle.load(Ordering::Relaxed);
    if let Some(idle_now) = idle::transition(was, secs) {
        state.was_idle.store(idle_now, Ordering::Relaxed);
        let _ = app.emit("idle-changed", idle::IdleChange { idle: idle_now, seconds: secs });
    }
    if !usage_enabled(app) {
        return;
    }
    let is_idle = state.was_idle.load(Ordering::Relaxed);
    let fg = foreground_app().filter(|n| n != self_name());
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let Ok(mut days) = state.days.lock() else { return };
    accumulate(&mut days, &date, fg.as_deref(), elapsed, is_idle);
    let _ = app.emit("usage-changed", ());
    if now.saturating_sub(state.last_saved.load(Ordering::Relaxed)) >= PERSIST_EVERY_SECS * 1000 {
        state.save(&days);
        state.last_saved.store(now, Ordering::Relaxed);
    }
}

/// 5초 뒤부터 5초마다
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        tick(&app);
    });
}

/// 종료 직전: 아직 저장하지 않은 분을 기록
pub fn flush(app: &AppHandle) {
    if let Some(state) = app.try_state::<UsageState>() {
        if let Ok(days) = state.days.lock() {
            state.save(&days);
        }
    }
}

/// 보관 중인 전체(≤30일). 날짜 오름차순.
#[tauri::command]
pub fn usage_history(state: State<UsageState>) -> Result<Vec<DayUsage>, String> {
    state.days.lock().map(|d| d.clone()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_day_and_adds_to_app() {
        let mut days = Vec::new();
        accumulate(&mut days, "2026-09-14", Some("code"), 5, false);
        accumulate(&mut days, "2026-09-14", Some("code"), 5, false);
        accumulate(&mut days, "2026-09-14", Some("chrome"), 5, false);
        assert_eq!(days.len(), 1);
        assert_eq!(days[0].apps["code"], 10);
        assert_eq!(days[0].apps["chrome"], 5);
        assert_eq!(days[0].idle, 0);
    }

    #[test]
    fn idle_goes_to_idle_not_app() {
        let mut days = Vec::new();
        accumulate(&mut days, "2026-09-14", Some("code"), 5, true);
        assert!(days[0].apps.is_empty());
        assert_eq!(days[0].idle, 5);
    }

    #[test]
    fn no_app_adds_nothing_but_keeps_day() {
        let mut days = Vec::new();
        accumulate(&mut days, "2026-09-14", None, 5, false);
        accumulate(&mut days, "2026-09-14", Some("x"), 0, false);
        assert_eq!(days.len(), 1);
        assert!(days[0].apps.is_empty());
    }

    #[test]
    fn new_date_appends_and_old_days_are_dropped() {
        let mut days = Vec::new();
        for i in 1..=(KEEP_DAYS as u32 + 1) {
            accumulate(&mut days, &format!("2026-01-{i:02}"), Some("a"), 1, false);
        }
        assert_eq!(days.len(), KEEP_DAYS);
        assert_eq!(days[0].date, "2026-01-02");
        assert_eq!(days.last().unwrap().date, format!("2026-01-{:02}", KEEP_DAYS + 1));
    }
}
