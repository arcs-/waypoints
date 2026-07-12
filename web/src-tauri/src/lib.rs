// Proton session storage in the macOS Keychain — the browser build uses localStorage, but a
// desktop app shouldn't leave the session + userKeyPassword in plaintext in the WebView data
// dir. One entry holds the whole JSON blob (see web/src/proton/credentials.ts).
// Async commands so keychain I/O stays off the main thread.
const KEYCHAIN_SERVICE: &str = "art.stillh.waypoints";
const KEYCHAIN_ACCOUNT: &str = "proton-session";

fn keychain_entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
async fn keychain_get() -> Result<Option<String>, String> {
  match keychain_entry()?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
async fn keychain_set(value: String) -> Result<(), String> {
  keychain_entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
async fn keychain_delete() -> Result<(), String> {
  match keychain_entry()?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

// Small non-secret preferences (e.g. the chosen UI language) in a JSON file in the app config
// dir. The WebView's localStorage isn't reliably persisted for the custom tauri:// origin.
fn prefs_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
  use tauri::Manager;
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join("prefs.json"))
}

fn read_prefs(app: &tauri::AppHandle) -> Result<serde_json::Map<String, serde_json::Value>, String> {
  Ok(
    std::fs::read_to_string(prefs_path(app)?)
      .ok()
      .and_then(|s| serde_json::from_str(&s).ok())
      .unwrap_or_default(),
  )
}

#[tauri::command]
async fn pref_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
  Ok(read_prefs(&app)?.get(&key).and_then(|v| v.as_str()).map(String::from))
}

#[tauri::command]
async fn pref_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
  let mut prefs = read_prefs(&app)?;
  prefs.insert(key, serde_json::Value::String(value));
  std::fs::write(prefs_path(&app)?, serde_json::Value::Object(prefs).to_string()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  use tauri::{Emitter, Manager};
  use tauri_plugin_opener::OpenerExt;
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![keychain_get, keychain_set, keychain_delete, pref_get, pref_set])
    .on_menu_event(|app, event| match event.id().as_ref() {
      // Language items emit `set-locale` to the frontend, which applies it to i18n.
      "lang-en" => { let _ = app.emit("set-locale", "en"); }
      "lang-de" => { let _ = app.emit("set-locale", "de"); }
      "lang-fr" => { let _ = app.emit("set-locale", "fr"); }
      // Reload (⌘R) — the webview has no built-in reload shortcut, so drive it here.
      "reload" => {
        if let Some(w) = app.get_webview_window("main") {
          let _ = w.eval("window.location.reload()");
        }
      }
      // Footer links, now in the native Help menu (opened in the default browser).
      "link-source" => { let _ = app.opener().open_url("https://github.com/arcs-/waypoints", None::<&str>); }
      "link-portfolio" => { let _ = app.opener().open_url("https://stillh.art", None::<&str>); }
      // "Check for Updates…" — the frontend runs the check and shows the result hint.
      "check-update" => { let _ = app.emit("check-update", ()); }
      _ => {}
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // macOS app menu with a populated "About Waypoints" panel. Setting a custom menu
      // replaces the defaults, so Edit/View/Window are re-added to keep copy-paste, the
      // fullscreen shortcut, and standard window controls working.
      #[cfg(target_os = "macos")]
      {
        use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};

        let about = AboutMetadataBuilder::new()
          .name(Some("Waypoints"))
          // Runtime package info carries the tauri.conf.json version, which reads
          // ../package.json — the single version source (NOT Cargo.toml's, which is inert).
          .version(Some(app.package_info().version.to_string()))
          .authors(Some(vec!["Patrick Stillhart".into()]))
          .comments(Some("A private, browser-only view of Proton Photos albums as map timelines."))
          .website(Some("https://stillh.art"))
          .website_label(Some("stillh.art"))
          .copyright(Some(
            "© 2026 Patrick Stillhart — fullstack developer, fan of great frontends with a passion for 3D and animation. stillh.art",
          ))
          .build();

        let check_update = MenuItemBuilder::with_id("check-update", "Check for Updates…").build(app)?;
        let app_menu = SubmenuBuilder::new(app.handle(), "Waypoints")
          .about(Some(about))
          .separator()
          .item(&check_update)
          .separator()
          .services()
          .separator()
          .hide()
          .hide_others()
          .show_all()
          .separator()
          .quit()
          .build()?;

        let edit_menu = SubmenuBuilder::new(app.handle(), "Edit")
          .undo()
          .redo()
          .separator()
          .cut()
          .copy()
          .paste()
          .select_all()
          .build()?;

        let reload = MenuItemBuilder::with_id("reload", "Reload")
          .accelerator("CmdOrCtrl+R")
          .build(app)?;
        let view_menu = SubmenuBuilder::new(app.handle(), "View")
          .item(&reload)
          .separator()
          .fullscreen()
          .build()?;

        // Language names as endonyms (always in their own language); handled by on_menu_event.
        let language_menu = SubmenuBuilder::new(app.handle(), "Language")
          .text("lang-en", "English")
          .text("lang-de", "Deutsch")
          .text("lang-fr", "Français")
          .build()?;

        let window_menu = SubmenuBuilder::new(app.handle(), "Window")
          .minimize()
          .separator()
          .close_window()
          .build()?;

        // The former in-app footer links, handled by on_menu_event.
        let help_menu = SubmenuBuilder::new(app.handle(), "Help")
          .text("link-source", "Source-Code and Issues")
          .text("link-portfolio", "Made by Patrick Stillhart")
          .build()?;

        let menu = MenuBuilder::new(app.handle())
          .items(&[&app_menu, &edit_menu, &view_menu, &language_menu, &window_menu, &help_menu])
          .build()?;
        app.set_menu(menu)?;
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
