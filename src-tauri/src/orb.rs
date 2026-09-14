//! 플로팅 오브(펫) 창과 Orbit 대시보드 창.
//! 오브는 화면 작업 영역의 바닥을 걸어 다니는 작은 캐릭터고, 클릭하면 별도의 대시보드 창을 열고 닫는다.
//! 걷기·낙하·던지기 같은 이동은 프론트(petLoop.ts)가 setPosition으로 하고, 여기는 창 크기·바닥 배치·
//! 말풍선용 넓히기처럼 창 스타일을 건드려야 하는 것만 맡는다.

use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::settings::Settings;

pub const ORB: &str = "orb";
pub const DASHBOARD: &str = "dashboard"; // Orbit 창 (메모·할 일·캘린더·클립보드·런처·설정)

const MARGIN: f64 = 16.0; // 첫 실행 때 화면 오른쪽 끝에서 띄우는 간격
/// 말풍선 폭(논리). 알림이 오면 오브 창을 이만큼 넓혀 옆에 말풍선을 그린다.
const BUBBLE_W: f64 = 232.0;

/// 펫 크기 설정 → 창 논리 크기. 스프라이트(viewBox 240×340)를 높이에 맞추고
/// drop-shadow 여백(좌우 6, 아래 8)을 더한다. 프론트 pet/catalog.ts의 boxFor와 같은 식이어야 한다.
pub fn pet_box(size: &str) -> (f64, f64) {
    let h: f64 = match size {
        "small" => 80.0,
        "large" => 160.0,
        _ => 120.0,
    };
    ((h * 240.0 / 340.0).round() + 12.0, h + 8.0)
}

/// 작업 영역(작업 표시줄 제외) 바닥에 창 아래 변을 맞추는 y
fn ground_y(work_y: i32, work_h: i32, h: i32) -> i32 {
    work_y + work_h - h
}

fn physical(logical: (f64, f64), scale: f64) -> (i32, i32) {
    ((logical.0 * scale).round() as i32, (logical.1 * scale).round() as i32)
}

/// tao는 프레임 없는 창에도 WS_CAPTION | WS_SYSMENU를 붙여 두는데(그림자·스냅 호환용),
/// 그러면 Windows가 캡션 버튼이 들어갈 최소 너비(약 136px)를 강제해 작은 오브가 되지 않는다.
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
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_EX_NOACTIVATE, WS_SYSMENU,
    };
    use windows::Win32::Graphics::Gdi::{
        RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
    };
    let unwanted = (WS_CAPTION.0 | WS_SYSMENU.0) as isize;
    unsafe {
        // 클릭해도 활성화(키보드 포커스)되지 않는 창으로. 활성화되면 Windows가 펫 뒤에 반투명 상자
        // (포커스 표시·IME 표시기)를 그려 남긴다. 마우스 입력·드래그는 그대로 받고, 사용자가 쓰던 앱의 포커스도 뺏지 않는다.
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if ex & WS_EX_NOACTIVATE.0 as isize == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
        }
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

/// 오브 창 메시지에 끼어드는 서브클래스.
/// - WM_NCACTIVATE: 창이 활성/비활성될 때 DefWindowProc가 스타일에 WS_CAPTION이 없어도 창 위쪽에
///   클래식 캡션 바(하늘색 그라데이션)를 GDI로 그려 놓는다. 창이 투명이라 펫 뒤에 띠로 비친다.
///   lParam=-1로 넘기면 비클라이언트를 다시 그리지 않고, tao는 그대로 받아 포커스 상태를 추적한다.
/// - WM_STYLECHANGING: 스타일이 바뀌기 직전에 캡션 비트를 지우고 NOACTIVATE를 유지한다.
///   tao는 포커스·표시 상태가 바뀔 때마다 자기 플래그로 GWL_STYLE을 통째로 다시 쓰는데, 그 시점이 우리가
///   창 이벤트를 받는 뒤라 strip_caption만으로는 클릭 뒤 캡션 바가 잠깐 그려질 수 있다.
#[cfg(windows)]
unsafe extern "system" fn style_guard(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GWL_STYLE, STYLESTRUCT, WM_NCACTIVATE, WM_STYLECHANGING, WS_CAPTION,
        WS_EX_NOACTIVATE, WS_SYSMENU,
    };
    if msg == WM_NCACTIVATE {
        return DefSubclassProc(hwnd, msg, wparam, LPARAM(-1));
    }
    if msg == WM_STYLECHANGING && lparam.0 != 0 {
        let ss = lparam.0 as *mut STYLESTRUCT;
        let which = wparam.0 as i32;
        if which == GWL_STYLE.0 {
            (*ss).styleNew &= !(WS_CAPTION.0 | WS_SYSMENU.0);
        } else if which == GWL_EXSTYLE.0 {
            (*ss).styleNew |= WS_EX_NOACTIVATE.0;
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// 시작 때 한 번 오브 창에 스타일 감시를 건다
fn install_style_guard(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::UI::Shell::SetWindowSubclass;
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(style_guard), 1, 0);
        }
    }
    #[cfg(not(windows))]
    let _ = window;
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
            .set_size(PhysicalSize::new(w as u32, h as u32))
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

