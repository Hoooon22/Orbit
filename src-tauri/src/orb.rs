//! 플로팅 오브 창. 창 하나가 접힘(작은 원)↔펼침(패널) 사이를 크기만 바꿔 오간다.
//! 위치·크기 변경은 Win32 SetWindowPos 한 번으로 해서 두 IPC 사이에 잘린 프레임이 보이지 않게 한다.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};

use crate::settings::Settings;

pub const ORB: &str = "orb";
pub const MAIN: &str = "main";

/// 논리 픽셀. 접힌 창은 오브(56) + 그림자 여백, 펼친 창은 패널 크기.
const COLLAPSED: (f64, f64) = (72.0, 72.0);
const EXPANDED: (f64, f64) = (380.0, 520.0);
const MARGIN: f64 = 16.0; // 첫 실행 때 화면 오른쪽 아래에서 띄우는 간격

/// 펼친 동안 기억해 두는 접힌 상태의 위치. 접을 때 그대로 되돌린다.
pub struct OrbState(pub Mutex<Option<PhysicalPosition<i32>>>);

/// 순수 함수: 접힌 사각형(x, y, cw, ch)에서 펼친 크기(ew, eh)를 작업 영역(wa) 안에 넣을 좌표.
/// 오른쪽·아래로 펼치되 넘치면 반대쪽으로 붙이고, 그래도 넘치면 작업 영역 안으로 민다.
fn expand_origin(
    (x, y, cw, ch): (i32, i32, i32, i32),
    (ew, eh): (i32, i32),
    wa: (i32, i32, i32, i32), // left, top, width, height
) -> (i32, i32) {
    let (left, top, width, height) = wa;
    let right = left + width;
    let bottom = top + height;
    let mut ex = if x + ew <= right { x } else { x + cw - ew };
    let mut ey = if y + eh <= bottom { y } else { y + ch - eh };
    ex = ex.clamp(left, (right - ew).max(left));
    ey = ey.clamp(top, (bottom - eh).max(top));
    (ex, ey)
}

fn physical(logical: (f64, f64), scale: f64) -> (i32, i32) {
    ((logical.0 * scale).round() as i32, (logical.1 * scale).round() as i32)
}

/// tao는 프레임 없는 창에도 WS_CAPTION | WS_SYSMENU를 붙여 두는데(그림자·스냅 호환용),
/// 그러면 Windows가 캡션 버튼이 들어갈 최소 너비(약 136px)를 강제해 72px 오브가 되지 않는다.
/// 두 스타일을 떼어낸다. tao가 표시/숨김 등 상태가 바뀔 때 스타일을 다시 계산하므로
/// 창을 만질 때마다 다시 호출한다.
#[cfg(windows)]
fn strip_caption(window: &WebviewWindow) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_SYSMENU,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
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

/// 오브 펼치기/접기. 펼칠 때 접힌 위치를 기억했다가 접을 때 되돌린다.
#[tauri::command]
pub fn set_orb_bounds(
    window: WebviewWindow,
    state: State<OrbState>,
    expanded: bool,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let (cw, ch) = physical(COLLAPSED, scale);
    let mut saved = state.0.lock().map_err(|e| e.to_string())?;
    if expanded {
        let pos = window.outer_position().map_err(|e| e.to_string())?;
        *saved = Some(pos);
        let (ew, eh) = physical(EXPANDED, scale);
        let wa = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .map(|m| {
                let r = m.work_area();
                (r.position.x, r.position.y, r.size.width as i32, r.size.height as i32)
            })
            .unwrap_or((pos.x, pos.y, ew, eh));
        let (ex, ey) = expand_origin((pos.x, pos.y, cw, ch), (ew, eh), wa);
        set_bounds(&window, ex, ey, ew, eh)
    } else {
        let pos = match saved.take() {
            Some(p) => p,
            None => window.outer_position().map_err(|e| e.to_string())?,
        };
        set_bounds(&window, pos.x, pos.y, cw, ch)
    }
}

/// 워크스페이스 창을 앞으로 가져오고, 열 대상(메모 경로·가상 뷰)이 있으면 알려준다.
#[tauri::command]
pub fn show_workspace(app: AppHandle, target: Option<String>) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    if let Some(t) = target {
        let _ = app.emit_to(MAIN, "navigate", t);
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

/// 시작 시: 저장된 위치가 있으면 그리로, 없으면 화면 오른쪽 아래로. 숨김 설정이면 숨긴다.
pub fn place_on_start(app: &AppHandle, settings: &Settings) {
    let Some(w) = app.get_webview_window(ORB) else {
        return;
    };
    #[cfg(windows)]
    let _ = strip_caption(&w);
    let scale = w.scale_factor().unwrap_or(1.0);
    let (cw, ch) = physical(COLLAPSED, scale);
    let pos = match (settings.orb_x, settings.orb_y) {
        (Some(x), Some(y)) => Some(PhysicalPosition::new(x, y)),
        _ => w.current_monitor().ok().flatten().map(|m| {
            let r = m.work_area();
            let margin = (MARGIN * scale).round() as i32;
            PhysicalPosition::new(
                r.position.x + r.size.width as i32 - cw - margin,
                r.position.y + r.size.height as i32 - ch - margin,
            )
        }),
    };
    if let Some(p) = pos {
        // 창을 만들 때는 캡션 스타일 때문에 너비가 커져 있으므로 크기도 같이 바로잡는다
        let _ = set_bounds(&w, p.x, p.y, cw, ch);
    }
    if !settings.orb_visible {
        let _ = w.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WA: (i32, i32, i32, i32) = (0, 0, 1920, 1040); // 작업 표시줄 40px 제외

    #[test]
    fn expands_right_down_when_room() {
        assert_eq!(expand_origin((100, 100, 72, 72), (380, 520), WA), (100, 100));
    }

    #[test]
    fn flips_left_and_up_near_bottom_right() {
        // 오른쪽 아래 구석의 오브: 패널의 오른쪽·아래 끝을 오브에 맞춘다
        assert_eq!(
            expand_origin((1832, 952, 72, 72), (380, 520), WA),
            (1832 + 72 - 380, 952 + 72 - 520)
        );
    }

    #[test]
    fn clamps_inside_work_area() {
        // 왼쪽 위 구석에서 뒤집을 필요는 없지만, 작업 영역을 벗어나는 음수 좌표는 없어야 한다
        assert_eq!(expand_origin((-10, -10, 72, 72), (380, 520), WA), (0, 0));
        // 세컨드 모니터(음수 좌표) 작업 영역에서도 그 안에 머문다
        let wa2 = (-1920, 0, 1920, 1080);
        let (x, y) = expand_origin((-100, 900, 72, 72), (380, 520), wa2);
        assert!(x >= -1920 && x + 380 <= 0);
        assert!(y >= 0 && y + 520 <= 1080);
    }
}
