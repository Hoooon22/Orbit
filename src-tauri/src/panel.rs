//! 펫 옆 패널 창. 펫을 클릭하면 펫 옆에 뜨고, 다른 곳을 클릭하면(포커스를 잃으면) 사라진다.
//! WorkPet의 panel과 같은 자리 규칙: 펫 오른쪽에 붙이되 자리가 없으면 왼쪽, 아래 변은 펫과 맞춤.
//! 큰 Orbit 창(dashboard)은 그대로 있고, 패널 머리의 "Orbit 열기"로 간다.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition};

use crate::orb::ORB;

pub const PANEL: &str = "panel";
/// 논리 px. tauri.conf.json의 panel 창 크기와 같아야 한다.
const SIZE: (f64, f64) = (380.0, 540.0);
const GAP: f64 = 8.0; // 펫과 패널 사이
/// 펫을 눌러 패널을 닫을 때: 펫 창이 포커스를 가져가 패널이 먼저 숨고, 이어서 클릭의 toggle이 온다.
/// 그 toggle이 패널을 다시 열지 않도록 방금 숨었으면 무시한다.
const REOPEN_GUARD: Duration = Duration::from_millis(300);

#[derive(Default)]
pub struct PanelState {
    hidden_at: Mutex<Option<Instant>>,
}

/// 펫 창을 기준으로 패널의 왼쪽 위(물리). 오른쪽에 자리가 없으면 왼쪽, 작업 영역 안으로 자른다.
fn anchor(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let orb = app.get_webview_window(ORB)?;
    let pos = orb.outer_position().ok()?;
    let size = orb.outer_size().ok()?;
    let scale = orb.scale_factor().unwrap_or(1.0);
    let (cx, cy) = (pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2);
    let m = app
        .monitor_from_point(cx as f64, cy as f64)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let r = m.work_area();
    let (pw, ph) = ((SIZE.0 * scale).round() as i32, (SIZE.1 * scale).round() as i32);
    let gap = (GAP * scale).round() as i32;
    let right = r.position.x + r.size.width as i32;
    let want = pos.x + size.width as i32 + gap;
    let x = if want + pw <= right { want } else { pos.x - pw - gap };
    let y = pos.y + size.height as i32 - ph;
    Some(PhysicalPosition::new(
        x.clamp(r.position.x, (right - pw).max(r.position.x)),
        y.clamp(r.position.y, (r.position.y + r.size.height as i32 - ph).max(r.position.y)),
    ))
}

fn notify(app: &AppHandle, open: bool) {
    let _ = app.emit_to(ORB, "panel-changed", open); // 펫은 패널이 열려 있는 동안 걷지 않는다
}

/// 펫 옆에 패널을 띄우고 포커스를 준다
#[tauri::command]
pub fn open_panel(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview_window(PANEL).ok_or("패널 창이 없습니다")?;
    if let Some(p) = anchor(&app) {
        let _ = w.set_position(p);
    }
    w.show().map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    notify(&app, true);
    Ok(())
}

/// 포커스를 잃었을 때(다른 창 클릭)와 패널 안의 닫기 버튼
pub fn hide(app: &AppHandle) {
    let Some(w) = app.get_webview_window(PANEL) else { return };
    if !w.is_visible().unwrap_or(false) {
        return;
    }
    let _ = w.hide();
    if let Some(s) = app.try_state::<PanelState>() {
        if let Ok(mut t) = s.hidden_at.lock() {
            *t = Some(Instant::now());
        }
    }
    notify(app, false);
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) {
    hide(&app);
}

/// 펫 클릭: 열려 있으면 닫고, 아니면 연다 (방금 포커스를 잃어 닫힌 직후면 그대로 둔다)
#[tauri::command]
pub fn toggle_panel(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview_window(PANEL).ok_or("패널 창이 없습니다")?;
    if w.is_visible().unwrap_or(false) {
        hide(&app);
        return Ok(());
    }
    let just_hidden = app
        .try_state::<PanelState>()
        .and_then(|s| s.hidden_at.lock().ok().and_then(|t| *t))
        .map(|t| t.elapsed() < REOPEN_GUARD)
        .unwrap_or(false);
    if just_hidden {
        return Ok(());
    }
    open_panel(app)
}