fn orb_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(ORB).ok_or_else(|| "오브 창이 없습니다".into())
}

/// 점이 든 모니터. 없으면(모니터를 뗀 뒤 화면 밖 좌표 등) x만 맞는 모니터, 그것도 없으면 None.
fn monitor_at(app: &AppHandle, x: i32, y: i32) -> Option<Monitor> {
    if let Ok(Some(m)) = app.monitor_from_point(x as f64, y as f64) {
        return Some(m);
    }
    app.available_monitors().ok()?.into_iter().find(|m| {
        let r = m.work_area();
        x >= r.position.x && x < r.position.x + r.size.width as i32
    })
}

/// 창을 모니터 작업 영역의 바닥에 놓는다. x는 작업 영역 안으로 자른다.
fn place_on_ground(w: &WebviewWindow, m: &Monitor, x: i32, cw: i32, ch: i32) -> Result<(), String> {
    let r = m.work_area();
    let right = (r.position.x + r.size.width as i32 - cw).max(r.position.x);
    let x = x.clamp(r.position.x, right);
    set_bounds(w, x, ground_y(r.position.y, r.size.height as i32, ch), cw, ch)
}

/// 저장된 x가 어느 모니터에 있으면 그 모니터 바닥에, 없으면 주 모니터 오른쪽 아래에 놓는다.
/// 크기는 논리값으로 받는다 (설정 스토어의 저장이 300ms 늦어 Rust가 설정을 읽으면 낡은 값을 볼 수 있다).
fn place(app: &AppHandle, w: &WebviewWindow, saved_x: Option<i32>, logical: (f64, f64)) {
    #[cfg(windows)]
    let _ = strip_caption(w);
    let scale = w.scale_factor().unwrap_or(1.0);
    let (cw, ch) = physical(logical, scale);
    let cur_y = w.outer_position().map(|p| p.y).unwrap_or(0);
    let saved = saved_x.and_then(|x| monitor_at(app, x + cw / 2, cur_y + ch / 2).map(|m| (x, m)));
    let (x, m) = match saved {
        Some(v) => v,
        None => {
            let Some(m) = app.primary_monitor().ok().flatten() else {
                return;
            };
            let r = m.work_area();
            (r.position.x + r.size.width as i32 - cw - (MARGIN * scale).round() as i32, m)
        }
    };
    // 창을 만들 때는 캡션 스타일 때문에 너비가 커져 있으므로 크기도 같이 바로잡는다
    let _ = place_on_ground(w, &m, x, cw, ch);
}

/// 시작 시: 저장된 x가 있으면 그 자리 바닥에, 없으면 주 모니터 오른쪽 아래로. 숨김 설정이면 숨긴다.
pub fn place_on_start(app: &AppHandle, settings: &Settings) {
    let Some(w) = app.get_webview_window(ORB) else {
        return;
    };
    install_style_guard(&w);
    place(app, &w, settings.orb_x, pet_box(&settings.pet_size));
    if !settings.orb_visible {
        let _ = w.hide();
    }
}

/// 펫 크기 변경: 창의 아래-가운데를 고정한 채 새 논리 크기로, y는 그 모니터 바닥.
#[tauri::command]
pub fn resize_orb(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let w = orb_window(&app)?;
    let scale = w.scale_factor().unwrap_or(1.0);
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let (cw, ch) = physical((width, height), scale);
    let (cx, cy) = (pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2);
    let m = monitor_at(&app, cx, cy)
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("모니터가 없습니다")?;
    place_on_ground(&w, &m, cx - cw / 2, cw, ch)
}

