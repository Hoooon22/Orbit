//! 구글 캘린더 읽기 연동. 계정을 여러 개 연결할 수 있다.
//!
//! - 로그인: OAuth 2.0 데스크톱 앱 흐름(PKCE + 127.0.0.1 임시 포트로 되돌아오는 코드).
//!   브라우저를 열고, 로컬 소켓에서 코드를 받아 토큰으로 바꾼다. 토큰은 웹뷰에 주지 않고 여기서만 다룬다.
//! - 동기화: 15분마다(그리고 요청 시) 켜 둔 캘린더의 일정을 지난 60일~앞으로 180일 범위로 받아
//!   로컬 데이터 폴더에 캐시한다. 반복 일정은 구글이 펼쳐 준다(singleEvents).
//! - 클라이언트 ID·비밀번호는 사용자가 Google Cloud Console에서 만든 "데스크톱 앱" 것을 설정에 넣는다.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::Digest;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::store::save_atomic;

const FILE: &str = "google.json";
const EVENTS_FILE: &str = "google-events.json";
const SCOPES: &str =
    "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email";
const SYNC_EVERY: Duration = Duration::from_secs(15 * 60);
const PAST_DAYS: i64 = 60;
const FUTURE_DAYS: i64 = 180;
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GCalendar {
    pub id: String,
    pub summary: String,
    pub color: Option<String>,
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct GAccount {
    email: String,
    refresh_token: String,
    calendars: Vec<GCalendar>,
}

/// 프런트에 보여 주는 계정 정보 (토큰 제외)
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GAccountView {
    email: String,
    calendars: Vec<GCalendar>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct GoogleFile {
    client_id: String,
    client_secret: String,
    accounts: Vec<GAccount>,
    last_sync: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GEvent {
    pub id: String,
    pub title: String,
    pub date: String, // YYYY-MM-DD (현지)
    pub end_date: Option<String>,
    pub time: Option<String>, // HH:MM. 없으면 종일
    pub end_time: Option<String>,
    pub account: String,
    pub calendar: String,
    pub color: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    configured: bool,
    accounts: Vec<GAccountView>,
    last_sync: Option<u64>,
    error: Option<String>,
}

pub struct GoogleState {
    file: Mutex<GoogleFile>,
    events: Mutex<Vec<GEvent>>,
    /// email → (access_token, 만료 시각). 파일에는 refresh_token만 둔다.
    tokens: Mutex<HashMap<String, (String, Instant)>>,
    error: Mutex<Option<String>>,
    path: PathBuf,
    events_path: PathBuf,
}

impl GoogleState {
    pub fn load(local: &Path) -> Self {
        let read = |p: &Path| std::fs::read_to_string(p).ok();
        let file = read(&local.join(FILE))
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        let events = read(&local.join(EVENTS_FILE))
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Self {
            file: Mutex::new(file),
            events: Mutex::new(events),
            tokens: Mutex::new(HashMap::new()),
            error: Mutex::new(None),
            path: local.join(FILE),
            events_path: local.join(EVENTS_FILE),
        }
    }

    fn save_file(&self, file: &GoogleFile) {
        if let Some(dir) = self.path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = save_atomic(&self.path, file);
    }

    fn has_accounts(&self) -> bool {
        self.file.lock().map(|f| !f.accounts.is_empty()).unwrap_or(false)
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// PKCE: 무작위 verifier와 그 SHA-256 해시(challenge)
fn random_bytes<const N: usize>() -> [u8; N] {
    use rand::RngCore;
    let mut raw = [0u8; N];
    rand::thread_rng().fill_bytes(&mut raw);
    raw
}

fn pkce() -> (String, String) {
    let verifier = b64url(&random_bytes::<48>());
    let challenge = b64url(&sha2::Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// 토큰 응답의 access_token·expires_in
fn parse_token(v: &Value) -> Result<(String, Duration), String> {
    let access = v
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("토큰 응답에 access_token이 없습니다: {v}"))?;
    let secs = v.get("expires_in").and_then(Value::as_u64).unwrap_or(3600);
    Ok((access.to_string(), Duration::from_secs(secs)))
}

/// 유효한 access token. 만료가 가까우면 refresh_token으로 새로 받는다.
fn access_token(state: &GoogleState, email: &str) -> Result<String, String> {
    if let Ok(tokens) = state.tokens.lock() {
        if let Some((tok, exp)) = tokens.get(email) {
            if *exp > Instant::now() + Duration::from_secs(60) {
                return Ok(tok.clone());
            }
        }
    }
    let (client_id, client_secret, refresh) = {
        let f = state.file.lock().map_err(|e| e.to_string())?;
        let acc = f
            .accounts
            .iter()
            .find(|a| a.email == email)
            .ok_or("연결되지 않은 계정입니다")?;
        (f.client_id.clone(), f.client_secret.clone(), acc.refresh_token.clone())
    };
    let v: Value = http()?
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let (tok, ttl) = parse_token(&v).map_err(|e| {
        format!("{email} 토큰 갱신 실패 — 설정에서 계정을 다시 연결해 주세요 ({e})")
    })?;
    if let Ok(mut tokens) = state.tokens.lock() {
        tokens.insert(email.to_string(), (tok.clone(), Instant::now() + ttl));
    }
    Ok(tok)
}

fn get_json(token: &str, url: reqwest::Url) -> Result<Value, String> {
    let res = http()?
        .get(url)
        .bearer_auth(token)
        .send()
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("구글 응답 {}: {}", res.status(), res.text().unwrap_or_default()));
    }
    res.json().map_err(|e| e.to_string())
}

fn fetch_calendars(token: &str) -> Result<Vec<GCalendar>, String> {
    let url = reqwest::Url::parse("https://www.googleapis.com/calendar/v3/users/me/calendarList")
        .map_err(|e| e.to_string())?;
    let v = get_json(token, url)?;
    Ok(v["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|c| {
                    Some(GCalendar {
                        id: c.get("id")?.as_str()?.to_string(),
                        summary: c
                            .get("summaryOverride")
                            .or(c.get("summary"))
                            .and_then(Value::as_str)
                            .unwrap_or("(이름 없음)")
                            .to_string(),
                        color: c.get("backgroundColor").and_then(Value::as_str).map(str::to_string),
                        // 구글에서 표시해 둔 캘린더만 기본으로 켠다
                        enabled: c.get("selected").and_then(Value::as_bool).unwrap_or(false),
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// 브라우저 로그인 → 코드 → 토큰 → 이메일·캘린더 목록. 성공하면 이메일을 돌려준다.
fn connect(app: &AppHandle, state: &GoogleState) -> Result<String, String> {
    let (client_id, client_secret) = {
        let f = state.file.lock().map_err(|e| e.to_string())?;
        (f.client_id.trim().to_string(), f.client_secret.trim().to_string())
    };
    if client_id.is_empty() || client_secret.is_empty() {
        return Err("먼저 설정에 Google OAuth 클라이언트 ID와 비밀번호를 넣어 주세요.".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let (verifier, challenge) = pkce();
    let state_token = b64url(&random_bytes::<16>());

    let auth = reqwest::Url::parse_with_params(
        "https://accounts.google.com/o/oauth2/v2/auth",
        &[
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("response_type", "code"),
            ("scope", SCOPES),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("access_type", "offline"),
            // 두 계정을 번갈아 붙일 수 있게 계정 선택 화면을 매번 띄우고, refresh_token을 확실히 받는다
            ("prompt", "consent select_account"),
            ("state", state_token.as_str()),
        ],
    )
    .map_err(|e| e.to_string())?;
    app.opener()
        .open_url(auth.as_str(), None::<&str>)
        .map_err(|e| e.to_string())?;

    // 브라우저가 되돌아올 때까지 기다린다 (최대 3분)
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    let code = loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).unwrap_or(0);
                let req = String::from_utf8_lossy(&buf[..n]).to_string();
                let path = req.lines().next().and_then(|l| l.split(' ').nth(1)).unwrap_or("/");
                let url = reqwest::Url::parse(&format!("http://127.0.0.1{path}"))
                    .map_err(|e| e.to_string())?;
                let q: HashMap<String, String> = url.query_pairs().into_owned().collect();
                let (title, body, result) = if q.get("state") != Some(&state_token) {
                    ("Orbit", "잘못된 요청입니다.", Err("state 불일치".to_string()))
                } else if let Some(err) = q.get("error") {
                    ("Orbit", "로그인이 취소됐습니다. 이 창을 닫아도 됩니다.", Err(format!("구글 로그인 실패: {err}")))
                } else if let Some(code) = q.get("code") {
                    ("Orbit", "연결됐습니다. 이 창을 닫고 Orbit으로 돌아가세요.", Ok(code.clone()))
                } else {
                    // 파비콘 등 다른 요청은 무시하고 계속 기다린다
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                };
                let html = format!(
                    "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"><title>{title}</title></head>\
                     <body style=\"font-family:sans-serif;padding:40px;text-align:center\"><h2>{body}</h2></body></html>"
                );
                let _ = stream.write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        html.len(),
                        html
                    )
                    .as_bytes(),
                );
                break result?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("로그인을 기다리다 시간이 지났습니다. 다시 시도해 주세요.".into());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.to_string()),
        }
    };

    let v: Value = http()?
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let (access, ttl) = parse_token(&v)?;
    let refresh = v
        .get("refresh_token")
        .and_then(Value::as_str)
        .ok_or("refresh_token을 받지 못했습니다. 다시 시도해 주세요.")?
        .to_string();

    let me = get_json(
        &access,
        reqwest::Url::parse("https://www.googleapis.com/oauth2/v3/userinfo").map_err(|e| e.to_string())?,
    )?;
    let email = me
        .get("email")
        .and_then(Value::as_str)
        .ok_or("이메일을 확인하지 못했습니다")?
        .to_string();
    let calendars = fetch_calendars(&access)?;

    {
        let mut f = state.file.lock().map_err(|e| e.to_string())?;
        f.accounts.retain(|a| a.email != email);
        f.accounts.push(GAccount { email: email.clone(), refresh_token: refresh, calendars });
        state.save_file(&f);
    }
    if let Ok(mut tokens) = state.tokens.lock() {
        tokens.insert(email.clone(), (access, Instant::now() + ttl));
    }
    let _ = app.emit("google-changed", ());
    Ok(email)
}

/// 구글 일정 하나를 우리 형식으로. 시각은 현지 시간대로, 종일 일정의 끝 날짜(배타적)는 하루 당긴다.
fn map_event(item: &Value, account: &str, calendar: &GCalendar) -> Option<GEvent> {
    use chrono::{DateTime, Local, NaiveDate};
    if item.get("status").and_then(Value::as_str) == Some("cancelled") {
        return None;
    }
    let id = item.get("id")?.as_str()?;
    let title = item
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("(제목 없음)")
        .to_string();
    let start = item.get("start")?;
    let end = item.get("end");

    let (date, time) = if let Some(d) = start.get("date").and_then(Value::as_str) {
        (d.to_string(), None)
    } else {
        let dt = DateTime::parse_from_rfc3339(start.get("dateTime")?.as_str()?).ok()?;
        let local = dt.with_timezone(&Local);
        (local.format("%Y-%m-%d").to_string(), Some(local.format("%H:%M").to_string()))
    };
    let (mut end_date, end_time) = match end {
        Some(e) => {
            if let Some(d) = e.get("date").and_then(Value::as_str) {
                // 종일 일정의 end.date는 다음 날(배타적)
                let last = NaiveDate::parse_from_str(d, "%Y-%m-%d")
                    .ok()
                    .and_then(|nd| nd.pred_opt())
                    .map(|nd| nd.format("%Y-%m-%d").to_string());
                (last, None)
            } else if let Some(s) = e.get("dateTime").and_then(Value::as_str) {
                let local = DateTime::parse_from_rfc3339(s).ok()?.with_timezone(&Local);
                (
                    Some(local.format("%Y-%m-%d").to_string()),
                    Some(local.format("%H:%M").to_string()),
                )
            } else {
                (None, None)
            }
        }
        None => (None, None),
    };
    if end_date.as_deref() == Some(date.as_str()) {
        end_date = None;
    }
    Some(GEvent {
        id: format!("g:{account}:{id}"),
        title,
        date,
        end_date,
        time,
        end_time,
        account: account.to_string(),
        calendar: calendar.summary.clone(),
        color: calendar.color.clone(),
    })
}

fn fetch_events(token: &str, account: &str, cal: &GCalendar) -> Result<Vec<GEvent>, String> {
    use chrono::{Duration as CDur, SecondsFormat, Utc};
    let now = Utc::now();
    let time_min = (now - CDur::days(PAST_DAYS)).to_rfc3339_opts(SecondsFormat::Secs, true);
    let time_max = (now + CDur::days(FUTURE_DAYS)).to_rfc3339_opts(SecondsFormat::Secs, true);
    let base = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events",
        reqwest::Url::parse("http://x/")
            .unwrap()
            .join(&cal.id)
            .map(|u| u.path().trim_start_matches('/').to_string())
            .unwrap_or_else(|_| cal.id.clone())
    );
    let mut out = Vec::new();
    let mut page: Option<String> = None;
    loop {
        let mut params = vec![
            ("timeMin", time_min.clone()),
            ("timeMax", time_max.clone()),
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
            ("maxResults", "2500".to_string()),
        ];
        if let Some(p) = &page {
            params.push(("pageToken", p.clone()));
        }
        let url = reqwest::Url::parse_with_params(&base, &params).map_err(|e| e.to_string())?;
        let v = get_json(token, url)?;
        if let Some(items) = v["items"].as_array() {
            out.extend(items.iter().filter_map(|i| map_event(i, account, cal)));
        }
        match v.get("nextPageToken").and_then(Value::as_str) {
            Some(t) => page = Some(t.to_string()),
            None => break,
        }
    }
    Ok(out)
}

/// 켜 둔 캘린더 전부 다시 받기. 계정 하나가 실패해도 나머지는 반영하고, 실패는 상태에 남긴다.
pub fn sync_all(app: &AppHandle, state: &GoogleState) -> Result<usize, String> {
    let accounts: Vec<GAccount> = state
        .file
        .lock()
        .map_err(|e| e.to_string())?
        .accounts
        .clone();
    if accounts.is_empty() {
        return Ok(0);
    }
    let mut all = Vec::new();
    let mut errors = Vec::new();
    for acc in &accounts {
        let token = match access_token(state, &acc.email) {
            Ok(t) => t,
            Err(e) => {
                errors.push(e);
                continue;
            }
        };
        for cal in acc.calendars.iter().filter(|c| c.enabled) {
            match fetch_events(&token, &acc.email, cal) {
                Ok(evs) => all.extend(evs),
                Err(e) => errors.push(format!("{} / {}: {e}", acc.email, cal.summary)),
            }
        }
    }
    let count = all.len();
    if let Ok(mut evs) = state.events.lock() {
        *evs = all.clone();
    }
    let _ = save_atomic(&state.events_path, &all);
    if let Ok(mut f) = state.file.lock() {
        f.last_sync = Some(now_ms());
        state.save_file(&f);
    }
    if let Ok(mut e) = state.error.lock() {
        *e = if errors.is_empty() { None } else { Some(errors.join("\n")) };
    }
    let _ = app.emit("google-events-changed", ());
    let _ = app.emit("google-changed", ());
    if errors.len() == accounts.len() && count == 0 {
        return Err(errors.join("\n"));
    }
    Ok(count)
}

/// 시작 30초 뒤 한 번, 이후 15분마다 동기화
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        loop {
            if let Some(state) = app.try_state::<GoogleState>() {
                if state.has_accounts() {
                    let _ = sync_all(&app, &state);
                }
            }
            std::thread::sleep(SYNC_EVERY);
        }
    });
}

fn sync_in_background(app: AppHandle) {
    std::thread::spawn(move || {
        if let Some(state) = app.try_state::<GoogleState>() {
            let _ = sync_all(&app, &state);
        }
    });
}

#[tauri::command]
pub fn google_status(state: State<GoogleState>) -> Result<GoogleStatus, String> {
    let f = state.file.lock().map_err(|e| e.to_string())?;
    Ok(GoogleStatus {
        configured: !f.client_id.trim().is_empty() && !f.client_secret.trim().is_empty(),
        accounts: f
            .accounts
            .iter()
            .map(|a| GAccountView { email: a.email.clone(), calendars: a.calendars.clone() })
            .collect(),
        last_sync: f.last_sync,
        error: state.error.lock().ok().and_then(|e| e.clone()),
    })
}

#[tauri::command]
pub fn google_set_client(
    app: AppHandle,
    state: State<GoogleState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    let mut f = state.file.lock().map_err(|e| e.to_string())?;
    f.client_id = client_id.trim().to_string();
    f.client_secret = client_secret.trim().to_string();
    state.save_file(&f);
    let _ = app.emit("google-changed", ());
    Ok(())
}

/// 브라우저 로그인. 네트워크·대기가 있으므로 별도 스레드에서 돈다.
#[tauri::command(async)]
pub fn google_connect(app: AppHandle, state: State<GoogleState>) -> Result<String, String> {
    let email = connect(&app, &state)?;
    sync_in_background(app.clone());
    Ok(email)
}

#[tauri::command]
pub fn google_disconnect(app: AppHandle, state: State<GoogleState>, email: String) -> Result<(), String> {
    {
        let mut f = state.file.lock().map_err(|e| e.to_string())?;
        f.accounts.retain(|a| a.email != email);
        state.save_file(&f);
    }
    if let Ok(mut t) = state.tokens.lock() {
        t.remove(&email);
    }
    // 그 계정의 일정은 바로 치운다
    if let Ok(mut evs) = state.events.lock() {
        evs.retain(|e| e.account != email);
        let _ = save_atomic(&state.events_path, &*evs);
    }
    let _ = app.emit("google-events-changed", ());
    let _ = app.emit("google-changed", ());
    Ok(())
}

#[tauri::command]
pub fn google_set_calendar_enabled(
    app: AppHandle,
    state: State<GoogleState>,
    email: String,
    calendar_id: String,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut f = state.file.lock().map_err(|e| e.to_string())?;
        if let Some(cal) = f
            .accounts
            .iter_mut()
            .find(|a| a.email == email)
            .and_then(|a| a.calendars.iter_mut().find(|c| c.id == calendar_id))
        {
            cal.enabled = enabled;
        }
        state.save_file(&f);
    }
    let _ = app.emit("google-changed", ());
    sync_in_background(app);
    Ok(())
}

