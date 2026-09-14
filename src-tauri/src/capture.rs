//! 영역 캡처와 색상 추출(스포이드). 두 기능이 같은 오버레이 창을 쓴다.
//!
//! 오버레이를 띄우기 **전에** 커서가 있는 모니터를 통째로 찍어 두고, 오버레이는 그 정지 화면을
//! 배경으로 보여 준다. 자르기·색 읽기도 그 스냅샷에서 한다. 오버레이가 뜬 뒤 다시 찍으면
//! 어둡게 덮인 화면이 찍히고, 창 좌표(물리)와 CSS 좌표(논리)를 섞다 DPI≠100%에서 어긋나기 쉽다.
//! 좌표 변환은 `to_physical` 한 곳에서만 한다.
//!
//! 오버레이 창은 그때그때 만들고 끝나면 `destroy()`한다. 정적으로 두면 WebView2 프로세스가 늘 떠 있고
//! 모니터마다 위치·크기를 다시 맞춰야 한다. 정리(숨긴 창 복원·세션 비움)는 창이 실제로 사라진 뒤
//! `on_overlay_closed`(lib.rs의 Destroyed 이벤트)에서 한 번만 한다.

use std::io::Cursor;
use std::sync::Mutex;
use std::time::Duration;

use image::RgbaImage;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder};

use crate::orb;

pub const OVERLAY: &str = "capture";

#[derive(Clone, Copy, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Region,
    Color,
}

struct Session {
    mode: Mode,
    shot: RgbaImage,             // 커서가 있던 모니터 전체 (물리 px)
    restore: Vec<&'static str>, // 캡처 전에 보이던 창 라벨 — 끝나면 다시 보인다
}

#[derive(Default)]
pub struct CaptureState {
    session: Mutex<Option<Session>>,
    /// 마지막으로 자른 그림(PNG). 메모 편집기가 "여기에 넣기"로 가져간다
    last_png: Mutex<Option<Vec<u8>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CaptureDone {
    pub width: u32,
    pub height: u32,
}

/// 커서가 있는 모니터. 못 찾으면 주 모니터.
fn monitor_under_cursor(app: &AppHandle) -> Result<xcap::Monitor, String> {
    if let Ok(p) = app.cursor_position() {
        if let Ok(m) = xcap::Monitor::from_point(p.x as i32, p.y as i32) {
            return Ok(m);
        }
    }
    xcap::Monitor::all()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|m| m.is_primary().unwrap_or(false))
        .ok_or_else(|| "모니터를 찾지 못했습니다".into())
}

fn restore_windows(app: &AppHandle, labels: &[&str]) {
    for label in labels {
        match *label {
            orb::DASHBOARD => orb::show_dashboard(app.clone(), None),
            orb::ORB => orb::set_visible(app, true),
            _ => {}
        }
    }
}

/// 스냅샷 → 오버레이 창. 이미 캡처 중이면 아무것도 하지 않는다.
fn start(app: &AppHandle, mode: Mode) -> Result<(), String> {
    let state = app.try_state::<CaptureState>().ok_or("캡처 상태가 없습니다")?;
    if state.session.lock().map_err(|e| e.to_string())?.is_some() {
        return Ok(());
    }
    let monitor = monitor_under_cursor(app)?;
    // 오브·Orbit 창이 찍히지 않게 잠시 숨긴다. 컴포지터가 지울 시간을 조금 준다
    let mut restore = Vec::new();
    for label in [orb::DASHBOARD, orb::ORB] {
        if let Some(w) = app.get_webview_window(label) {
            if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
                restore.push(label);
            }
        }
    }
    if !restore.is_empty() {
        std::thread::sleep(Duration::from_millis(80));
    }
    let shot = match monitor.capture_image() {
        Ok(img) => img,
        Err(e) => {
            restore_windows(app, &restore);
            return Err(format!("화면을 찍지 못했습니다: {e}"));
        }
    };
    let (x, y) = (monitor.x().unwrap_or(0), monitor.y().unwrap_or(0));
    let (w, h) = (shot.width(), shot.height());
    *state.session.lock().map_err(|e| e.to_string())? = Some(Session { mode, shot, restore });

    let built = WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("capture.html".into()))
        .title("Orbit Capture")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build();
    let win = match built {
        Ok(w) => w,
        Err(e) => {
            on_overlay_closed(app);
            return Err(format!("캡처 창을 만들지 못했습니다: {e}"));
        }
    };
    // 먼저 그 모니터로 옮겨 DPI를 받은 뒤 물리 크기로 맞춘다 (논리 크기로 주면 배율이 다른 모니터에서 어긋난다)
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(w, h));
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

