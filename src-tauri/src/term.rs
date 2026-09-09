//! AI 화면의 내장 터미널. 노트 루트를 작업 폴더로 셸을 띄우고 곧바로 claude를 실행한다.
//! Windows에서는 portable-pty가 ConPTY로 진짜 콘솔을 만들어 주므로 claude의 화면 제어가 그대로 동작한다.
//! 프런트(xterm.js)와는 명령(입력·크기)과 term-output 이벤트(출력)로 이어진다.
//! 세션은 앱에 하나뿐이고, AI 화면을 떠나도 살아 있다 (돌아오면 하던 대화를 이어서 본다).

use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, State};

use crate::notes::NotesRoot;

const CHUNK: usize = 4096;

pub struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct TermState(pub Mutex<Option<Session>>);

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 }
}

// claude를 바로 띄우는 셸. -NoExit이라 claude가 끝나도 프롬프트가 남아 다시 실행할 수 있다.
// Store(MSIX 별칭)로 깔린 pwsh는 콘솔 연결이 어긋나는 일이 있어 표준 설치 경로만 보고,
// 없으면 어느 Windows에나 있는 powershell.exe로 떨어진다.
#[cfg(windows)]
fn shell() -> CommandBuilder {
    let pwsh = std::path::PathBuf::from(
        std::env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string()),
    )
    .join("PowerShell")
    .join("7")
    .join("pwsh.exe");
    let mut cmd = if pwsh.is_file() {
        CommandBuilder::new(pwsh)
    } else {
        CommandBuilder::new("powershell.exe")
    };
    cmd.args(["-NoLogo", "-NoExit", "-Command", "claude"]);
    cmd
}

#[cfg(not(windows))]
fn shell() -> CommandBuilder {
    let sh = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(&sh);
    cmd.args(["-c", &format!("claude; exec {sh}")]);
    cmd
}

/// 읽은 바이트에서 온전한 UTF-8만 떼어 낸다. 한글은 3바이트라 읽기 덩어리 경계에서 잘리기 쉬운데
/// 그대로 흘려보내면 글자가 깨지므로 잘린 꼬리는 다음 덩어리까지 남겨 둔다.
fn drain_utf8(pending: &mut Vec<u8>) -> String {
    let valid = match std::str::from_utf8(pending) {
        Ok(s) => s.len(),
        Err(e) => e.valid_up_to(),
    };
    let mut text = String::from_utf8_lossy(&pending[..valid]).into_owned();
    pending.drain(..valid);
    // 4바이트를 넘겨도 온전해지지 않으면 잘린 글자가 아니라 UTF-8이 아닌 바이트다. 고이지 않게 흘려보낸다.
    if pending.len() > 4 {
        let junk = std::mem::take(pending);
        text.push_str(&String::from_utf8_lossy(&junk));
    }
    text
}

fn start(app: &AppHandle, root: &Path, cols: u16, rows: u16) -> Result<Session, String> {
    let pair = portable_pty::native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;
    let mut cmd = shell();
    cmd.cwd(root);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave); // 슬레이브를 놓아야 자식이 끝날 때 읽기가 EOF로 끝난다
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; CHUNK];
        let mut pending: Vec<u8> = Vec::new();
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 {
                break;
            }
            pending.extend_from_slice(&buf[..n]);
            let text = drain_utf8(&mut pending);
            if !text.is_empty() {
                let _ = handle.emit("term-output", text);
            }
        }
        let _ = handle.emit("term-exit", ());
    });

    Ok(Session { master: pair.master, writer, child })
}

/// AI 화면이 열릴 때. 살아 있는 세션이 있으면 크기만 맞추고 그대로 쓰고,
/// 없거나 이미 끝났으면 새로 띄운다 (프런트의 "다시 시작"도 이 명령을 부른다).
#[tauri::command]
pub fn term_start(
    app: AppHandle,
    state: State<TermState>,
    root: State<NotesRoot>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(s) = slot.as_mut() {
        let alive = matches!(s.child.try_wait(), Ok(None));
        if alive {
            let _ = s.master.resize(size(cols, rows));
            return Ok(());
        }
    }
    *slot = Some(start(&app, &root.0, cols, rows)?);
    Ok(())
}

/// 키 입력을 그대로 셸에 넘긴다 (xterm.js의 onData 문자열)
#[tauri::command]
pub fn term_write(state: State<TermState>, data: String) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|e| e.to_string())?;
    let s = slot.as_mut().ok_or_else(|| "터미널이 아직 시작되지 않았습니다".to_string())?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

/// 창 크기가 바뀌면 콘솔 크기도 맞춘다. 세션이 없으면 할 일이 없다.
#[tauri::command]
pub fn term_resize(state: State<TermState>, cols: u16, rows: u16) -> Result<(), String> {
    let slot = state.0.lock().map_err(|e| e.to_string())?;
    match slot.as_ref() {
        Some(s) => s.master.resize(size(cols, rows)).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drain_utf8_keeps_split_hangul_for_next_chunk() {
        let mut pending = "한글".as_bytes().to_vec();
        let tail = pending.split_off(4); // "한" + "글"의 첫 바이트
        assert_eq!(drain_utf8(&mut pending), "한");
        assert_eq!(pending.len(), 1);
        pending.extend_from_slice(&tail);
        assert_eq!(drain_utf8(&mut pending), "글");
        assert!(pending.is_empty());
    }

    #[test]
    fn drain_utf8_flushes_bytes_that_never_become_valid() {
        let mut pending = vec![0xff; 8];
        assert_eq!(drain_utf8(&mut pending).chars().count(), 8);
        assert!(pending.is_empty());
    }
}
