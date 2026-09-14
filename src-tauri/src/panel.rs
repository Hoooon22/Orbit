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

/// 열자마자 오는 Focused(false)는 무시한다 — 앱이 포그라운드가 아니면 set_focus가 거부되고 그 즉시
/// 포커스 잃음 이벤트가 와서, 패널이 뜨자마자 사라진다.
const BLUR_GUARD: Duration = Duration::from_millis(400);

#[derive(Default)]
pub struct PanelState {
    hidden_at: Mutex<Option<Instant>>,
    shown_at: Mutex<Option<Instant>>,
}

fn since(slot: &Mutex<Option<Instant>>) -> Option<Duration> {
    slot.lock().ok().and_then(|t| *t).map(|t| t.elapsed())
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

/// Windows 11은 최상위 창의 모서리를 둥글게 깎는데, 투명 창 안에 그린 1px 테두리가 모서리에서 잘려 보인다.
/// 패널과 Orbit 창은 각진 카드이므로 깎지 말라고 한다 (DWMWA_WINDOW_CORNER_PREFERENCE = DONOTROUND).
pub fn square_corners(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND};
        let pref = DWMWCP_DONOTROUND;
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &pref as *const _ as *const std::ffi::c_void,
                std::mem::size_of_val(&pref) as u32,
            );
        }
    }
    #[cfg(not(windows))]
    let _ = window;
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
    if let Some(s) = app.try_state::<PanelState>() {
        if let Ok(mut t) = s.shown_at.lock() {
            *t = Some(Instant::now());
        }
    }
    w.show().map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    notify(&app, true);
    Ok(())
}

/// 포커스를 잃었을 때 (다른 창 클릭). 열린 직후거나, 포커스가 우리 앱의 다른 창(펫 등)으로 간 것이면 무시
pub fn on_blur(app: &AppHandle) {
    let just_shown = app
        .try_state::<PanelState>()
        .and_then(|s| since(&s.shown_at))
        .map(|d| d < BLUR_GUARD)
        .unwrap_or(false);
    if !just_shown && !foreground_is_ours() {
        hide(app);
    }
}

/// 지금 포그라운드 창이 이 프로세스의 창인지 (펫 클릭 뒤 WebView2가 포커스를 잠깐 가져가는 경우)
fn foreground_is_ours() -> bool {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
        let fg = GetForegroundWindow();
        if fg.0.is_null() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, Some(&mut pid));
        pid == std::process::id()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// 패널 안의 닫기 버튼·Esc·펫 다시 클릭
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
        .and_then(|s| since(&s.hidden_at))
        .map(|d| d < REOPEN_GUARD)
        .unwrap_or(false);
    if just_hidden {
        return Ok(());
    }
    open_panel(app)
}
