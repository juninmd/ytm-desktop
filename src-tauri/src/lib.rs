mod auth;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth::auth_begin_device_flow,
            auth::auth_poll_device_flow,
            auth::auth_restore_session,
            auth::auth_sign_out,
            auth::auth_build_headers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
