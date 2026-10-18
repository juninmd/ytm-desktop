//! Offline downloads.
//!
//! A played track is streamed from `googlevideo`; downloading it once lets the
//! player work without a network. The audio is fetched with the same `yt-dlp`
//! the stream resolver uses, written under the app data directory
//! (`downloads/<videoId>.<ext>`), and recorded in a small `index.json` so the
//! library and the player can find it.
//!
//! Two invariants matter here:
//!
//! * **One writer.** The index is read-modify-written under a process lock and
//!   replaced atomically, so two downloads cannot lose each other's entries.
//! * **Confined paths.** `index.json` is a user-writable file, so every path it
//!   yields is re-checked to be inside `downloads/` before it is played or
//!   deleted.
//!
//! The webview reaches a file through Tauri's asset protocol
//! (`convertFileSrc`), which is why `tauri.conf.json` enables that protocol for
//! `$APPDATA/downloads/**` and the CSP allows `asset:` in `media-src`.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadEntry {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    /// Absolute path of the downloaded audio file.
    pub file: String,
    pub bytes: u64,
    pub downloaded_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
}

/// The downloads directory (not created — read paths must not have side effects).
fn downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Diretório de dados indisponível: {error}"))?
        .join("downloads"))
}

fn ensure_downloads_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = downloads_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("Não criei {dir:?}: {error}"))?;
    Ok(dir)
}

fn index_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(downloads_dir(app)?.join("index.json"))
}

fn index_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn load_index(app: &AppHandle) -> Vec<DownloadEntry> {
    let Ok(path) = index_file(app) else {
        return Vec::new();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Writes the index through a temp file, so a crash cannot leave it truncated.
fn save_index(app: &AppHandle, entries: &[DownloadEntry]) -> Result<(), String> {
    let path = index_file(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Não criei {parent:?}: {error}"))?;
    }
    let raw = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("Não serialisei o índice: {error}"))?;

    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, raw).map_err(|error| format!("Não escrevi {temp:?}: {error}"))?;
    // `rename` replaces the destination atomically on every supported platform,
    // so a reader always sees a complete file.
    std::fs::rename(&temp, &path).map_err(|error| format!("Não gravei {path:?}: {error}"))?;
    Ok(())
}

/// A path from the index, but only when it really lives in `downloads/`.
/// `index.json` is user-writable, so it must not be able to name any other file.
fn confined_file(app: &AppHandle, entry: &DownloadEntry) -> Option<PathBuf> {
    let dir = downloads_dir(app).ok()?.canonicalize().ok()?;
    let path = PathBuf::from(&entry.file).canonicalize().ok()?;
    path.starts_with(&dir).then_some(path)
}

/// Enough of an id check to reject anything that is not a real video id before
/// it reaches the watch url (see `stream::valid_video_id`).
fn valid_id(id: &str) -> bool {
    crate::stream::valid_video_id(id)
}

/// The downloaded file for a track, when it exists and is inside `downloads/`.
pub(crate) fn local_file(app: &AppHandle, track_id: &str) -> Option<PathBuf> {
    let index = load_index(app);
    let entry = index.iter().find(|entry| entry.id == track_id)?;
    let path = confined_file(app, entry)?;
    path.is_file().then_some(path)
}

