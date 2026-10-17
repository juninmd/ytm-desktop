//! Real audio for the player.
//!
//! YouTube serves audio and video as separate `googlevideo.com` streams, and the
//! URLs are gated behind a per-format signature that changes with the player
//! script. Reimplementing that signing in Rust is a moving target, so this
//! module drives [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) — the tool that
//! exists precisely to keep up with it — to turn a `videoId` into a playable,
//! time-limited URL. The URL is handed to the webview's `<audio>` element, which
//! streams it directly with range requests.
//!
//! yt-dlp is resolved from `$YTM_YTDLP`, then from a `yt-dlp` binary shipped
//! next to the app, then from `PATH`. When none exists the player falls back to
//! the simulated transport instead of failing — see `resolve`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    /// Direct, time-limited `googlevideo.com` url.
    pub url: String,
    /// Container/ext as reported by yt-dlp (`m4a`, `webm`, …).
    pub ext: String,
    /// Seconds until the url stops working.
    pub expires_in: u64,
    /// The track this stream belongs to, echoed for the caller's bookkeeping.
    pub track_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolverStatus {
    pub available: bool,
    pub binary: Option<String>,
    /// Human-readable reason when `available` is false.
    pub detail: Option<String>,
}

/// Where the resolver looks for yt-dlp, in priority order.
fn candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(explicit) = std::env::var("YTM_YTDLP")
        && !explicit.is_empty()
    {
        paths.push(PathBuf::from(explicit));
    }

    // Beside the running executable (a bundled sidecar).
    if let Ok(current) = std::env::current_exe()
        && let Some(directory) = current.parent()
    {
        paths.push(directory.join("yt-dlp.exe"));
        paths.push(directory.join("yt-dlp"));
    }

    paths
}

fn find_ytdlp() -> Option<PathBuf> {
    // Once located, the answer does not change for the life of the process, so
    // the `--version` probe (a process spawn) runs at most once.
    if let Some(resolved) = RESOLVED.get() {
        return Some(resolved.clone());
    }

    for candidate in candidates() {
        if candidate.is_file() {
            let _ = RESOLVED.set(candidate.clone());
            return Some(candidate);
        }
    }

    // PATH: let the OS resolve the bare name.
    for name in ["yt-dlp", "yt-dlp.exe"] {
        if Command::new(name)
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
        {
            let path = PathBuf::from(name);
            let _ = RESOLVED.set(path.clone());
            return Some(path);
        }
    }

    None
}

/// Remembers the located binary, so the probe runs once.
static RESOLVED: OnceLock<PathBuf> = OnceLock::new();

/// Where the browser-cookie import looks for `yt-dlp` (shared with the
/// resolver, since it is the same binary).
pub(crate) fn yt_dlp() -> Option<PathBuf> {
    find_ytdlp()
}

/// Whether a resolver binary is available. `async` so the `--version` probe
/// that locates it never runs on the UI thread.
#[tauri::command(async)]
pub fn music_resolver_status() -> ResolverStatus {
    match find_ytdlp() {
        Some(binary) => ResolverStatus {
            available: true,
            binary: Some(binary.to_string_lossy().into_owned()),
            detail: None,
        },
        None => ResolverStatus {
            available: false,
            binary: None,
            detail: Some(
                "yt-dlp não encontrado. Instale-o e deixe no PATH, defina YTM_YTDLP, ou coloque \
                 o binário ao lado do app."
                    .to_string(),
            ),
        },
    }
}

/// Resolves a `videoId` to a directly playable audio url.
///
/// `async` (via `async_runtime`) because it blocks on a `yt-dlp` child process:
/// a synchronous command would stall the webview's event loop for the length of
/// the extraction. Resolved urls are cached until they expire, so a replay or a
/// prefetched next track costs nothing.
#[tauri::command(async)]
pub fn music_stream(track_id: String) -> Result<StreamInfo, String> {
    if let Some(info) = cached(&track_id) {
        return Ok(info);
    }
    let info = resolve(&track_id)?;
    remember(&info);
    Ok(info)
}

/// Warms the cache for a track the player is likely to reach next. Errors are
/// swallowed: a prefetch is an optimisation, never a failure.
#[tauri::command(async)]
pub fn music_prefetch(track_id: String) -> bool {
    if cached(&track_id).is_some() {
        return true;
    }
    match resolve(&track_id) {
        Ok(info) => {
            remember(&info);
            true
        }
        Err(_) => false,
    }
}

/// Drops every cached stream (e.g. after a resolver change).
#[tauri::command]
pub fn music_clear_stream_cache() {
    clear_cache();
}

