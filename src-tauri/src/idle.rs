//! 자리 비움 감지. 마지막 키·마우스 입력 이후 흐른 시간을 OS에 묻는다.
//! 사용 통계(usage.rs)가 5초마다 확인해 임계를 넘는 순간 `idle-changed`를 보내고,
//! 오브 창은 그 이벤트로 "자리 비움" 표시를 켜고 끈다.

use serde::Serialize;

/// 이 시간(초) 이상 입력이 없으면 자리 비움으로 본다.
pub const IDLE_AFTER_SECS: f64 = 300.0;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IdleChange {
    pub idle: bool,
    pub seconds: f64,
}

/// 마지막 입력 이후 초. 알 수 없으면 0(= 활동 중).
#[cfg(windows)]
pub fn seconds() -> f64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    unsafe {
        if !GetLastInputInfo(&mut info).as_bool() {
            return 0.0;
        }
        // 틱은 49.7일마다 한 바퀴 돌므로 wrapping 뺄셈
        GetTickCount().wrapping_sub(info.dwTime) as f64 / 1000.0
    }
}

#[cfg(not(windows))]
pub fn seconds() -> f64 {
    0.0
}

/// 순수 함수: 상태가 바뀌었으면 새 상태를 돌려준다.
pub fn transition(was_idle: bool, secs: f64) -> Option<bool> {
    let idle = secs >= IDLE_AFTER_SECS;
    (idle != was_idle).then_some(idle)
}

#[tauri::command]
pub fn idle_seconds() -> f64 {
    seconds()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transitions_only_when_crossing_threshold() {
        assert_eq!(transition(false, IDLE_AFTER_SECS), Some(true));
        assert_eq!(transition(false, IDLE_AFTER_SECS - 1.0), None);
        assert_eq!(transition(true, 3.0), Some(false));
        assert_eq!(transition(true, IDLE_AFTER_SECS + 10.0), None);
    }
}
