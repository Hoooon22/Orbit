//! 플로팅 오브 창과 Orbit 대시보드 창.
//! 오브는 화면 구석의 작은 구슬(72px)이고, 클릭하면 별도의 대시보드 창을 열고 닫는다.

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

use crate::settings::Settings;

pub const ORB: &str = "orb";
pub const DASHBOARD: &str = "dashboard"; // Orbit 창 (메모·할 일·캘린더·클립보드·런처·설정)

/// 논리 픽셀. 오브(56) + 그림자 여백.
const ORB_SIZE: (f64, f64) = (72.0, 72.0);
const MARGIN: f64 = 16.0; // 첫 실행 때 화면 오른쪽 아래에서 띄우는 간격

fn physical(logical: (f64, f64), scale: f64) -> (i32, i32) {
    ((logical.0 * scale).round() as i32, (logical.1 * scale).round() as i32)
}

/// tao는 프레임 없는 창에도 WS_CAPTION | WS_SYSMENU를 붙여 두는데(그림자·스냅 호환용),
/// 그러면 Windows가 캡션 버튼이 들어갈 최소 너비(약 136px)를 강제해 72px 오브가 되지 않는다.
/// 두 스타일을 떼어낸다. tao가 표시/숨김 등 상태가 바뀔 때 스타일을 다시 계산하므로
/// 창을 만질 때마다 다시 호출한다.
#[cfg(windows)]
fn strip_caption(window: &WebviewWindow) -> Result<(), String> {
    strip_caption_hwnd(window.hwnd().map_err(|e| e.to_string())?)
}

/// 어떤 창 이벤트든 오브 창에서 오면 캡션이 되살아났는지 확인해 떼어낸다.
/// (tao는 표시·포커스 등 상태가 바뀔 때 스타일을 다시 계산해 캡션을 붙이고, 그러면 창 제목이 그려진다)
pub fn ensure_stripped(window: &tauri::Window) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        let _ = strip_caption_hwnd(hwnd);
    }
    #[cfg(not(windows))]
    let _ = window;
}

#[cfg(windows)]
fn strip_caption_hwnd(hwnd: windows::Win32::Foundation::HWND) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_SYSMENU,
    };
    use windows::Win32::Graphics::Gdi::{
        RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
    };
    let unwanted = (WS_CAPTION.0 | WS_SYSMENU.0) as isize;
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        if style & unwanted != 0 {
            SetWindowLongPtrW(hwnd, GWL_STYLE, style & !unwanted);
            SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
            )
            .map_err(|e| e.to_string())?;
            // 스타일만 바꾸면 Windows가 예전 제목 표시줄 그림을 캐시한 채 계속 보여 준다.
            // 프레임까지 다시 그리게 해야 "Orbit Orb" 글자가 사라진다.
            let _ = RedrawWindow(
                Some(hwnd),
                None,
                None,
                RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN | RDW_UPDATENOW,
            );
        }
    }
    Ok(())
}

/// 위치와 크기를 한 번에 바꾼다.
fn set_bounds(window: &WebviewWindow, x: i32, y: i32, w: i32, h: i32) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
        strip_caption(window)?;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        unsafe {
            SetWindowPos(hwnd, None, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        window
            .set_size(tauri::PhysicalSize::new(w as u32, h as u32))
            .and_then(|_| window.set_position(PhysicalPosition::new(x, y)))
            .map_err(|e| e.to_string())
    }
}

/// Orbit 창을 앞으로. view("home"·"calendar@2026-09-08"·"memo@폴더/메모.md" 등)가 있으면 그 화면으로.
#[tauri::command]
pub fn show_dashboard(app: AppHandle, view: Option<String>) {
    if let Some(w) = app.get_webview_window(DASHBOARD) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Some(v) = view {
        let _ = app.emit_to(DASHBOARD, "navigate", v);
    }
}

/// 오브 클릭: 대시보드가 앞에 떠 있으면 숨기고, 아니면 연다
#[tauri::command]
pub fn toggle_dashboard(app: AppHandle) {
    if let Some(w) = app.get_webview_window(DASHBOARD) {
        let up = w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false);
        if up {
            let _ = w.hide();
        } else {
            show_dashboard(app, None);
        }
    }
}