#[tauri::command(async)]
pub fn google_sync(app: AppHandle, state: State<GoogleState>) -> Result<usize, String> {
    sync_all(&app, &state)
}

#[tauri::command]
pub fn google_events(state: State<GoogleState>) -> Result<Vec<GEvent>, String> {
    Ok(state.events.lock().map_err(|e| e.to_string())?.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cal() -> GCalendar {
        GCalendar { id: "c".into(), summary: "일".into(), color: Some("#fff".into()), enabled: true }
    }

    #[test]
    fn all_day_event_end_is_exclusive() {
        let item = json!({"id": "e1", "summary": "여행", "start": {"date": "2026-09-10"}, "end": {"date": "2026-09-13"}});
        let ev = map_event(&item, "a@x", &cal()).unwrap();
        assert_eq!(ev.date, "2026-09-10");
        assert_eq!(ev.end_date.as_deref(), Some("2026-09-12"));
        assert!(ev.time.is_none());
        assert_eq!(ev.id, "g:a@x:e1");
    }

    #[test]
    fn single_day_all_day_has_no_end() {
        let item = json!({"id": "e2", "summary": "생일", "start": {"date": "2026-09-10"}, "end": {"date": "2026-09-11"}});
        let ev = map_event(&item, "a@x", &cal()).unwrap();
        assert!(ev.end_date.is_none());
    }

    #[test]
    fn timed_event_uses_local_time_and_skips_cancelled() {
        let item = json!({"id": "e3", "summary": "회의", "start": {"dateTime": "2026-09-10T15:00:00+09:00"}, "end": {"dateTime": "2026-09-10T16:30:00+09:00"}});
        let ev = map_event(&item, "a@x", &cal()).unwrap();
        assert!(ev.time.is_some());
        assert!(ev.end_time.is_some());
        let gone = json!({"id": "e4", "status": "cancelled", "start": {"date": "2026-09-10"}});
        assert!(map_event(&gone, "a@x", &cal()).is_none());
    }

    #[test]
    fn pkce_challenge_is_sha256_of_verifier() {
        let (v, c) = pkce();
        assert_eq!(c, b64url(&sha2::Sha256::digest(v.as_bytes())));
        assert!(v.len() >= 43);
    }
}
