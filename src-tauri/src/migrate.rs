//! DesktopMemo → Orbit 이름 변경에 따른 1회성 정리.
//! 데이터 폴더 이름을 옮기고, 이름이 달라져 나란히 남게 된 옛 설치본을 제거하도록 안내한다.

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::Manager;

const NEW_DIR: &str = "Orbit";
const OLD_DIR: &str = "DesktopMemo";
/// 옛 설치본 제거를 거절한 사용자에게 다시 묻지 않기 위한 표시 파일
const SKIP_MARKER: &str = "skip-old-uninstall";

/// 데이터 루트를 정한다. 옛 폴더만 있으면 새 이름으로 옮긴다.
/// 옮기기에 실패하면(탐색기·OneDrive가 잡고 있는 등) 옛 폴더를 그대로 쓰고 다음 실행에 다시 시도한다.
pub fn resolve_data_root(docs: &Path) -> PathBuf {
    let new = docs.join(NEW_DIR);
    let old = docs.join(OLD_DIR);
    if new.exists() {
        return new;
    }
    if old.exists() {
        return match std::fs::rename(&old, &new) {
            Ok(()) => new,
            Err(_) => old,
        };
    }
    new
}

/// 레지스트리에 남아 있는 DesktopMemo 언인스톨러 경로. NSIS는 productName을 키 이름으로 쓴다.
#[cfg(windows)]
fn old_uninstaller() -> Option<PathBuf> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DesktopMemo",
            "/v",
            "UninstallString",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    // 출력 예:  "    UninstallString    REG_SZ    "C:\...\uninstall.exe""
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.contains("UninstallString"))?;
    let value = line.split("REG_SZ").nth(1)?.trim().trim_matches('"');
    let path = PathBuf::from(value);
    path.exists().then_some(path)
}

#[cfg(not(windows))]
fn old_uninstaller() -> Option<PathBuf> {
    None
}

/// 옛 DesktopMemo 설치본이 남아 있으면 제거할지 묻는다. 거절하면 표시 파일을 남겨 다시 묻지 않는다.
/// 다이얼로그가 앱 시작을 막지 않도록 별도 스레드에서 돈다.
pub fn offer_old_uninstall(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

    let Ok(local) = app.path().app_local_data_dir() else {
        return;
    };
    let marker = local.join(SKIP_MARKER);
    if marker.exists() {
        return;
    }
    let Some(uninstaller) = old_uninstaller() else {
        return;
    };
    std::thread::spawn(move || {
        let yes = app
            .dialog()
            .message(
                "DesktopMemo가 Orbit으로 이름을 바꿨습니다.\n\
                 이전 버전(DesktopMemo)이 아직 설치되어 있습니다. 지금 제거할까요?\n\
                 메모는 그대로 남습니다.",
            )
            .title("Orbit")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "제거".into(),
                "나중에".into(),
            ))
            .blocking_show();
        if yes {
            let _ = Command::new(uninstaller).arg("/S").spawn();
        } else {
            let _ = std::fs::create_dir_all(&local);
            let _ = std::fs::write(marker, "");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fresh(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("orbit-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn fresh_install_uses_new_name() {
        let docs = fresh("migrate-fresh");
        assert_eq!(resolve_data_root(&docs), docs.join(NEW_DIR));
        let _ = fs::remove_dir_all(&docs);
    }

    #[test]
    fn old_folder_is_renamed_with_contents() {
        let docs = fresh("migrate-old");
        fs::create_dir_all(docs.join(OLD_DIR).join("폴더")).unwrap();
        fs::write(docs.join(OLD_DIR).join("폴더").join("메모.md"), "안녕").unwrap();

        let root = resolve_data_root(&docs);
        assert_eq!(root, docs.join(NEW_DIR));
        assert!(!docs.join(OLD_DIR).exists());
        assert_eq!(fs::read_to_string(root.join("폴더").join("메모.md")).unwrap(), "안녕");
        let _ = fs::remove_dir_all(&docs);
    }

    #[test]
    fn existing_new_folder_wins() {
        let docs = fresh("migrate-both");
        fs::create_dir_all(docs.join(OLD_DIR)).unwrap();
        fs::create_dir_all(docs.join(NEW_DIR)).unwrap();
        assert_eq!(resolve_data_root(&docs), docs.join(NEW_DIR));
        assert!(docs.join(OLD_DIR).exists()); // 손대지 않음
        let _ = fs::remove_dir_all(&docs);
    }
}
