mod clipboard;
mod google;
mod launcher;
mod migrate;
mod notes;
mod orb;
mod reminders;
mod settings;
mod store;

use std::path::{Path, PathBuf};

use notes::NotesRoot;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_window_state::StateFlags;

// 창 전체를 반투명하게 (팝업 모드 투명도 슬라이더용).
// Tauri에는 창 투명도 API가 없어 Windows 레이어드 윈도우 알파값을 직접 설정한다.
// 1.0이면 레이어드 스타일 자체를 떼어내 평소 렌더링 경로로 되돌린다.
#[tauri::command]
fn set_window_opacity(window: tauri::Window, opacity: f64) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::COLORREF;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE,
            LWA_ALPHA, WS_EX_LAYERED,
        };
        use windows::Win32::Graphics::Gdi::{
            RedrawWindow, RDW_ALLCHILDREN, RDW_FRAME, RDW_INVALIDATE, RDW_UPDATENOW,
        };
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let alpha = (opacity.clamp(0.2, 1.0) * 255.0).round() as u8;
        let layered = WS_EX_LAYERED.0 as isize;
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if alpha == 255 {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !layered);
            } else {
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex | layered);
                SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA)
                    .map_err(|e| e.to_string())?;
            }
            // 스타일이 바뀌면 예전 프레임 그림이 남으므로 다시 그리게 한다
            let _ = RedrawWindow(
                Some(hwnd),
                None,
                None,
                RDW_INVALIDATE | RDW_FRAME | RDW_ALLCHILDREN | RDW_UPDATENOW,
            );
        }
    }
    #[cfg(not(windows))]
    let _ = (window, opacity);
    Ok(())
}

// 노트 루트 절대 경로. 프런트가 이미지 asset 주소를 만들 때 쓴다.
#[tauri::command]
fn data_root(root: tauri::State<NotesRoot>) -> String {
    root.0.to_string_lossy().into_owned()
}

// 설정에 적힌 전역 단축키를 (다시) 등록한다. 다른 프로그램이 이미 쥔 키는 등록에 실패하는데,
// 그래도 앱은 떠야 하므로 시작 시에는 무시하고, 설정 화면에서 바꿀 때는 어느 키가 실패했는지 돌려준다.
fn register_shortcuts(app: &tauri::AppHandle) -> Result<(), String> {
    let s = app
        .try_state::<settings::SettingsState>()
        .and_then(|s| s.0.lock().ok().map(|c| c.clone().unwrap_or_default()))
        .unwrap_or_default();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut failed = Vec::new();
    if !s.shortcut_quick_memo.trim().is_empty() {
        let r = gs.on_shortcut(s.shortcut_quick_memo.as_str(), |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                orb::open_quick_memo(app);
            }
        });
        if r.is_err() {
            failed.push(format!("빠른 메모({})", s.shortcut_quick_memo));
        }
    }
    if !s.shortcut_launcher.trim().is_empty() {
        let r = gs.on_shortcut(s.shortcut_launcher.as_str(), |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                orb::open_launcher(app);
            }
        });
        if r.is_err() {
            failed.push(format!("런처({})", s.shortcut_launcher));
        }
    }
    if failed.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "등록하지 못한 단축키: {}. 다른 프로그램이 쓰고 있거나 표기가 잘못됐습니다.",
            failed.join(", ")
        ))
    }
}

#[tauri::command]
fn apply_shortcuts(app: tauri::AppHandle) -> Result<(), String> {
    register_shortcuts(&app)
}

// 로그인 시 자동 시작 (Windows: HKCU Run 키). 설정 화면이 읽고 바꾼다.
#[tauri::command]
fn autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launch = app.autolaunch();
    if enabled { launch.enable() } else { launch.disable() }.map_err(|e| e.to_string())
}