/// Downloads a track's audio, or returns the existing download.
#[tauri::command(async)]
pub fn music_download(app: AppHandle, track: DownloadRequest) -> Result<DownloadEntry, String> {
    if !valid_id(&track.id) {
        return Err("Identificador de faixa inválido.".to_string());
    }

    if let Some(entry) = load_index(&app).into_iter().find(|entry| {
        entry.id == track.id && confined_file(&app, entry).is_some_and(|path| path.is_file())
    }) {
        return Ok(entry);
    }

    let binary = crate::stream::yt_dlp().ok_or_else(|| {
        "yt-dlp não encontrado; não consigo baixar para ouvir offline.".to_string()
    })?;
    let dir = ensure_downloads_dir(&app)?;

    let output = Command::new(&binary)
        .current_dir(&dir)
        .args([
            "--ignore-config",
            "--no-playlist",
            "--no-progress",
            "--no-warnings",
            "--no-part",
            "-f",
            "bestaudio[ext=m4a]/bestaudio/best",
            "-o",
            "%(id)s.%(ext)s",
            &format!("https://music.youtube.com/watch?v={}", track.id),
        ])
        .output()
        .map_err(|error| format!("Falha ao executar yt-dlp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.lines().last().unwrap_or("erro desconhecido");
        return Err(format!("O download falhou: {detail}"));
    }

    // Match on the file stem so a stray `<id>.m4a.part` can never be chosen.
    let file = std::fs::read_dir(&dir)
        .map_err(|error| format!("Não li {dir:?}: {error}"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| path.file_stem().and_then(|stem| stem.to_str()) == Some(track.id.as_str()))
        .ok_or_else(|| "O yt-dlp não produziu um arquivo de áudio.".to_string())?;

    let entry = DownloadEntry {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        file: file.to_string_lossy().into_owned(),
        bytes: std::fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0),
        downloaded_at: crate::auth::now(),
    };

    // Re-read under the lock so a concurrent download's entry is not lost.
    let _guard = index_lock()
        .lock()
        .map_err(|_| "Índice ocupado.".to_string())?;
    let mut index = load_index(&app);
    upsert(&mut index, entry.clone());
    save_index(&app, &index)?;
    Ok(entry)
}

/// Everything downloaded, with entries whose file vanished pruned away.
#[tauri::command]
pub fn music_downloads(app: AppHandle) -> Vec<DownloadEntry> {
    let Ok(_guard) = index_lock().lock() else {
        return load_index(&app);
    };
    let mut index = load_index(&app);
    let before = index.len();
    index.retain(|entry| Path::new(&entry.file).is_file());
    if index.len() != before {
        let _ = save_index(&app, &index);
    }
    index.sort_by_key(|entry| std::cmp::Reverse(entry.downloaded_at));
    index
}

/// Removes a download: the file first, then the index entry. A path the index
/// names but that is not inside `downloads/` is dropped without being touched.
#[tauri::command]
pub fn music_delete_download(app: AppHandle, track_id: String) -> Result<(), String> {
    let _guard = index_lock()
        .lock()
        .map_err(|_| "Índice ocupado.".to_string())?;
    let mut index = load_index(&app);
    if let Some(position) = index.iter().position(|entry| entry.id == track_id) {
        let entry = index.remove(position);
        if let Some(path) = confined_file(&app, &entry)
            && let Err(error) = std::fs::remove_file(&path)
            && error.kind() != std::io::ErrorKind::NotFound
        {
            return Err(format!("Não removi {path:?}: {error}"));
        }
    }
    save_index(&app, &index)
}

/// Replaces the entry for the same track, keeping the index one row per track.
fn upsert(index: &mut Vec<DownloadEntry>, entry: DownloadEntry) {
    index.retain(|existing| existing.id != entry.id);
    index.push(entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(id: &str, at: u64) -> DownloadEntry {
        DownloadEntry {
            id: id.to_string(),
            title: id.to_string(),
            artist: "Artist".to_string(),
            album: "Album".to_string(),
            duration: 100.0,
            file: format!("/tmp/{id}.m4a"),
            bytes: 10,
            downloaded_at: at,
        }
    }

    #[test]
    fn index_round_trips_through_json_the_ui_can_read() {
        let raw = serde_json::to_string(&vec![entry("a", 1)]).unwrap();
        assert!(
            raw.contains("\"downloadedAt\""),
            "camelCase for the webview"
        );
        let back: Vec<DownloadEntry> = serde_json::from_str(&raw).unwrap();
        assert_eq!(back[0].id, "a");
    }

    #[test]
    fn upsert_keeps_one_row_per_track() {
        let mut index = vec![entry("a", 1), entry("b", 1)];
        upsert(&mut index, entry("a", 2));
        assert_eq!(index.len(), 2);
        assert_eq!(
            index
                .iter()
                .find(|item| item.id == "a")
                .unwrap()
                .downloaded_at,
            2
        );
    }

    #[test]
    fn only_real_video_ids_are_accepted() {
        assert!(valid_id("uSFXOBaqiR8"));
        assert!(valid_id("a-b_c123456"));
        for bad in [
            "",
            "short",
            "way-too-long-identifier",
            "../../etc/passwd",
            "-x",
        ] {
            assert!(!valid_id(bad), "should reject {bad:?}");
        }
    }
}