/// 단축키·트레이에서. 스냅샷·창 생성에 수백 ms가 걸리므로 별도 스레드에서
pub fn start_async(app: &AppHandle, mode: Mode) {
    let app = app.clone();
    std::thread::spawn(move || {
        let _ = start(&app, mode);
    });
}

fn finish(app: &AppHandle) {
    match app.get_webview_window(OVERLAY) {
        Some(w) => {
            let _ = w.destroy();
        }
        None => on_overlay_closed(app),
    }
}

/// 오버레이 창이 사라진 뒤(Destroyed): 숨겼던 창을 되살리고 스냅샷을 버린다
pub fn on_overlay_closed(app: &AppHandle) {
    let Some(state) = app.try_state::<CaptureState>() else { return };
    let session = state.session.lock().ok().and_then(|mut s| s.take());
    if let Some(s) = session {
        restore_windows(app, &s.restore);
    }
}

/// 순수 함수: 오버레이의 CSS 논리 rect → 스냅샷 물리 rect. 경계 밖은 잘라 내고, 남는 게 없으면 Err.
pub fn to_physical(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    scale: f64,
    bounds: (u32, u32),
) -> Result<(u32, u32, u32, u32), String> {
    let clamp = |v: f64, max: u32| ((v * scale).round().max(0.0) as u32).min(max);
    let (x0, y0) = (clamp(x, bounds.0), clamp(y, bounds.1));
    let (x1, y1) = (clamp(x + w, bounds.0), clamp(y + h, bounds.1));
    if x1 <= x0 || y1 <= y0 {
        return Err("선택한 영역이 너무 작습니다".into());
    }
    Ok((x0, y0, x1 - x0, y1 - y0))
}

fn encode_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    let mut buf = Vec::new();
    let enc = PngEncoder::new_with_quality(&mut buf, CompressionType::Fast, FilterType::NoFilter);
    img.write_with_encoder(enc).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// 클립보드 CF_BITMAP용 24bpp BMP. RGBA로 인코딩하면 V4 헤더(108B)가 붙어 clipboard-win이 못 읽는다
fn encode_bmp(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let rgb = image::DynamicImage::ImageRgba8(img.clone()).to_rgb8();
    let mut buf = Cursor::new(Vec::new());
    rgb.write_to(&mut buf, image::ImageFormat::Bmp).map_err(|e| e.to_string())?;
    Ok(buf.into_inner())
}