/// Clears the resolved-url cache. Also called on sign-out, since the urls are
/// capability-bearing.
pub(crate) fn clear_cache() {
    if let Ok(mut map) = cache().lock() {
        map.clear();
    }
}

struct CachedStream {
    info: StreamInfo,
    /// Unix seconds after which the url must not be reused.
    valid_until: u64,
}

/// googlevideo urls are valid for roughly six hours; keep a safety margin.
const URL_LIFETIME_SECONDS: u64 = 6 * 60 * 60;
const URL_SAFETY_MARGIN_SECONDS: u64 = 5 * 60;

fn cache() -> &'static Mutex<HashMap<String, CachedStream>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedStream>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached(track_id: &str) -> Option<StreamInfo> {
    let now = crate::auth::now();
    let map = cache().lock().ok()?;
    let entry = map.get(track_id)?;
    if entry.valid_until > now {
        Some(entry.info.clone())
    } else {
        None
    }
}

fn remember(info: &StreamInfo) {
    if let Ok(mut map) = cache().lock() {
        let now = crate::auth::now();
        // Evict what has already expired so the map cannot grow unbounded.
        map.retain(|_, entry| entry.valid_until > now);
        let valid_until = now + URL_LIFETIME_SECONDS - URL_SAFETY_MARGIN_SECONDS;
        map.insert(
            info.track_id.clone(),
            CachedStream {
                info: info.clone(),
                valid_until,
            },
        );
    }
}

fn resolve(track_id: &str) -> Result<StreamInfo, String> {
    let binary = find_ytdlp().ok_or_else(|| {
        "yt-dlp não encontrado, então o áudio real não pode ser resolvido.".to_string()
    })?;

    let output = Command::new(&binary)
        .args([
            "--no-playlist",
            "--no-warnings",
            "--no-progress",
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "--print",
            "%(url)s\t%(ext)s",
            &format!("https://music.youtube.com/watch?v={track_id}"),
        ])
        .output()
        .map_err(|error| format!("Falha ao executar yt-dlp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.lines().last().unwrap_or("erro desconhecido");
        return Err(format!("yt-dlp não conseguiu resolver a faixa: {detail}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout
        .lines()
        .rev()
        .find(|line| line.contains('\t'))
        .ok_or_else(|| "yt-dlp não devolveu uma URL de áudio.".to_string())?;

    let (url, ext) = line
        .split_once('\t')
        .ok_or_else(|| "Resposta inesperada do yt-dlp.".to_string())?;

    if !url.starts_with("http") {
        return Err("yt-dlp devolveu uma URL inesperada.".to_string());
    }

    Ok(StreamInfo {
        url: url.to_string(),
        ext: ext.trim().to_string(),
        expires_in: URL_LIFETIME_SECONDS,
        track_id: track_id.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_include_the_explicit_env_override() {
        // The env var is process-global, so this only asserts the ordering
        // contract: when set, it is tried first.
        let previous = std::env::var("YTM_YTDLP").ok();
        unsafe { std::env::set_var("YTM_YTDLP", "/custom/yt-dlp") };
        let list = candidates();
        unsafe {
            match previous {
                Some(value) => std::env::set_var("YTM_YTDLP", value),
                None => std::env::remove_var("YTM_YTDLP"),
            }
        }
        assert_eq!(
            list.first().map(|path| path.to_string_lossy().into_owned()),
            Some("/custom/yt-dlp".to_string())
        );
    }

    /// Opt-in live check (`YTM_LIVE=1`): resolves a real audio url via yt-dlp.
    #[test]
    fn live_resolver_returns_a_playable_url() {
        if std::env::var("YTM_LIVE").is_err() {
            return;
        }
        let info = music_stream("uSFXOBaqiR8".to_string()).expect("yt-dlp resolves audio");
        assert!(info.url.starts_with("http"));
        assert_eq!(info.track_id, "uSFXOBaqiR8");
        assert!(!info.ext.is_empty());
        assert!(info.url.contains("googlevideo.com"));
    }

    // The cache is what makes a prefetched next track free; the pure part is
    // worth pinning down without a network call.
    #[test]
    fn a_resolved_stream_is_cached() {
        let key = "cache-key-unit-test";
        assert!(cached(key).is_none(), "cache starts empty for a fresh key");
        remember(&StreamInfo {
            url: "https://x.googlevideo.com/a".to_string(),
            ext: "m4a".to_string(),
            expires_in: URL_LIFETIME_SECONDS,
            track_id: key.to_string(),
        });
        assert_eq!(cached(key).expect("hit").url, "https://x.googlevideo.com/a");
        music_clear_stream_cache();
        assert!(cached(key).is_none(), "clearing drops the entry");
    }
}