// 설정 화면의 "폴더 열기": 노트 루트를 탐색기로 연다
#[tauri::command]
fn open_data_root(app: tauri::AppHandle, root: tauri::State<NotesRoot>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(root.0.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

// 파일 워처 이벤트 경로를 보고 어떤 이벤트를 보낼지 정한다.
// 점으로 시작하는 파일·폴더(.todos.json, .assets, .settings.json …)는 메모가 아니므로
// 트리·본문을 다시 읽게 하는 notes-changed를 내지 않는다. 그중 목록 파일은 외부
// 프로그램(동기화 등)이 고쳤을 수 있으니 해당 목록의 변경 이벤트만 낸다.
fn classify(root: &Path, paths: &[PathBuf]) -> Vec<&'static str> {
    let mut out: Vec<&'static str> = Vec::new();
    for p in paths {
        let rel = p.strip_prefix(root).unwrap_or(p);
        let hidden = rel
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'));
        let ev = if !hidden {
            "notes-changed"
        } else if rel.ends_with(".todos.json") {
            "todos-changed"
        } else if rel.ends_with(".events.json") {
            "events-changed"
        } else {
            continue;
        };
        if !out.contains(&ev) {
            out.push(ev);
        }
    }
    out
}

// GitHub 릴리즈의 latest.json을 확인해 새 버전이 있으면 내려받아 설치 후 재시작
fn check_for_updates(app: tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    use tauri_plugin_updater::UpdaterExt;

    std::thread::spawn(move || {
        let updater = match app.updater() {
            Ok(u) => u,
            Err(e) => {
                app.dialog()
                    .message(format!("업데이터를 초기화하지 못했습니다:\n{e}"))
                    .title("Orbit 업데이트")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
                return;
            }
        };
        match tauri::async_runtime::block_on(updater.check()) {
            Ok(Some(update)) => {
                let yes = app
                    .dialog()
                    .message(format!(
                        "새 버전 {}이(가) 있습니다. (현재 {})\n지금 업데이트할까요?",
                        update.version, update.current_version
                    ))
                    .title("Orbit 업데이트")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "업데이트".into(),
                        "나중에".into(),
                    ))
                    .blocking_show();
                if !yes {
                    return;
                }
                match tauri::async_runtime::block_on(update.download_and_install(|_, _| {}, || {}))
                {
                    // Windows에서는 설치가 시작되면 앱이 자동 종료되므로 보통 여기 도달하지 않음
                    Ok(()) => app.restart(),
                    Err(e) => {
                        app.dialog()
                            .message(format!("업데이트 설치에 실패했습니다:\n{e}"))
                            .title("Orbit 업데이트")
                            .kind(MessageDialogKind::Error)
                            .blocking_show();
                    }
                }
            }
            Ok(None) => {
                app.dialog()
                    .message("이미 최신 버전입니다.")
                    .title("Orbit 업데이트")
                    .kind(MessageDialogKind::Info)
                    .blocking_show();
            }
            Err(e) => {
                app.dialog()
                    .message(format!("업데이트 확인에 실패했습니다:\n{e}"))
                    .title("Orbit 업데이트")
                    .kind(MessageDialogKind::Error)
                    .blocking_show();
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 작업 표시줄·시작 메뉴에서 다시 실행하면 이미 켜진 Orbit 창을 앞으로
            orb::show_dashboard(app.clone(), None);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(
            // Orbit 창 크기·위치 기억 (표시 여부는 복원하지 않음 — 시작 때는 오브만).
            // 오브 창은 제외하고 위치를 설정 파일에 따로 둔다.
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .with_denylist(&[orb::ORB])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let root = migrate::resolve_data_root(&app.path().document_dir()?);
            std::fs::create_dir_all(&root)?;
            migrate::offer_old_uninstall(app.handle().clone());
            let quick = root.join(notes::QUICK_MEMO);
            if !quick.exists() {
                std::fs::write(&quick, "")?;
            }

            // 외부 변경 감지 → 프런트에 알림 (연속 이벤트는 300ms 잠잠해질 때까지 병합)
            let handle = app.handle().clone();
            let watch_root = root.clone();
            std::thread::spawn(move || {
                use notify::{recommended_watcher, RecursiveMode, Watcher};
                let (tx, rx) = std::sync::mpsc::channel();
                let mut watcher = match recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(_) => return,
                };
                if watcher.watch(&watch_root, RecursiveMode::Recursive).is_err() {
                    return;
                }
                while let Ok(first) = rx.recv() {
                    let mut paths: Vec<PathBuf> = first.map(|e| e.paths).unwrap_or_default();
                    while let Ok(ev) = rx.recv_timeout(std::time::Duration::from_millis(300)) {
                        if let Ok(e) = ev {
                            paths.extend(e.paths);
                        }
                    }
                    for name in classify(&watch_root, &paths) {
                        let _ = handle.emit(name, ());
                    }
                }
            });

            // 트레이: 좌클릭 = Orbit 창, 메뉴 = Orbit 열기/오브 표시·숨김/업데이트 확인/종료
            let dash_item = MenuItem::with_id(app, "dashboard", "Orbit 열기", true, None::<&str>)?;
            let orb_item = MenuItem::with_id(app, "orb", "오브 표시/숨김", true, None::<&str>)?;
            let update_item =
                MenuItem::with_id(app, "update", "업데이트 확인", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&dash_item, &orb_item, &update_item, &quit_item])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("window icon").clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Orbit (Ctrl+Alt+M)")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "dashboard" => orb::show_dashboard(app.clone(), None),
                    "orb" => {
                        if let Some(w) = app.get_webview_window(orb::ORB) {
                            let visible = w.is_visible().unwrap_or(true);
                            orb::set_visible(app, !visible);
                            // 설정에도 남겨 다음 시작 때 같은 상태로
                            if let Some(s) = app.try_state::<settings::SettingsState>() {
                                if let Ok(mut cur) = s.0.lock() {
                                    let mut next = cur.clone().unwrap_or_default();
                                    next.orb_visible = !visible;
                                    if let Some(root) = app.try_state::<NotesRoot>() {
                                        let _ = settings::save(&root.0, &next);
                                    }
                                    *cur = Some(next);
                                    let _ = app.emit("settings-changed", ());
                                }
                            }
                        }
                    }
                    "update" => check_for_updates(app.clone()),
                    "quit" => {
                        // 마지막 자동 저장(≤500ms 디바운스)이 기록될 시간을 주고 종료
                        let _ = app.emit("app-quitting", ());
                        let handle = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(700));
                            handle.exit(0);
                        });
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        orb::show_dashboard(tray.app_handle().clone(), None);
                    }
                })
                .build(app)?;

            let loaded = settings::load(&root);
            orb::place_on_start(app.handle(), &loaded.clone().unwrap_or_default());
            app.manage(settings::SettingsState(std::sync::Mutex::new(loaded)));
            app.manage(store::ListLock(std::sync::Mutex::new(())));
            app.manage(NotesRoot(root));

            // 리마인더: 발송 원장은 문서 폴더가 아닌 로컬 데이터 폴더에 (기기 종속, 동기화 불필요)
            let local = app.path().app_local_data_dir()?;
            app.manage(reminders::ReminderState::load(&local));
            app.manage(clipboard::ClipState::load(&local));
            let launcher = launcher::LauncherState::load(&local);
            launcher::warm_up(&launcher);
            app.manage(launcher);
            app.manage(google::GoogleState::load(&local));
            app.manage(reminders::LocalDir(local));
            reminders::spawn(app.handle().clone());
            clipboard::spawn(app.handle().clone());
            google::spawn(app.handle().clone());

            // 전역 단축키는 설정(SettingsState)이 준비된 뒤에. 다른 프로그램이 쥔 키는 조용히 건너뛴다.
            let _ = register_shortcuts(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // 오브 창은 어떤 이벤트가 와도 캡션 스타일이 되살아났는지 확인 (창 제목이 그려지는 것 방지)
            if window.label() == orb::ORB {
                orb::ensure_stripped(window);
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                // 오브에서 Alt+F4: 사라지게 두지 않는다. Orbit 창 닫기 = 숨김 (오브·트레이로 복귀)
                if window.label() != orb::ORB {
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_window_opacity,
            data_root,
            notes::list_tree,
            notes::read_note,
            notes::note_times,
            notes::write_note,
            notes::create_note,
            notes::create_folder,
            notes::rename_entry,
            notes::move_entry,
            notes::reorder_entry,
            notes::delete_entry,
            notes::restore_entry,
            notes::search_notes,
            notes::save_quick_memo,
            notes::append_quick_memo,
            notes::save_image,
            notes::read_favorites,
            notes::write_favorites,
            store::list_items,
            store::list_add,
            store::list_patch,
            store::list_remove,
            store::list_move,
            settings::read_settings,
            settings::write_settings,
            settings::update_settings,
            open_data_root,
            orb::show_dashboard,
            orb::toggle_dashboard,
            orb::set_orb_visible,
            orb::reset_orb_position,
            reminders::check_reminders,
            reminders::dismiss_reminder,
            clipboard::clipboard_history,
            clipboard::clipboard_copy,
            clipboard::clipboard_pin,
            clipboard::clipboard_remove,
            clipboard::clipboard_clear,
            launcher::launcher_items,
            launcher::launcher_rescan,
            launcher::launch,
            launcher::launcher_add_custom,
            launcher::launcher_remove_custom,
            google::google_status,
            google::google_set_client,
            google::google_connect,
            google::google_disconnect,
            google::google_set_calendar_enabled,
            google::google_sync,
            google::google_events,
            apply_shortcuts,
            autostart_enabled,
            set_autostart
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_separates_notes_from_dot_files() {
        let root = Path::new("C:\\docs\\Orbit");
        let p = |s: &str| root.join(s);
        assert_eq!(classify(root, &[p("폴더/메모.md")]), ["notes-changed"]);
        assert_eq!(classify(root, &[p(".todos.json")]), ["todos-changed"]);
        assert_eq!(classify(root, &[p(".events.json")]), ["events-changed"]);
        // 설정·이미지·순서 파일과 임시 파일은 아무 이벤트도 내지 않는다
        assert!(classify(root, &[p(".settings.json"), p(".assets/img.png"), p(".todos.json.tmp")]).is_empty());
        // 섞여 있으면 각각 한 번씩
        assert_eq!(
            classify(root, &[p("a.md"), p("b.md"), p(".todos.json")]),
            ["notes-changed", "todos-changed"]
        );
    }
}