fn valid_hex(hex: &str) -> bool {
    hex.len() == 7 && hex.starts_with('#') && hex[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// 런처·설정 화면에서. 실패 사유를 돌려준다
#[tauri::command(async)]
pub fn capture_start(app: AppHandle, mode: Mode) -> Result<(), String> {
    start(&app, mode)
}

/// 오버레이가 뜨자마자 묻는다: 영역인지 색상인지
#[tauri::command]
pub fn capture_mode(state: State<CaptureState>) -> Result<Mode, String> {
    let s = state.session.lock().map_err(|e| e.to_string())?;
    s.as_ref().map(|s| s.mode).ok_or_else(|| "캡처 중이 아닙니다".into())
}

/// 스냅샷 전체를 PNG로 (오버레이 배경·색 표본용). JSON이 아닌 바이트로 보낸다
#[tauri::command]
pub fn capture_shot(state: State<CaptureState>) -> Result<tauri::ipc::Response, String> {
    let s = state.session.lock().map_err(|e| e.to_string())?;
    let sess = s.as_ref().ok_or("캡처 중이 아닙니다")?;
    Ok(tauri::ipc::Response::new(encode_png(&sess.shot)?))
}

/// 오버레이가 고른 영역(논리 px)을 잘라 클립보드에 그림으로 올리고 오버레이를 닫는다
#[tauri::command]
pub fn capture_region(
    app: AppHandle,
    window: tauri::Window,
    state: State<CaptureState>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let (png, bmp, pw, ph) = {
        let s = state.session.lock().map_err(|e| e.to_string())?;
        let sess = s.as_ref().ok_or("캡처 중이 아닙니다")?;
        let (px, py, pw, ph) = to_physical(x, y, w, h, scale, sess.shot.dimensions())?;
        let crop = image::imageops::crop_imm(&sess.shot, px, py, pw, ph).to_image();
        (encode_png(&crop)?, encode_bmp(&crop)?, pw, ph)
    };
    #[cfg(windows)]
    clipboard_win::set_clipboard(clipboard_win::formats::Bitmap, &bmp)
        .map_err(|e| format!("클립보드에 올리지 못했습니다: {e}"))?;
    #[cfg(not(windows))]
    let _ = bmp;
    *state.last_png.lock().map_err(|e| e.to_string())? = Some(png);
    let _ = app.emit("capture-done", CaptureDone { width: pw, height: ph });
    finish(&app);
    Ok(())
}

/// 오버레이가 읽은 색(#RRGGBB)을 클립보드에 텍스트로 올리고 오버레이를 닫는다.
/// 클립보드 히스토리가 그대로 기록하므로 홈의 클립보드 칸 맨 위에 색이 나타난다
#[tauri::command]
pub fn capture_color(app: AppHandle, hex: String) -> Result<(), String> {
    let hex = hex.to_uppercase();
    if !valid_hex(&hex) {
        return Err(format!("색 표기가 잘못됐습니다: {hex}"));
    }
    #[cfg(windows)]
    clipboard_win::set_clipboard(clipboard_win::formats::Unicode, &hex).map_err(|e| e.to_string())?;
    let _ = app.emit("color-picked", &hex);
    finish(&app);
    Ok(())
}

#[tauri::command]
pub fn capture_cancel(app: AppHandle) {
    finish(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_physical_scales_and_rounds() {
        assert_eq!(to_physical(10.0, 20.0, 100.0, 50.0, 1.0, (1920, 1080)), Ok((10, 20, 100, 50)));
        assert_eq!(to_physical(10.0, 20.0, 100.0, 50.0, 1.5, (2880, 1620)), Ok((15, 30, 150, 75)));
        // 1.25배에서 반올림: 10.5*1.25=13.125→13, (10.5+7)*1.25=21.875→22
        assert_eq!(to_physical(10.5, 0.0, 7.0, 4.0, 1.25, (100, 100)), Ok((13, 0, 9, 5)));
    }

    #[test]
    fn to_physical_clamps_to_bounds() {
        assert_eq!(to_physical(-5.0, -5.0, 20.0, 20.0, 1.0, (100, 100)), Ok((0, 0, 15, 15)));
        assert_eq!(to_physical(90.0, 90.0, 50.0, 50.0, 1.0, (100, 100)), Ok((90, 90, 10, 10)));
    }

    #[test]
    fn to_physical_rejects_empty() {
        assert!(to_physical(10.0, 10.0, 0.0, 5.0, 1.0, (100, 100)).is_err());
        assert!(to_physical(200.0, 10.0, 5.0, 5.0, 1.0, (100, 100)).is_err());
    }

    #[test]
    fn hex_validation() {
        assert!(valid_hex("#3DD68C"));
        assert!(valid_hex("#000000"));
        assert!(!valid_hex("3DD68C"));
        assert!(!valid_hex("#3DD68"));
        assert!(!valid_hex("#GGGGGG"));
    }

    #[test]
    fn bmp_is_24bpp_with_40_byte_info_header() {
        let img = RgbaImage::from_pixel(3, 2, image::Rgba([1, 2, 3, 255]));
        let bmp = encode_bmp(&img).unwrap();
        assert_eq!(&bmp[0..2], b"BM");
        assert_eq!(u32::from_le_bytes([bmp[14], bmp[15], bmp[16], bmp[17]]), 40); // BITMAPINFOHEADER
        assert_eq!(u16::from_le_bytes([bmp[28], bmp[29]]), 24); // biBitCount
    }
}
