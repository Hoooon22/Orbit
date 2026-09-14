//! 회의 모드. "지금 진행 중인 일정"이 있으면 할 일 알림을 미루고 오브에 회의 표시를 켠다.
//! 판정은 reminders.rs의 분 스케줄러에 얹어 Rust가 한다 — 알림 게이트와 트레이 체크가 Rust에 있고,
//! 웹뷰 타이머는 창이 숨겨지면 느려지며 창이 둘이면 서로 다른 답을 낼 수 있기 때문이다.
//!
//! 진행 중 = 시각이 있는 일정(종일 제외)이고 start <= now < end. 23시간 이상은 종일로 취급해 제외.
//! 구글 일정은 프런트와 같은 규칙으로 숨김 단어를 존중한다(로컬 일정에는 적용하지 않는다).

use std::sync::Mutex;

use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::google::GEvent;
use crate::notes::NotesRoot;
use crate::settings::{Settings, SettingsState};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub end_label: String, // "HH:MM"
}

pub struct MeetingState(pub Mutex<Option<Meeting>>);

/// 로컬·구글 일정을 같은 모양으로
struct Slot {
    id: String,
    title: String,
    date: String,
    end_date: Option<String>,
    time: Option<String>,
    end_time: Option<String>,
    yearly: bool,
    google: bool,
}

impl Slot {
    fn from_local(v: &Value) -> Option<Slot> {
        let s = |k: &str| v.get(k).and_then(Value::as_str).map(str::to_string);
        Some(Slot {
            id: s("id")?,
            title: s("title").unwrap_or_default(),
            date: s("date")?,
            end_date: s("endDate"),
            time: s("time"),
            end_time: s("endTime"),
            yearly: s("repeat").as_deref() == Some("yearly"),
            google: false,
        })
    }

    fn from_google(g: &GEvent) -> Slot {
        Slot {
            id: g.id.clone(),
            title: g.title.clone(),
            date: g.date.clone(),
            end_date: g.end_date.clone(),
            time: g.time.clone(),
            end_time: g.end_time.clone(),
            yearly: false,
            google: true,
        }
    }
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

/// 매년 반복: 그 해의 같은 날 (2/29는 평년에 2/28)
fn in_year(d: NaiveDate, year: i32) -> NaiveDate {
    let mut day = d.day();
    loop {
        if let Some(x) = NaiveDate::from_ymd_opt(year, d.month(), day) {
            return x;
        }
        day -= 1;
    }
}

/// 일정의 시작·끝 시각. 시각이 없으면(종일) None.
fn span(slot: &Slot, now: NaiveDateTime) -> Option<(NaiveDateTime, NaiveDateTime)> {
    let t0 = NaiveTime::parse_from_str(slot.time.as_deref()?, "%H:%M").ok()?;
    let t1 = NaiveTime::parse_from_str(slot.end_time.as_deref()?, "%H:%M").ok()?;
    let mut d0 = parse_date(&slot.date)?;
    let mut d1 = slot.end_date.as_deref().and_then(parse_date).unwrap_or(d0);
    if slot.yearly {
        let shift = now.year() - d0.year();
        d0 = in_year(d0, now.year());
        d1 = in_year(d1, d1.year() + shift);
    }
    Some((d0.and_time(t0), d1.and_time(t1)))
}

fn hidden_title(title: &str, hidden: &[String]) -> bool {
    let t = title.to_lowercase();
    hidden.iter().any(|h| {
        let h = h.trim().to_lowercase();
        !h.is_empty() && t.contains(&h)
    })
}

/// 순수 함수: 지금 진행 중인 일정. 여럿이면 끝이 가장 늦은 것.
fn ongoing(slots: &[Slot], hidden: &[String], now: NaiveDateTime) -> Option<Meeting> {
    slots
        .iter()
        .filter(|s| !(s.google && hidden_title(&s.title, hidden)))
        .filter_map(|s| span(s, now).map(|(a, b)| (s, a, b)))
        .filter(|(_, a, b)| b > a && *b - *a < Duration::hours(23) && *a <= now && now < *b)
        .max_by_key(|(_, _, b)| *b)
        .map(|(s, _, b)| Meeting { id: s.id.clone(), title: s.title.clone(), end_label: b.format("%H:%M").to_string() })
}

fn settings(app: &AppHandle) -> Settings {
    app.try_state::<SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|c| c.clone().unwrap_or_default()))
        .unwrap_or_default()
}

fn compute(app: &AppHandle, hidden: &[String]) -> Option<Meeting> {
    let mut slots: Vec<Slot> = Vec::new();
    if let Some(root) = app.try_state::<NotesRoot>() {
        if let Ok(items) = crate::store::load_list(&root.0, "events") {
            slots.extend(items.iter().filter_map(Slot::from_local));
        }
    }
    if let Some(g) = app.try_state::<crate::google::GoogleState>() {
        slots.extend(g.events_snapshot().iter().map(Slot::from_google));
    }
    ongoing(&slots, hidden, chrono::Local::now().naive_local())
}

