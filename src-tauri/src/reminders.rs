//! 할 일 리마인더. Rust 스레드가 1분마다 .todos.json을 읽어 알림 시각(remindAt)이 지난 항목에
//! Windows 토스트를 띄운다. 웹뷰 타이머는 창이 숨겨지면 느려지고 창이 둘이면 두 번 울리므로
//! 여기서만 발송한다.
//!
//! 중복 발송을 막는 원장(id → remindAt)은 할 일 파일이 아니라 로컬 데이터 폴더에 따로 둔다.
//! 할 일 파일은 프런트가 쓰므로 여기서 같이 쓰면 서로 덮어쓰게 되고, 원장이 따로 있으면
//! 사용자가 remindAt을 바꾸는(스누즈·시각 변경) 순간 원장과 어긋나 자연히 다시 발송 대상이 된다.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::notes::NotesRoot;

const LEDGER: &str = "reminded.json";
/// 이보다 오래 지난 알림은 "놓친 알림"으로 묶어 하나만 띄운다 (앱이 꺼져 있던 동안 쌓인 것들)
const MISSED_AFTER_MS: u64 = 5 * 60_000;

/// 기기 종속·비동기화 데이터 폴더 (%LOCALAPPDATA%\com.kwonkim.orbit)
pub struct LocalDir(pub PathBuf);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Fired {
    pub id: String,
    pub text: String,
    pub remind_at: u64,
    pub missed: bool,
}

pub struct ReminderState {
    ledger: Mutex<HashMap<String, u64>>,
    /// 울렸지만 아직 사용자가 닫지 않은 알림. 창이 나중에 떠도 보여줄 수 있게 들고 있는다.
    pending: Mutex<Vec<Fired>>,
    /// 트레이 "알림 일시중지". 이 세션에서만 유효하고 저장하지 않는다 (재시작 뒤에도 꺼진 알림은 함정).
    pub paused: AtomicBool,
}

impl ReminderState {
    pub fn load(local: &Path) -> Self {
        let ledger = std::fs::read_to_string(local.join(LEDGER))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self { ledger: Mutex::new(ledger), pending: Mutex::new(Vec::new()), paused: AtomicBool::new(false) }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 순수 함수: 울려야 할 항목. 완료·알림 없음·원장과 일치(이미 울림)는 제외.
fn due(todos: &[Value], ledger: &HashMap<String, u64>, now: u64) -> Vec<Fired> {
    todos
        .iter()
        .filter_map(|t| {
            let id = t.get("id")?.as_str()?;
            if t.get("done").and_then(Value::as_bool).unwrap_or(false) {
                return None;
            }
            let at = t.get("remindAt")?.as_u64()?;
            if at > now || ledger.get(id) == Some(&at) {
                return None;
            }
            Some(Fired {
                id: id.into(),
                text: t.get("text").and_then(Value::as_str).unwrap_or("").into(),
                remind_at: at,
                missed: now - at > MISSED_AFTER_MS,
            })
        })
        .collect()
}

/// 순수 함수: 삭제된 할 일의 원장 항목 정리. 지운 게 있으면 true.
fn prune(ledger: &mut HashMap<String, u64>, todos: &[Value]) -> bool {
    let ids: HashSet<&str> = todos.iter().filter_map(|t| t.get("id")?.as_str()).collect();
    let before = ledger.len();
    ledger.retain(|id, _| ids.contains(id.as_str()));
    ledger.len() != before
}

fn time_label(ms: u64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_millis_opt(ms as i64)
        .single()
        .map(|t| t.format("%H:%M").to_string())
        .unwrap_or_default()
}

fn notify(app: &AppHandle, fired: &[Fired]) {
    let (missed, fresh): (Vec<&Fired>, Vec<&Fired>) = fired.iter().partition(|f| f.missed);
    for f in fresh {
        let _ = app
            .notification()
            .builder()
            .title(&f.text)
            .body(format!("{} 알림", time_label(f.remind_at)))
            .show();
    }
    match missed.len() {
        0 => {}
        1 => {
            let f = missed[0];
            let _ = app
                .notification()
                .builder()
                .title(format!("놓친 알림: {}", f.text))
                .body(format!("{} 예정이었습니다", time_label(f.remind_at)))
                .show();
        }
        n => {
            let body: Vec<String> = missed
                .iter()
                .take(5)
                .map(|f| format!("{} {}", time_label(f.remind_at), f.text))
                .collect();
            let _ = app
                .notification()
                .builder()
                .title(format!("놓친 알림 {n}개"))
                .body(body.join("\n"))
                .show();
        }
    }
}

/// 오브가 화면에 있으면 오브 옆 말풍선이 알림을 맡고, 숨겨져 있을 때만 Windows 토스트를 띄운다
fn orb_shown(app: &AppHandle) -> bool {
    app.get_webview_window(crate::orb::ORB)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// 한 번 검사: 울릴 것 찾기 → 토스트(오브 숨김일 때) → 원장 갱신·저장 → 창들에 알림
pub fn tick(app: &AppHandle) {
    let (Some(root), Some(local), Some(state)) = (
        app.try_state::<NotesRoot>(),
        app.try_state::<LocalDir>(),
        app.try_state::<ReminderState>(),
    ) else {
        return;
    };
    // 일시중지·회의 중에는 검사 자체를 건너뛴다. 원장에 적지 않으므로 미룬 알림은 풀리는 다음 틱에
    // 그대로 잡히고, 5분 넘게 미뤄졌으면 "놓친 알림"으로 묶인다. 따로 보관할 상태가 없다.
    if state.paused.load(Ordering::Relaxed) || crate::meeting::is_active(app) {
        return;
    }
    let todos = crate::store::load_list(&root.0, "todos").unwrap_or_default();
    let now = now_ms();
    let fired = {
        let Ok(mut ledger) = state.ledger.lock() else { return };
        let fired = due(&todos, &ledger, now);
        let pruned = prune(&mut ledger, &todos);
        for f in &fired {
            ledger.insert(f.id.clone(), f.remind_at);
        }
        if pruned || !fired.is_empty() {
            let _ = std::fs::create_dir_all(&local.0);
            let _ = crate::store::save_atomic(&local.0.join(LEDGER), &*ledger);
        }
        fired
    };
    if fired.is_empty() {
        return;
    }
    if !orb_shown(app) {
        notify(app, &fired);
    }
    if let Ok(mut pending) = state.pending.lock() {
        for f in &fired {
            pending.retain(|p| p.id != f.id);
            pending.push(f.clone());
        }
    }
    let _ = app.emit("reminders-fired", &fired);
}

/// 시작 직후 한 번(놓친 알림 처리), 이후 매 분 경계마다 검사.
/// 회의 판정을 먼저 갱신해, 회의가 끝난 바로 그 틱에 미뤄 둔 알림이 나간다.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        loop {
            crate::meeting::refresh(&app);
            tick(&app);
            let secs = (now_ms() / 1000) % 60;
            std::thread::sleep(Duration::from_secs(60 - secs));
        }
    });
}

