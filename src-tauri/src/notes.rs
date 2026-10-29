use std::cmp::Ordering;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::State;

pub const QUICK_MEMO: &str = "QuickMemo.md";

const ASSETS_DIR: &str = ".assets";
const FAVORITES_FILE: &str = ".favorites.json";
const ORDER_FILE: &str = ".order.json";
const SEARCH_LIMIT: usize = 50;

pub struct NotesRoot(pub PathBuf);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    /// 마지막 수정 시각 (epoch 밀리초). 메모 파일에만 채운다.
    #[serde(skip_serializing_if = "Option::is_none")]
    modified: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteTimes {
    created: Option<u64>,
    modified: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    path: String,
    name: String,
    snippet: String,
}

/// 노트 루트 기준 상대 경로만 허용한다 (".."·절대 경로 거부).
fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return Err("절대 경로는 사용할 수 없습니다".into());
    }
    for comp in rel_path.components() {
        if !matches!(comp, Component::Normal(_)) {
            return Err(format!("잘못된 경로입니다: {rel}"));
        }
    }
    Ok(root.join(rel_path))
}

fn ensure_not_quick_memo(path: &str) -> Result<(), String> {
    if path == QUICK_MEMO {
        return Err("빠른 메모는 이동·삭제·이름 변경할 수 없습니다".into());
    }
    Ok(())
}

/// "새 메모 2" < "새 메모 10" 처럼 숫자 구간을 수로 비교한다.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (a, b) = (a.to_lowercase(), b.to_lowercase());
    let (mut ai, mut bi) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (ai.peek().copied(), bi.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(ca), Some(cb)) => {
                if ca.is_ascii_digit() && cb.is_ascii_digit() {
                    let mut na: u128 = 0;
                    while let Some(c) = ai.peek().copied().filter(|c| c.is_ascii_digit()) {
                        na = na.saturating_mul(10).saturating_add(c.to_digit(10).unwrap() as u128);
                        ai.next();
                    }
                    let mut nb: u128 = 0;
                    while let Some(c) = bi.peek().copied().filter(|c| c.is_ascii_digit()) {
                        nb = nb.saturating_mul(10).saturating_add(c.to_digit(10).unwrap() as u128);
                        bi.next();
                    }
                    match na.cmp(&nb) {
                        Ordering::Equal => {}
                        o => return o,
                    }
                } else {
                    match ca.cmp(&cb) {
                        Ordering::Equal => {
                            ai.next();
                            bi.next();
                        }
                        o => return o,
                    }
                }
            }
        }
    }
}

/// 폴더의 수동 표시 순서(.order.json). 없거나 깨졌으면 빈 목록.
fn read_order(dir: &Path) -> Vec<String> {
    fs::read_to_string(dir.join(ORDER_FILE))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_order(dir: &Path, order: &[String]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(order).map_err(|e| e.to_string())?;
    fs::write(dir.join(ORDER_FILE), text).map_err(|e| e.to_string())
}

/// 폴더의 자식 이름을 화면 표시 순서대로 나열한다 (build_tree와 같은 규칙:
/// 수동 순서 우선, 나머지는 폴더 먼저 이름순).
fn display_names(dir: &Path, at_root: bool) -> Result<Vec<String>, String> {
    let mut dirs: Vec<String> = Vec::new();
    let mut files: Vec<String> = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            dirs.push(name);
        } else if name.to_lowercase().ends_with(".md") {
            if at_root && name == QUICK_MEMO {
                continue;
            }
            files.push(name);
        }
    }
    dirs.sort_by(|a, b| natural_cmp(a, b));
    files.sort_by(|a, b| natural_cmp(a, b));
    let mut rest = dirs;
    rest.append(&mut files);

    let order = read_order(dir);
    let mut out = Vec::with_capacity(rest.len());
    for n in &order {
        if let Some(i) = rest.iter().position(|x| x == n) {
            out.push(rest.remove(i));
        }
    }
    out.append(&mut rest);
    Ok(out)
}

