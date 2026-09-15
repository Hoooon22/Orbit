//! 메모 폴더 전체 백업. 노트 루트(메모·이미지·할 일·일정·설정)를 통째로 .zip 하나에 담는다.
//! `%LOCALAPPDATA%`의 기기별 데이터(구글 토큰·클립보드 기록 등)는 넣지 않는다.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, State};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::notes::NotesRoot;
use crate::settings::SettingsState;

const DEFAULT_DIR: &str = "Orbit 백업";

/// 설정에 폴더가 없을 때의 기본값: `문서\Orbit 백업`
fn default_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().document_dir().map_err(|e| e.to_string())?.join(DEFAULT_DIR))
}

fn effective_dir(app: &AppHandle, state: &SettingsState) -> Result<PathBuf, String> {
    let custom = state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .and_then(|s| s.backup_dir.clone());
    match custom {
        Some(d) => Ok(PathBuf::from(d)),
        None => default_dir(app),
    }
}

/// 백업 폴더가 메모 폴더 안이면 다음 백업에 이전 백업이 또 담겨 눈덩이처럼 커지므로 막는다.
fn check_dir(dir: &Path, root: &Path) -> Result<(), String> {
    if dir.starts_with(root) {
        return Err("백업 폴더는 메모 폴더 안에 둘 수 없습니다".into());
    }
    Ok(())
}

/// root 아래를 전부 zip에 쓴다. 저장 도중의 임시 파일(`*.tmp`)과 심볼릭 링크는 건너뛴다.
/// 파일은 하나씩 스트리밍으로 복사해 폴더 크기만큼 메모리를 쓰지 않는다. 담은 파일 수를 돌려준다.
fn write_zip(root: &Path, dest: &Path) -> Result<usize, String> {
    let file = File::create(dest).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut count = 0;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let mut entries: Vec<_> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            let ty = entry.file_type().map_err(|e| e.to_string())?;
            let rel = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            if ty.is_dir() {
                zip.add_directory(format!("{rel}/"), opts).map_err(|e| e.to_string())?;
                stack.push(path);
            } else if ty.is_file() && !rel.ends_with(".tmp") {
                zip.start_file(rel, opts).map_err(|e| e.to_string())?;
                let mut src = BufReader::new(File::open(&path).map_err(|e| e.to_string())?);
                io::copy(&mut src, &mut zip).map_err(|e| e.to_string())?;
                count += 1;
            }
        }
    }
    zip.finish().map_err(|e| e.to_string())?.flush().map_err(|e| e.to_string())?;
    Ok(count)
}

/// 지금 쓰이는 백업 폴더 경로 (설정 화면 표시용)
#[tauri::command]
pub fn backup_dir(app: AppHandle, state: State<SettingsState>) -> Result<String, String> {
    Ok(effective_dir(&app, &state)?.to_string_lossy().into_owned())
}

/// 폴더 선택 대화상자를 띄워 백업 폴더를 바꾼다. 취소하면 None. 대화상자가 스레드를 잡으므로 async.
#[tauri::command(async)]
pub fn pick_backup_dir(
    app: AppHandle,
    root: State<NotesRoot>,
    state: State<SettingsState>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let current = effective_dir(&app, &state)?;
    let start = if current.exists() { current } else { app.path().document_dir().map_err(|e| e.to_string())? };
    let Some(picked) = app
        .dialog()
        .file()
        .set_title("백업 폴더 선택")
        .set_directory(start)
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let dir = picked.into_path().map_err(|e| e.to_string())?;
    check_dir(&dir, &root.0)?;
    let text = dir.to_string_lossy().into_owned();
    crate::toggle_setting(&app, |s| s.backup_dir = Some(text.clone()));
    Ok(Some(text))
}

/// 메모 폴더 전체를 `Orbit-YYYY-MM-DD-HHMMSS.zip`으로 저장하고 그 경로를 돌려준다.
#[tauri::command(async)]
pub fn backup_notes(
    app: AppHandle,
    root: State<NotesRoot>,
    state: State<SettingsState>,
) -> Result<String, String> {
    let dir = effective_dir(&app, &state)?;
    check_dir(&dir, &root.0)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let now = chrono::Local::now();
    let dest = dir.join(format!("Orbit-{}.zip", now.format("%Y-%m-%d-%H%M%S")));
    // 다 쓴 뒤 이름을 바꿔, 도중에 실패해도 반쯤 된 .zip이 남지 않게 한다
    let tmp = dest.with_extension("zip.tmp");
    if let Err(e) = write_zip(&root.0, &tmp).and_then(|_| fs::rename(&tmp, &dest).map_err(|e| e.to_string())) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    crate::toggle_setting(&app, |s| s.last_backup_at = Some(now.to_rfc3339()));
    Ok(dest.to_string_lossy().into_owned())
}

/// 백업 폴더를 탐색기로 연다 (없으면 만든다)
#[tauri::command]
pub fn open_backup_dir(app: AppHandle, state: State<SettingsState>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = effective_dir(&app, &state)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn fresh(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("orbit-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn zip_keeps_tree_and_skips_tmp() {
        let base = fresh("backup");
        let root = base.join("Orbit");
        fs::create_dir_all(root.join("폴더").join(".assets")).unwrap();
        fs::write(root.join("QuickMemo.md"), "빠른 메모").unwrap();
        fs::write(root.join("폴더").join("메모.md"), "# 안녕").unwrap();
        fs::write(root.join("폴더").join(".assets").join("img-1.png"), [1u8, 2, 3]).unwrap();
        fs::write(root.join(".settings.json"), "{}").unwrap();
        fs::write(root.join(".settings.json.tmp"), "half").unwrap();

        let dest = base.join("out.zip");
        assert_eq!(write_zip(&root, &dest).unwrap(), 4);

        let mut archive = zip::ZipArchive::new(File::open(&dest).unwrap()).unwrap();
        let names: Vec<String> = (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.contains(&"폴더/메모.md".to_string()));
        assert!(names.contains(&"폴더/.assets/img-1.png".to_string()));
        assert!(names.contains(&".settings.json".to_string()));
        assert!(!names.iter().any(|n| n.ends_with(".tmp")));
        let mut text = String::new();
        archive.by_name("폴더/메모.md").unwrap().read_to_string(&mut text).unwrap();
        assert_eq!(text, "# 안녕");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn backup_dir_inside_root_is_rejected() {
        let root = Path::new(r"C:\docs\Orbit");
        assert!(check_dir(Path::new(r"C:\docs\Orbit\backup"), root).is_err());
        assert!(check_dir(Path::new(r"C:\docs\Orbit"), root).is_err());
        assert!(check_dir(Path::new(r"C:\docs\Orbit 백업"), root).is_ok());
        assert!(check_dir(Path::new(r"D:\backup"), root).is_ok());
    }
}