/// 창이 뜰 때 호출: 아직 닫지 않은 알림 목록
#[tauri::command]
pub fn check_reminders(state: State<ReminderState>) -> Vec<Fired> {
    state.pending.lock().map(|p| p.clone()).unwrap_or_default()
}

/// 알림을 닫는다 (완료·스누즈·닫기 공통). 다른 창에도 알린다.
#[tauri::command]
pub fn dismiss_reminder(app: AppHandle, state: State<ReminderState>, id: String) {
    if let Ok(mut p) = state.pending.lock() {
        p.retain(|f| f.id != id);
    }
    let _ = app.emit("reminder-dismissed", id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const NOW: u64 = 1_800_000_000_000;

    fn todo(id: &str, remind_at: Option<u64>, done: bool) -> Value {
        let mut v = json!({"id": id, "text": format!("할 일 {id}"), "done": done});
        if let Some(at) = remind_at {
            v["remindAt"] = json!(at);
        }
        v
    }

    #[test]
    fn fires_past_and_skips_future_done_and_ledger() {
        let todos = vec![
            todo("past", Some(NOW - 1000), false),
            todo("future", Some(NOW + 60_000), false),
            todo("done", Some(NOW - 1000), true),
            todo("already", Some(NOW - 1000), false),
            todo("none", None, false),
        ];
        let ledger = HashMap::from([("already".to_string(), NOW - 1000)]);
        let fired = due(&todos, &ledger, NOW);
        assert_eq!(fired.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), ["past"]);
        assert!(!fired[0].missed);
    }

    #[test]
    fn changed_remind_at_fires_again_and_old_is_missed() {
        // 원장에는 예전 시각이 있고 할 일은 새 시각(스누즈)으로 바뀐 경우 → 다시 울린다
        let todos = vec![todo("a", Some(NOW - 10 * 60_000), false)];
        let ledger = HashMap::from([("a".to_string(), NOW - 30 * 60_000)]);
        let fired = due(&todos, &ledger, NOW);
        assert_eq!(fired.len(), 1);
        assert!(fired[0].missed); // 10분 지남 → 놓친 알림
    }

    #[test]
    fn prune_drops_deleted_todos() {
        let todos = vec![todo("keep", Some(1), false)];
        let mut ledger = HashMap::from([("keep".to_string(), 1), ("gone".to_string(), 2)]);
        assert!(prune(&mut ledger, &todos));
        assert_eq!(ledger.len(), 1);
        assert!(!prune(&mut ledger, &todos));
    }
}