/// SystemTime을 화면에서 쓰기 쉬운 epoch 밀리초로 바꾼다 (1970년 이전 등 이상한 값은 버린다)
fn epoch_millis(t: Option<std::time::SystemTime>) -> Option<u64> {
    t?.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as u64)
}

fn build_tree(dir: &Path, rel_prefix: &str) -> Result<Vec<TreeNode>, String> {
    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            let children = build_tree(&entry.path(), &rel)?;
            dirs.push(TreeNode {
                name,
                path: rel,
                is_dir: true,
                modified: None,
                children: Some(children),
            });
        } else if name.to_lowercase().ends_with(".md") {
            // 빠른 메모는 사이드바 고정 항목으로만 노출한다
            if rel_prefix.is_empty() && name == QUICK_MEMO {
                continue;
            }
            files.push(TreeNode {
                name,
                path: rel,
                is_dir: false,
                modified: entry.metadata().ok().and_then(|m| epoch_millis(m.modified().ok())),
                children: None,
            });
        }
    }

    dirs.sort_by(|x, y| natural_cmp(&x.name, &y.name));
    files.sort_by(|x, y| natural_cmp(&x.name, &y.name));
    dirs.append(&mut files);

    // .order.json의 수동 순서를 먼저 적용하고, 목록에 없는 항목은 기본 정렬로 뒤에 붙인다
    let order = read_order(dir);
    if order.is_empty() {
        return Ok(dirs);
    }
    let mut rest = dirs;
    let mut out = Vec::with_capacity(rest.len());
    for n in &order {
        if let Some(i) = rest.iter().position(|x| x.name == *n) {
            out.push(rest.remove(i));
        }
    }
    out.append(&mut rest);
    Ok(out)
}

/// "새 메모.md", "새 메모 2.md"… 식으로 비어 있는 이름을 찾는다.
fn unique_name(
    parent: &Path,
    dir: &str,
    base: &str,
    ext: Option<&str>,
) -> Result<(PathBuf, String), String> {
    for i in 1u32..10_000 {
        let name = match (i, ext) {
            (1, Some(e)) => format!("{base}.{e}"),
            (1, None) => base.to_string(),
            (n, Some(e)) => format!("{base} {n}.{e}"),
            (n, None) => format!("{base} {n}"),
        };
        let candidate = parent.join(&name);
        if !candidate.exists() {
            let rel = if dir.is_empty() {
                name
            } else {
                format!("{dir}/{name}")
            };
            return Ok((candidate, rel));
        }
    }
    Err("사용 가능한 이름을 찾지 못했습니다".into())
}

/// "폴더/메모.md" → "폴더/메모". 하위 페이지 링크([[경로]])와 하위 페이지 폴더는 확장자 없는 이 경로를 쓴다.
fn strip_md(rel: &str) -> &str {
    if rel.to_lowercase().ends_with(".md") {
        &rel[..rel.len() - 3]
    } else {
        rel
    }
}

/// 모든 메모(숨김 폴더 제외)에서 from을 to로 바꾼다. 하위 페이지 링크를 새 경로로 따라가게 할 때 쓴다.
fn replace_in_notes(dir: &Path, from: &str, to: &str) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let p = entry.path();
        if p.is_dir() {
            replace_in_notes(&p, from, to);
        } else if name.to_lowercase().ends_with(".md") {
            if let Ok(text) = fs::read_to_string(&p) {
                if text.contains(from) {
                    let _ = fs::write(&p, text.replace(from, to));
                }
            }
        }
    }
}