/// 설정·일정을 다시 읽어 상태를 갱신한다. 바뀌었으면 "meeting-changed"(Option<Meeting>)를 보낸다.
pub fn refresh(app: &AppHandle) {
    let Some(state) = app.try_state::<MeetingState>() else { return };
    let s = settings(app);
    let next = if s.meeting_mode_enabled { compute(app, &s.google_hidden_titles) } else { None };
    let changed = match state.0.lock() {
        Ok(mut cur) if *cur != next => {
            *cur = next.clone();
            true
        }
        _ => false,
    };
    if changed {
        let _ = app.emit("meeting-changed", &next);
    }
}

/// 트레이의 "회의 모드" 체크를 설정값에 맞춘다 (설정 화면·트레이에서 바꿨을 때)
pub fn sync_tray(app: &AppHandle) {
    if let Some(items) = app.try_state::<crate::TrayItems>() {
        let _ = items.meeting.set_checked(settings(app).meeting_mode_enabled);
    }
}

pub fn is_active(app: &AppHandle) -> bool {
    app.try_state::<MeetingState>()
        .and_then(|s| s.0.lock().ok().map(|m| m.is_some()))
        .unwrap_or(false)
}

/// 오브 창이 뜰 때: 지금 회의 중인지
#[tauri::command]
pub fn meeting_status(state: State<MeetingState>) -> Option<Meeting> {
    state.0.lock().ok().and_then(|m| m.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    fn slot(id: &str, date: &str, time: Option<&str>, end_time: Option<&str>) -> Slot {
        Slot {
            id: id.into(),
            title: id.into(),
            date: date.into(),
            end_date: None,
            time: time.map(Into::into),
            end_time: end_time.map(Into::into),
            yearly: false,
            google: false,
        }
    }

    #[test]
    fn timed_event_is_ongoing_between_start_inclusive_and_end_exclusive() {
        let slots = [slot("a", "2026-09-14", Some("14:00"), Some("15:00"))];
        assert!(ongoing(&slots, &[], at("2026-09-14 13:59")).is_none());
        let m = ongoing(&slots, &[], at("2026-09-14 14:00")).unwrap();
        assert_eq!((m.id.as_str(), m.end_label.as_str()), ("a", "15:00"));
        assert!(ongoing(&slots, &[], at("2026-09-14 14:59")).is_some());
        assert!(ongoing(&slots, &[], at("2026-09-14 15:00")).is_none());
    }

    #[test]
    fn all_day_and_very_long_events_are_ignored() {
        let all_day = slot("d", "2026-09-14", None, None);
        let mut long = slot("l", "2026-09-14", Some("00:00"), Some("23:30"));
        long.end_date = Some("2026-09-14".into());
        assert!(ongoing(&[all_day, long], &[], at("2026-09-14 12:00")).is_none());
        let mut two_days = slot("t", "2026-09-13", Some("09:00"), Some("10:00"));
        two_days.end_date = Some("2026-09-15".into());
        assert!(ongoing(&[two_days], &[], at("2026-09-14 12:00")).is_none());
    }

    #[test]
    fn hidden_words_apply_to_google_only() {
        let mut g = slot("g", "2026-09-14", Some("09:00"), Some("18:00"));
        g.title = "Office day".into();
        g.google = true;
        let mut l = slot("l", "2026-09-14", Some("09:00"), Some("18:00"));
        l.title = "office".into();
        let hidden = vec!["office".to_string()];
        assert!(ongoing(std::slice::from_ref(&g), &hidden, at("2026-09-14 12:00")).is_none());
        assert_eq!(ongoing(&[l], &hidden, at("2026-09-14 12:00")).unwrap().id, "l");
    }

    #[test]
    fn yearly_repeat_shifts_to_current_year_and_clamps_feb_29() {
        let mut y = slot("y", "2024-02-29", Some("10:00"), Some("11:00"));
        y.yearly = true;
        assert!(ongoing(std::slice::from_ref(&y), &[], at("2026-02-28 10:30")).is_some());
        assert!(ongoing(&[y], &[], at("2026-03-01 10:30")).is_none());
    }

    #[test]
    fn overlapping_picks_latest_end() {
        let slots = [
            slot("short", "2026-09-14", Some("14:00"), Some("14:30")),
            slot("long", "2026-09-14", Some("13:00"), Some("16:00")),
        ];
        assert_eq!(ongoing(&slots, &[], at("2026-09-14 14:10")).unwrap().id, "long");
    }
}
