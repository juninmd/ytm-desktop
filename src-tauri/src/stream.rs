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

use std::path::PathBuf;
use std::process::Command;

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
    for candidate in candidates() {
        if candidate.is_file() {
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
            return Some(PathBuf::from(name));
        }
    }

    None
}

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
/// the extraction.
#[tauri::command(async)]
pub fn music_stream(track_id: String) -> Result<StreamInfo, String> {
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
        // googlevideo urls are valid for roughly six hours.
        expires_in: 6 * 60 * 60,
        track_id,
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
}