/// 메모·폴더의 경로가 바뀐 뒤(이름 변경·이동) 뒤처리. 다른 메모 안의 하위 페이지 링크 [[옛 경로]]를
/// 새 경로로 고치고, 메모라면 그 하위 페이지 폴더(같은 이름의 형제 폴더)도 함께 옮겨 자식 페이지가 따라오게 한다.
fn after_relocate(root: &Path, old_rel: &str, new_rel: &str, is_dir: bool) {
    if is_dir {
        replace_in_notes(root, &format!("[[{old_rel}/"), &format!("[[{new_rel}/"));
        return;
    }
    let (old_key, new_key) = (strip_md(old_rel), strip_md(new_rel));
    replace_in_notes(root, &format!("[[{old_key}]]"), &format!("[[{new_key}]]"));
    let (old_dir, new_dir) = (root.join(old_key), root.join(new_key));
    if old_dir.is_dir() && !new_dir.exists() && fs::rename(&old_dir, &new_dir).is_ok() {
        replace_in_notes(root, &format!("[[{old_key}/"), &format!("[[{new_key}/"));
    }
}

/// 대소문자 무시 부분 문자열 검색. 문자 단위 인덱스를 돌려준다.
fn find_ci(hay: &[char], needle_lower: &[char]) -> Option<usize> {
    if needle_lower.is_empty() || hay.len() < needle_lower.len() {
        return None;
    }
    let hay_lower: Vec<char> = hay
        .iter()
        .map(|c| c.to_lowercase().next().unwrap_or(*c))
        .collect();
    hay_lower
        .windows(needle_lower.len())
        .position(|w| w == needle_lower)
}