/// 오브 창의 위치·크기를 물리 픽셀로 한 번에. 피코가 산산조각 날 때 조각이 화면 전체를 굴러다니도록
/// 창을 작업 영역 크기로 넓혔다가, 다 붙으면 펫 상자로 되돌리는 데 쓴다.
#[tauri::command]
pub fn set_orb_bounds(app: AppHandle, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    set_bounds(&orb_window(&app)?, x, y, width, height)
}

/// 드래그 중 16ms 폴링용: (커서 x, y, 왼쪽 버튼 눌림). startDragging()은 놓는 순간을 알려 주지 않으므로
/// 버튼 상태가 유일한 release 신호다. 커서 좌표는 던지기 속도 계산에 쓴다.
#[tauri::command]
pub fn drag_probe(app: AppHandle) -> Result<(f64, f64, bool), String> {
    let p = app.cursor_position().map_err(|e| e.to_string())?;
    Ok((p.x, p.y, mouse_pressed()))
}

#[cfg(windows)]
fn mouse_pressed() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16) & 0x8000 != 0 }
}

#[cfg(not(windows))]
fn mouse_pressed() -> bool {
    false
}

/// 오브 창의 현재 위치·크기와 말풍선 폭(물리). 크기의 진실은 창 자체다.
fn orb_metrics(app: &AppHandle) -> Result<(WebviewWindow, PhysicalPosition<i32>, PhysicalSize<u32>, i32), String> {
    let w = orb_window(app)?;
    let pos = w.outer_position().map_err(|e| e.to_string())?;
    let size = w.outer_size().map_err(|e| e.to_string())?;
    let scale = w.scale_factor().unwrap_or(1.0);
    let bw = physical((BUBBLE_W, 0.0), scale).0;
    Ok((w, pos, size, bw))
}

/// 말풍선 자리만큼 창을 넓힌다. 펫은 제자리에 두고 왼쪽으로 펼치되, 왼쪽에 공간이 없으면
/// 오른쪽으로. 어느 쪽에 그려야 하는지("left" | "right")를 돌려준다. 확장 상태는 Rust가 갖지 않는다.
#[tauri::command]
pub fn expand_orb(app: AppHandle) -> Result<String, String> {
    let (w, pos, size, bw) = orb_metrics(&app)?;
    let left_edge = app
        .monitor_from_point(pos.x as f64, pos.y as f64)
        .ok()
        .flatten()
        .map(|m| m.work_area().position.x)
        .unwrap_or(i32::MIN);
    let side = if pos.x - bw >= left_edge { "left" } else { "right" };
    let x = if side == "left" { pos.x - bw } else { pos.x };
    set_bounds(&w, x, pos.y, size.width as i32 + bw, size.height as i32)?;
    Ok(side.into())
}

/// 말풍선을 닫고 원래 폭으로 되돌린다. side는 expand_orb가 돌려준 값 — 펼친 채 옮겨졌어도 펫 자리가 유지된다.
#[tauri::command]
pub fn collapse_orb(app: AppHandle, side: String) -> Result<(), String> {
    let (w, pos, size, bw) = orb_metrics(&app)?;
    let x = if side == "left" { pos.x + bw } else { pos.x };
    set_bounds(&w, x, pos.y, size.width as i32 - bw, size.height as i32)
}

/// 설정의 "오브 위치 초기화": 주 모니터 오른쪽 아래로 옮기고 보이게 한다. 크기는 지금 창 크기 그대로.
#[tauri::command]
pub fn reset_orb_position(app: AppHandle) -> Result<(), String> {
    let w = orb_window(&app)?;
    let scale = w.scale_factor().unwrap_or(1.0);
    let size = w.outer_size().map_err(|e| e.to_string())?;
    place(&app, &w, None, (size.width as f64 / scale, size.height as f64 / scale));
    set_visible(&app, true);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_box_follows_sprite_aspect_with_shadow_margin() {
        assert_eq!(pet_box("small"), (68.0, 88.0));
        assert_eq!(pet_box("medium"), (97.0, 128.0));
        assert_eq!(pet_box("large"), (125.0, 168.0));
        assert_eq!(pet_box("garbage"), pet_box("medium"));
    }

    #[test]
    fn ground_sits_on_work_area_bottom() {
        assert_eq!(ground_y(0, 1040, 128), 912);
        // 주 모니터 위쪽의 보조 모니터 (음수 좌표)
        assert_eq!(ground_y(-1080, 1040, 88), -128);
    }
}
