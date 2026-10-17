mod auth;
mod innertube;
mod stream;

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
            auth::auth_save_cookies,
            auth::auth_clear_cookies,
            auth::auth_cookie_status,
            innertube::music_home,
            innertube::music_search,
            innertube::music_browse,
            innertube::music_library,
            innertube::music_library_status,
            stream::music_stream,
            stream::music_resolver_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