fn search_dir(
    dir: &Path,
    rel_prefix: &str,
    q: &[char],
    hits: &mut Vec<SearchHit>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        if hits.len() >= SEARCH_LIMIT {
            return Ok(());
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            search_dir(&entry.path(), &rel, q, hits)?;
        } else if name.to_lowercase().ends_with(".md") {
            let name_chars: Vec<char> = name.chars().collect();
            let content = fs::read_to_string(entry.path()).unwrap_or_default();
            let content_chars: Vec<char> = content.chars().collect();
            if find_ci(&name_chars, q).is_some() {
                let snippet: String = content_chars.iter().take(60).collect();
                hits.push(SearchHit {
                    path: rel,
                    name,
                    snippet: snippet.replace('\n', " "),
                });
            } else if let Some(i) = find_ci(&content_chars, q) {
                let start = i.saturating_sub(30);
                let end = (i + q.len() + 30).min(content_chars.len());
                let snippet: String = content_chars[start..end].iter().collect();
                hits.push(SearchHit {
                    path: rel,
                    name,
                    snippet: snippet.replace('\n', " "),
                });
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn list_tree(root: State<NotesRoot>) -> Result<Vec<TreeNode>, String> {
    build_tree(&root.0, "")
}

/// 메모 하나의 만든 시각·수정 시각 (편집기 헤더 표시용)
#[tauri::command]
pub fn note_times(root: State<NotesRoot>, path: String) -> Result<NoteTimes, String> {
    let meta = fs::metadata(resolve(&root.0, &path)?).map_err(|e| e.to_string())?;
    Ok(NoteTimes {
        created: epoch_millis(meta.created().ok()),
        modified: epoch_millis(meta.modified().ok()),
    })
}

#[tauri::command]
pub fn read_note(root: State<NotesRoot>, path: String) -> Result<String, String> {
    let p = resolve(&root.0, &path)?;
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_note(root: State<NotesRoot>, path: String, content: String) -> Result<(), String> {
    let p = resolve(&root.0, &path)?;
    // 이름 변경·삭제 직후 뒤늦게 도착한 자동 저장이 옛 경로에 파일을 되살리지 않도록
    if !p.is_file() {
        return Err(format!("메모가 존재하지 않습니다: {path}"));
    }
    fs::write(p, content).map_err(|e| e.to_string())
}

/// 새 메모 이름 검증: 공백 제거, 금지 문자 확인, .md 확장자 보장.
fn validate_note_name(name: &str) -> Result<String, String> {
    let mut name = name.trim().to_string();
    if name.is_empty() {
        return Err("이름이 비어 있습니다".into());
    }
    if name.starts_with('.')
        || name
            .chars()
            .any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err("사용할 수 없는 이름입니다".into());
    }
    if !name.to_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    Ok(name)
}

/// 빠른 메모 내용을 지정한 폴더에 새 메모로 저장한다.
/// 내용은 디스크의 QuickMemo.md 대신 프런트가 들고 있는 최신본을 받는다
/// (자동 저장 디바운스로 디스크가 뒤처져 있을 수 있음).
/// rest는 저장하고 난 뒤 빠른 메모에 남길 내용이다 (전체를 옮겼으면 빈 문자열,
/// 선택한 부분만 옮겼으면 나머지).
#[tauri::command]
pub fn save_quick_memo(
    root: State<NotesRoot>,
    dir: String,
    name: String,
    content: String,
    rest: String,
) -> Result<String, String> {
    let parent = resolve(&root.0, &dir)?;
    if !parent.is_dir() {
        return Err(format!("대상 폴더를 찾을 수 없습니다: {dir}"));
    }
    let name = validate_note_name(&name)?;
    let rel = if dir.is_empty() {
        name
    } else {
        format!("{dir}/{name}")
    };
    let dest = resolve(&root.0, &rel)?;
    if dest.exists() {
        return Err("이미 같은 이름이 있습니다".into());
    }
    fs::write(&dest, &content).map_err(|e| e.to_string())?;
    fs::write(root.0.join(QUICK_MEMO), rest).map_err(|e| e.to_string())?;
    Ok(rel)
}

/// 빠른 메모 내용을 이미 있는 메모 끝에 이어 붙인다.
/// block은 프런트가 구분선·날짜까지 붙여 만든 마크다운 조각이고,
/// rest는 붙이고 난 뒤 빠른 메모에 남길 내용이다 (전체를 옮겼으면 빈 문자열,
/// 선택한 부분만 옮겼으면 나머지). 파일이 잠깐 비었다가 다시 차는 일이 없도록
/// 한 번에 기록한다.
#[tauri::command]
pub fn append_quick_memo(
    root: State<NotesRoot>,
    path: String,
    block: String,
    rest: String,
) -> Result<(), String> {
    ensure_not_quick_memo(&path)?;
    let dest = resolve(&root.0, &path)?;
    if !dest.is_file() {
        return Err(format!("메모가 존재하지 않습니다: {path}"));
    }
    let old = fs::read_to_string(&dest).map_err(|e| e.to_string())?;
    // 원래 내용과 새 조각 사이는 빈 줄 하나로 띄운다 (구분선이 앞 문단에 붙어
    // setext 제목으로 해석되는 걸 막는다). 빈 파일이면 앞 여백 없이 시작.
    let old = old.trim_end();
    let text = if old.is_empty() {
        format!("{}\n", block.trim())
    } else {
        format!("{old}\n\n{}\n", block.trim())
    };
    fs::write(&dest, text).map_err(|e| e.to_string())?;
    fs::write(root.0.join(QUICK_MEMO), rest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn create_note(root: State<NotesRoot>, dir: String) -> Result<String, String> {
    let parent = resolve(&root.0, &dir)?;
    let (path, rel) = unique_name(&parent, &dir, "새 메모", Some("md"))?;
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(rel)
}

/// 메모 안에 하위 페이지를 만든다 (노션의 "페이지 안에 페이지"). 자식은 부모와 같은 이름의 형제 폴더에
/// 들어간다: "폴더/회의.md"의 하위 페이지는 "폴더/회의/새 페이지.md". 부모 본문에는 프런트가 [[폴더/회의/새 페이지]]를 넣는다.
#[tauri::command]
pub fn create_subpage(root: State<NotesRoot>, parent: String) -> Result<String, String> {
    if !resolve(&root.0, &parent)?.is_file() {
        return Err(format!("메모가 존재하지 않습니다: {parent}"));
    }
    let dir_rel = strip_md(&parent).to_string();
    let dir_abs = resolve(&root.0, &dir_rel)?;
    fs::create_dir_all(&dir_abs).map_err(|e| e.to_string())?;
    let (path, rel) = unique_name(&dir_abs, &dir_rel, "새 페이지", Some("md"))?;
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(rel)
}

#[tauri::command]
pub fn create_folder(root: State<NotesRoot>, dir: String) -> Result<String, String> {
    let parent = resolve(&root.0, &dir)?;
    let (path, rel) = unique_name(&parent, &dir, "새 폴더", None)?;
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(rel)
}

#[tauri::command]
pub fn rename_entry(root: State<NotesRoot>, path: String, new_name: String) -> Result<String, String> {
    ensure_not_quick_memo(&path)?;
    let src = resolve(&root.0, &path)?;
    if !src.exists() {
        return Err(format!("대상을 찾을 수 없습니다: {path}"));
    }
    let mut name = new_name.trim().to_string();
    if name.is_empty() {
        return Err("이름이 비어 있습니다".into());
    }
    if name.starts_with('.')
        || name
            .chars()
            .any(|c| matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
    {
        return Err("사용할 수 없는 이름입니다".into());
    }
    if src.is_file() && !name.to_lowercase().ends_with(".md") {
        name.push_str(".md");
    }
    let parent_rel = match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    };
    let rel = if parent_rel.is_empty() {
        name
    } else {
        format!("{parent_rel}/{name}")
    };
    if rel == path {
        return Ok(path);
    }
    let dest = resolve(&root.0, &rel)?;
    // 대소문자만 바꾸는 경우는 Windows에서 dest가 이미 "존재"하므로 예외 허용
    if dest.exists() && rel.to_lowercase() != path.to_lowercase() {
        return Err("이미 같은 이름이 있습니다".into());
    }
    let is_dir = src.is_dir();
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    after_relocate(&root.0, &path, &rel, is_dir);
    // 수동 순서 목록에 있던 항목이면 새 이름으로 교체해 위치를 유지한다
    if let Ok(parent_abs) = resolve(&root.0, parent_rel) {
        let old_name = path.rsplit('/').next().unwrap_or(&path);
        let new_name = rel.rsplit('/').next().unwrap_or(&rel);
        let mut order = read_order(&parent_abs);
        if let Some(i) = order.iter().position(|n| n == old_name) {
            order[i] = new_name.to_string();
            let _ = write_order(&parent_abs, &order);
        }
    }
    Ok(rel)
}

#[tauri::command]
pub fn move_entry(root: State<NotesRoot>, path: String, dir: String) -> Result<String, String> {
    ensure_not_quick_memo(&path)?;
    let src = resolve(&root.0, &path)?;
    if !src.exists() {
        return Err(format!("대상을 찾을 수 없습니다: {path}"));
    }
    // 폴더를 자기 자신·하위로 옮기는 것 금지
    if dir == path || dir.starts_with(&format!("{path}/")) {
        return Err("폴더를 자기 안으로 옮길 수 없습니다".into());
    }
    let parent = resolve(&root.0, &dir)?;
    if !parent.is_dir() {
        return Err(format!("대상 폴더를 찾을 수 없습니다: {dir}"));
    }
    let src_parent = match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    };
    if src_parent == dir {
        return Ok(path);
    }
    let (dest, rel) = if src.is_dir() {
        let name = src
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        unique_name(&parent, &dir, &name, None)?
    } else {
        let stem = src
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = src
            .extension()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_else(|| "md".into());
        unique_name(&parent, &dir, &stem, Some(&ext))?
    };
    let is_dir = src.is_dir();
    fs::rename(&src, &dest).map_err(|e| e.to_string())?;
    after_relocate(&root.0, &path, &rel, is_dir);
    // 원래 폴더의 수동 순서 목록에서 제거 (옮겨간 폴더에서는 기본 정렬 위치에 놓인다)
    if let Ok(old_parent_abs) = resolve(&root.0, src_parent) {
        let old_name = path.rsplit('/').next().unwrap_or(&path);
        let order = read_order(&old_parent_abs);
        if order.iter().any(|n| n == old_name) {
            let filtered: Vec<String> = order.into_iter().filter(|n| n != old_name).collect();
            let _ = write_order(&old_parent_abs, &filtered);
        }
    }
    Ok(rel)
}

/// 항목을 지정 폴더의 지정 위치로 옮긴다 (드래그 순서 변경).
/// index는 대상 폴더 표시 순서에서 "옮기는 항목을 뺀" 목록 기준 삽입 위치.
#[tauri::command]
pub fn reorder_entry(
    root: State<NotesRoot>,
    path: String,
    dir: String,
    index: usize,
) -> Result<String, String> {
    ensure_not_quick_memo(&path)?;
    if path.is_empty() {
        return Err("잘못된 경로입니다".into());
    }
    let src = resolve(&root.0, &path)?;
    if !src.exists() {
        return Err(format!("대상을 찾을 수 없습니다: {path}"));
    }
    if dir == path || dir.starts_with(&format!("{path}/")) {
        return Err("폴더를 자기 안으로 옮길 수 없습니다".into());
    }
    let parent = resolve(&root.0, &dir)?;
    if !parent.is_dir() {
        return Err(format!("대상 폴더를 찾을 수 없습니다: {dir}"));
    }
    let src_parent = match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    };

    // 다른 폴더로 가는 경우 실제 파일 이동 (이름 충돌 시 " 2" 접미사)
    let rel = if src_parent == dir {
        path.clone()
    } else {
        let (dest, rel) = if src.is_dir() {
            let name = src
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            unique_name(&parent, &dir, &name, None)?
        } else {
            let stem = src
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let ext = src
                .extension()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "md".into());
            unique_name(&parent, &dir, &stem, Some(&ext))?
        };
        let is_dir = src.is_dir();
        fs::rename(&src, &dest).map_err(|e| e.to_string())?;
        after_relocate(&root.0, &path, &rel, is_dir);
        // 원래 폴더의 순서 목록에서 제거
        if let Ok(old_parent) = resolve(&root.0, src_parent) {
            let old_name = path.rsplit('/').next().unwrap_or(&path);
            let order = read_order(&old_parent);
            if order.iter().any(|n| n == old_name) {
                let filtered: Vec<String> =
                    order.into_iter().filter(|n| n != old_name).collect();
                let _ = write_order(&old_parent, &filtered);
            }
        }
        rel
    };

    // 현재 표시 순서에서 자신을 뺀 뒤 원하는 위치에 삽입해 순서를 고정한다
    let name = rel.rsplit('/').next().unwrap_or(&rel).to_string();
    let mut names = display_names(&parent, dir.is_empty())?;
    names.retain(|n| *n != name);
    let i = index.min(names.len());
    names.insert(i, name);
    write_order(&parent, &names)?;
    Ok(rel)
}

#[tauri::command]
pub fn delete_entry(root: State<NotesRoot>, path: String) -> Result<(), String> {
    ensure_not_quick_memo(&path)?;
    // 빈 경로는 노트 루트 자체를 가리키므로 거부
    if path.is_empty() {
        return Err("잘못된 경로입니다".into());
    }
    let p = resolve(&root.0, &path)?;
    if !p.exists() {
        return Err(format!("대상을 찾을 수 없습니다: {path}"));
    }
    // 영구 삭제 대신 Windows 휴지통으로 이동 (폴더는 내용물 포함, 복원 가능)
    trash::delete(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_entry(root: State<NotesRoot>, path: String) -> Result<(), String> {
    let target = resolve(&root.0, &path)?;
    let items = trash::os_limited::list().map_err(|e| e.to_string())?;
    let mut candidates: Vec<_> = items
        .into_iter()
        .filter(|i| i.original_path() == target)
        .collect();
    if candidates.is_empty() {
        return Err("휴지통에서 항목을 찾지 못했습니다".into());
    }
    candidates.sort_by_key(|i| i.time_deleted);
    let latest = candidates.pop().unwrap();
    trash::os_limited::restore_all([latest]).map_err(|e| e.to_string())
}

/// 붙여넣은 이미지를 숨김 폴더(.assets)에 저장하고 상대 경로를 돌려준다.
/// 이름은 img-1.png, img-2.png… 식으로 빈 번호를 찾는다 (마크다운 링크가
/// 깨지지 않도록 공백 없는 ASCII 이름만 쓴다).
#[tauri::command]
pub fn save_image(root: State<NotesRoot>, data: Vec<u8>, ext: String) -> Result<String, String> {
    if !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
    ) {
        return Err(format!("지원하지 않는 이미지 형식입니다: {ext}"));
    }
    write_asset(&root.0, &data, &ext)
}

/// 붙여넣기·화면 캡처 공용: .assets에 빈 번호로 저장하고 상대 경로를 돌려준다
pub fn write_asset(root: &Path, data: &[u8], ext: &str) -> Result<String, String> {
    if data.is_empty() {
        return Err("이미지 데이터가 비어 있습니다".into());
    }
    let assets = root.join(ASSETS_DIR);
    fs::create_dir_all(&assets).map_err(|e| e.to_string())?;
    for i in 1u32..1_000_000 {
        let name = format!("img-{i}.{ext}");
        let p = assets.join(&name);
        if !p.exists() {
            fs::write(&p, data).map_err(|e| e.to_string())?;
            return Ok(format!("{ASSETS_DIR}/{name}"));
        }
    }
    Err("사용 가능한 이름을 찾지 못했습니다".into())
}

/// 즐겨찾기한 메모의 상대경로 목록. 배열 순서가 곧 표시 순서다.
#[tauri::command]
pub fn read_favorites(root: State<NotesRoot>) -> Result<Vec<String>, String> {
    let p = root.0.join(FAVORITES_FILE);
    if !p.exists() {
        return Ok(vec![]);
    }
    let text = fs::read_to_string(p).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_favorites(root: State<NotesRoot>, favorites: Vec<String>) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&favorites).map_err(|e| e.to_string())?;
    fs::write(root.0.join(FAVORITES_FILE), text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_notes(root: State<NotesRoot>, query: String) -> Result<Vec<SearchHit>, String> {
    let q: Vec<char> = query
        .trim()
        .chars()
        .map(|c| c.to_lowercase().next().unwrap_or(c))
        .collect();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let mut hits = Vec::new();
    search_dir(&root.0, "", &q, &mut hits)?;
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_rejects_escape() {
        let root = Path::new("C:\\notes-root");
        assert!(resolve(root, "..").is_err());
        assert!(resolve(root, "a/../b.md").is_err());
        assert!(resolve(root, "C:\\windows\\evil.md").is_err());
        assert!(resolve(root, "폴더/메모.md").is_ok());
        assert!(resolve(root, "").is_ok()); // 루트 자신 (list/create 용)
    }

    #[test]
    fn natural_sort_order() {
        assert_eq!(natural_cmp("새 메모 2", "새 메모 10"), Ordering::Less);
        assert_eq!(natural_cmp("새 메모 10", "새 메모 2"), Ordering::Greater);
        assert_eq!(natural_cmp("a2b", "a10b"), Ordering::Less);
        assert_eq!(natural_cmp("메모", "메모"), Ordering::Equal);
        assert_eq!(natural_cmp("B", "a"), Ordering::Greater); // 대소문자 무시
    }

    #[test]
    fn unique_name_appends_suffix() {
        let dir = std::env::temp_dir().join("orbit-test-unique");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let (p1, r1) = unique_name(&dir, "", "새 메모", Some("md")).unwrap();
        assert_eq!(r1, "새 메모.md");
        fs::write(&p1, "").unwrap();

        let (p2, r2) = unique_name(&dir, "", "새 메모", Some("md")).unwrap();
        assert_eq!(r2, "새 메모 2.md");
        fs::write(&p2, "").unwrap();

        let (_, r3) = unique_name(&dir, "sub", "새 메모", Some("md")).unwrap();
        assert_eq!(r3, "sub/새 메모 3.md");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn order_file_controls_display_order() {
        let dir = std::env::temp_dir().join("orbit-test-order");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("폴더C")).unwrap();
        fs::write(dir.join("a.md"), "").unwrap();
        fs::write(dir.join("b.md"), "").unwrap();
        fs::write(dir.join(QUICK_MEMO), "").unwrap();

        // 순서 파일 없음: 폴더 먼저, 이름순. 루트에서는 빠른 메모 제외
        assert_eq!(
            display_names(&dir, true).unwrap(),
            vec!["폴더C", "a.md", "b.md"]
        );

        // 순서 파일의 순서 우선, 없는 항목은 기본 정렬로 뒤에
        write_order(&dir, &["b.md".to_string(), "폴더C".to_string()]).unwrap();
        assert_eq!(
            display_names(&dir, true).unwrap(),
            vec!["b.md", "폴더C", "a.md"]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn validate_note_name_rules() {
        assert_eq!(validate_note_name(" 회의록 ").unwrap(), "회의록.md");
        assert_eq!(validate_note_name("memo.MD").unwrap(), "memo.MD");
        assert!(validate_note_name("").is_err());
        assert!(validate_note_name("   ").is_err());
        assert!(validate_note_name("a/b").is_err());
        assert!(validate_note_name(".hidden").is_err());
    }

    #[test]
    fn relocate_follows_subpage_links_and_folder() {
        let root = std::env::temp_dir().join("orbit-test-relocate");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("회의")).unwrap();
        fs::write(root.join("회의.md"), "[[회의/안건]]\n").unwrap();
        fs::write(root.join("회의/안건.md"), "[[회의/안건/세부]]\n").unwrap();
        fs::write(root.join("홈.md"), "[[회의]] [[회의/안건]]\n").unwrap();

        // 메모 이름 변경: 링크가 따라오고 하위 페이지 폴더도 같이 옮겨진다
        fs::rename(root.join("회의.md"), root.join("주간회의.md")).unwrap();
        after_relocate(&root, "회의.md", "주간회의.md", false);
        assert!(root.join("주간회의").is_dir());
        assert!(!root.join("회의").exists());
        assert_eq!(
            fs::read_to_string(root.join("홈.md")).unwrap(),
            "[[주간회의]] [[주간회의/안건]]\n"
        );
        assert_eq!(
            fs::read_to_string(root.join("주간회의/안건.md")).unwrap(),
            "[[주간회의/안건/세부]]\n"
        );

        // 폴더 이름 변경: 그 안을 가리키는 링크만 바뀐다
        fs::rename(root.join("주간회의"), root.join("기록")).unwrap();
        after_relocate(&root, "주간회의", "기록", true);
        assert_eq!(
            fs::read_to_string(root.join("홈.md")).unwrap(),
            "[[주간회의]] [[기록/안건]]\n"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn strip_md_drops_extension_only() {
        assert_eq!(strip_md("폴더/메모.md"), "폴더/메모");
        assert_eq!(strip_md("memo.MD"), "memo");
        assert_eq!(strip_md("폴더"), "폴더");
    }

    #[test]
    fn quick_memo_is_protected() {
        assert!(ensure_not_quick_memo(QUICK_MEMO).is_err());
        assert!(ensure_not_quick_memo("일반 메모.md").is_ok());
    }

    #[test]
    fn find_ci_matches_korean_and_case() {
        let hay: Vec<char> = "안녕 Hello World".chars().collect();
        let q1: Vec<char> = "hello".chars().collect();
        let q2: Vec<char> = "안녕".chars().collect();
        assert!(find_ci(&hay, &q1).is_some());
        assert_eq!(find_ci(&hay, &q2), Some(0));
    }
}
