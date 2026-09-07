//! 노트 루트의 JSON 목록 파일(.todos.json 등)을 항목 단위로 고치는 커맨드.
//!
//! 창이 여럿(워크스페이스·오브)이 되면 각 창이 배열 전체를 덮어쓰는 방식으로는
//! 서로의 변경을 지우게 되므로, 변경은 반드시 여기서 항목 단위로 하고 끝나면
//! `<이름>-changed` 이벤트를 모든 창에 보낸다. 항목은 `serde_json::Value`로만 다뤄
//! 프런트가 필드를 추가해도 Rust 쪽 구조체를 손볼 필요가 없다.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, State};

use crate::notes::NotesRoot;

/// 파일 쓰기가 겹치지 않게 하는 잠금. 파일이 작아 목록 전체를 하나로 직렬화해도 충분하다.
pub struct ListLock(pub Mutex<()>);

/// 허용하는 목록 이름 → 파일명. 프런트가 임의 파일을 만들지 못하게 고정한다.
fn file_of(name: &str) -> Result<&'static str, String> {
    match name {
        "todos" => Ok(".todos.json"),
        "events" => Ok(".events.json"),
        _ => Err(format!("알 수 없는 목록입니다: {name}")),
    }
}

fn load(path: &Path) -> Result<Vec<Value>, String> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

/// 임시 파일에 쓴 뒤 바꿔치기해, 쓰는 도중 앱이 죽어도 파일이 반쯤 잘리지 않게 한다.
pub fn save_atomic(path: &Path, value: &impl serde::Serialize) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp: PathBuf = path.with_extension("json.tmp");
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn id_of(item: &Value) -> Option<&str> {
    item.get("id").and_then(Value::as_str)
}

/// 목록을 읽어 고친 뒤 저장하고 변경 이벤트를 보낸다.
fn modify(
    app: &AppHandle,
    root: &Path,
    lock: &ListLock,
    name: &str,
    f: impl FnOnce(&mut Vec<Value>) -> Result<(), String>,
) -> Result<(), String> {
    let path = root.join(file_of(name)?);
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let mut items = load(&path)?;
    f(&mut items)?;
    save_atomic(&path, &items)?;
    let _ = app.emit(&format!("{name}-changed"), ());
    Ok(())
}

/// 순수 함수: patch의 필드를 item에 덮어쓴다. null이면 그 필드를 지운다
/// (JS에서 undefined는 직렬화되지 않으므로 "값 없앰"은 null로 보낸다).
fn merge(item: &mut Map<String, Value>, patch: Map<String, Value>) {
    for (k, v) in patch {
        if v.is_null() {
            item.remove(&k);
        } else {
            item.insert(k, v);
        }
    }
}

/// Rust 안(리마인더 스케줄러 등)에서 목록을 읽을 때
pub fn load_list(root: &Path, name: &str) -> Result<Vec<Value>, String> {
    load(&root.join(file_of(name)?))
}

#[tauri::command]
pub fn list_items(root: State<NotesRoot>, name: String) -> Result<Vec<Value>, String> {
    load_list(&root.0, &name)
}

#[tauri::command]
pub fn list_add(
    app: AppHandle,
    root: State<NotesRoot>,
    lock: State<ListLock>,
    name: String,
    item: Value,
) -> Result<(), String> {
    if id_of(&item).is_none() {
        return Err("id가 없는 항목입니다".into());
    }
    modify(&app, &root.0, &lock, &name, |items| {
        items.push(item);
        Ok(())
    })
}

#[tauri::command]
pub fn list_patch(
    app: AppHandle,
    root: State<NotesRoot>,
    lock: State<ListLock>,
    name: String,
    id: String,
    patch: Value,
) -> Result<(), String> {
    let Value::Object(patch) = patch else {
        return Err("patch는 객체여야 합니다".into());
    };
    modify(&app, &root.0, &lock, &name, |items| {
        let target = items
            .iter_mut()
            .find(|it| id_of(it) == Some(id.as_str()))
            .ok_or_else(|| format!("항목을 찾지 못했습니다: {id}"))?;
        if let Value::Object(obj) = target {
            merge(obj, patch);
        }
        Ok(())
    })
}

#[tauri::command]
pub fn list_remove(
    app: AppHandle,
    root: State<NotesRoot>,
    lock: State<ListLock>,
    name: String,
    id: String,
) -> Result<(), String> {
    modify(&app, &root.0, &lock, &name, |items| {
        items.retain(|it| id_of(it) != Some(id.as_str()));
        Ok(())
    })
}

/// id 항목을 before 항목 앞으로 옮긴다. before가 없으면 맨 뒤로.
#[tauri::command]
pub fn list_move(
    app: AppHandle,
    root: State<NotesRoot>,
    lock: State<ListLock>,
    name: String,
    id: String,
    before: Option<String>,
) -> Result<(), String> {
    modify(&app, &root.0, &lock, &name, |items| {
        move_before(items, &id, before.as_deref())
    })
}

/// 순수 함수: 위치 변경. 대상이 없으면 그대로 둔다.
fn move_before(items: &mut Vec<Value>, id: &str, before: Option<&str>) -> Result<(), String> {
    let Some(from) = items.iter().position(|it| id_of(it) == Some(id)) else {
        return Err(format!("항목을 찾지 못했습니다: {id}"));
    };
    let item = items.remove(from);
    let to = match before {
        Some(b) if b != id => items
            .iter()
            .position(|it| id_of(it) == Some(b))
            .unwrap_or(items.len()),
        _ => items.len(),
    };
    items.insert(to, item);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ids(items: &[Value]) -> Vec<&str> {
        items.iter().map(|i| id_of(i).unwrap()).collect()
    }

    #[test]
    fn merge_overwrites_and_null_removes() {
        let mut item = json!({"id": "a", "text": "x", "start": "2026-01-01"})
            .as_object()
            .cloned()
            .unwrap();
        let patch = json!({"text": "y", "start": null, "time": "09:00"})
            .as_object()
            .cloned()
            .unwrap();
        merge(&mut item, patch);
        assert_eq!(item.get("text").unwrap(), "y");
        assert!(item.get("start").is_none());
        assert_eq!(item.get("time").unwrap(), "09:00");
        assert_eq!(item.get("id").unwrap(), "a"); // 건드리지 않은 필드 유지
    }

    #[test]
    fn move_before_reorders() {
        let mk = || vec![json!({"id": "a"}), json!({"id": "b"}), json!({"id": "c"})];

        let mut items = mk();
        move_before(&mut items, "c", Some("a")).unwrap();
        assert_eq!(ids(&items), ["c", "a", "b"]);

        let mut items = mk();
        move_before(&mut items, "a", None).unwrap();
        assert_eq!(ids(&items), ["b", "c", "a"]);

        let mut items = mk();
        move_before(&mut items, "a", Some("a")).unwrap(); // 자기 자신 앞 = 맨 뒤
        assert_eq!(ids(&items), ["b", "c", "a"]);

        let mut items = mk();
        assert!(move_before(&mut items, "zzz", None).is_err());
    }

    #[test]
    fn unknown_list_is_rejected() {
        assert!(file_of("todos").is_ok());
        assert!(file_of("../secrets").is_err());
    }
}