/// 오브 창 표시/숨김. 보인 뒤에는 tao가 되돌려 놓은 캡션 스타일을 다시 떼어 크기가 커지지 않게 한다.
pub fn set_visible(app: &AppHandle, visible: bool) {
    if let Some(w) = app.get_webview_window(ORB) {
        if visible {
            let _ = w.show();
            #[cfg(windows)]
            let _ = strip_caption(&w);
        } else {
            let _ = w.hide();
        }
    }
}

#[tauri::command]
pub fn set_orb_visible(app: AppHandle, visible: bool) {
    set_visible(&app, visible);
}

/// 전역 단축키(Alt+Space): Orbit 창을 최대화해서 앞으로. 닫혀 있었으면 홈의 런처 입력창에 포커스,
/// 이미 떠 있거나 최소화돼 있으면 보던 화면 그대로 (홈으로 튕기지 않는다).
pub fn open_launcher(app: &AppHandle) {
    let shown = app
        .get_webview_window(DASHBOARD)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let view = if shown { None } else { Some("home@launcher".into()) };
    show_dashboard(app.clone(), view);
    if let Some(w) = app.get_webview_window(DASHBOARD) {
        let _ = w.maximize();
    }
}

/// 전역 단축키(Ctrl+Alt+M): Orbit 창의 메모 화면을 빠른 메모로 연다
pub fn open_quick_memo(app: &AppHandle) {
    show_dashboard(app.clone(), Some(format!("memo@{}", crate::notes::QUICK_MEMO)));
}

/// 오브 왼쪽 위 좌표가 어느 모니터의 작업 영역 안에 있는지 (모니터를 떼면 화면 밖에 남을 수 있다)
fn on_some_monitor(app: &AppHandle, x: i32, y: i32, w: i32, h: i32) -> bool {
    app.available_monitors()
        .map(|ms| {
            ms.iter().any(|m| {
                let r = m.work_area();
                let (l, t) = (r.position.x, r.position.y);
                let (rgt, btm) = (l + r.size.width as i32, t + r.size.height as i32);
                // 오브의 절반 이상이 안에 들어오면 보이는 것으로 친다
                x + w / 2 >= l && x + w / 2 <= rgt && y + h / 2 >= t && y + h / 2 <= btm
            })
        })
        .unwrap_or(true)
}

/// 주 모니터 오른쪽 아래 (첫 실행·위치 초기화·화면 밖 복구용)
fn default_position(app: &AppHandle, cw: i32, ch: i32, scale: f64) -> Option<PhysicalPosition<i32>> {
    let m = app.primary_monitor().ok().flatten()?;
    let r = m.work_area();
    let margin = (MARGIN * scale).round() as i32;
    Some(PhysicalPosition::new(
        r.position.x + r.size.width as i32 - cw - margin,
        r.position.y + r.size.height as i32 - ch - margin,
    ))
}

/// 저장된 위치로 놓되, 어느 모니터에도 없으면 주 모니터 오른쪽 아래로.
fn place(app: &AppHandle, w: &WebviewWindow, saved: (Option<i32>, Option<i32>)) {
    #[cfg(windows)]
    let _ = strip_caption(w);
    let scale = w.scale_factor().unwrap_or(1.0);
    let (cw, ch) = physical(ORB_SIZE, scale);
    let pos = match saved {
        (Some(x), Some(y)) if on_some_monitor(app, x, y, cw, ch) => Some(PhysicalPosition::new(x, y)),
        _ => default_position(app, cw, ch, scale),
    };
    if let Some(p) = pos {
        // 창을 만들 때는 캡션 스타일 때문에 너비가 커져 있으므로 크기도 같이 바로잡는다
        let _ = set_bounds(w, p.x, p.y, cw, ch);
    }
}

/// 시작 시: 저장된 위치가 있으면 그리로, 없으면 화면 오른쪽 아래로. 숨김 설정이면 숨긴다.
pub fn place_on_start(app: &AppHandle, settings: &Settings) {
    let Some(w) = app.get_webview_window(ORB) else {
        return;
    };
    place(app, &w, (settings.orb_x, settings.orb_y));
    if !settings.orb_visible {
        let _ = w.hide();
    }
}

/// 설정의 "오브 위치 초기화": 주 모니터 오른쪽 아래로 옮기고 보이게 한다.
#[tauri::command]
pub fn reset_orb_position(app: AppHandle) -> Result<(), String> {
    let w = app.get_webview_window(ORB).ok_or("오브 창이 없습니다")?;
    place(&app, &w, (None, None));
    set_visible(&app, true);
    Ok(())
}
