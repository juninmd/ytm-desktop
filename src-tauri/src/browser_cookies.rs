//! Importing the YouTube Music browser cookie without a manual paste.
//!
//! The personal library is only reachable with the browser cookie plus a
//! `SAPISIDHASH` digest (see `innertube.rs`); a bearer token does not work
//! because Google's OAuth now only authenticates the *TV* InnerTube client, not
//! `WEB_REMIX`. Rather than make the user copy the header by hand, this module
//! reuses `yt-dlp` — already required to play audio — which knows how to read
//! and decrypt each browser's cookie store:
//!
//! ```text
//! yt-dlp --cookies-from-browser <browser> --cookies <tmp> --simulate <url>
//! ```
//!
//! `--cookies FILE` both reads and *dumps* the Netscape cookie jar, so the file
//! it writes is the merged browser session. We keep only the YouTube/Google
//! cookies, hand the header to the same vault the paste path uses, and delete
//! the temp file.
//!
//! Playwright is deliberately not used here: Google blocks automated sign-in,
//! and driving the user's real profile is both fragile and heavier than the tool
//! we already ship.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

/// Browsers `yt-dlp --cookies-from-browser` understands.
pub const BROWSERS: [&str; 9] = [
    "chrome", "edge", "firefox", "brave", "chromium", "opera", "vivaldi", "whale", "safari",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub browser: String,
    /// Cookie *names* that were imported. Never the values.
    pub fields: Vec<String>,
}

/// The browsers the UI can offer.
#[tauri::command]
pub fn cookie_browsers() -> Vec<String> {
    BROWSERS.iter().map(|name| name.to_string()).collect()
}

/// Reads the YouTube/Google cookies from `browser`'s store and saves the header.
#[tauri::command(async)]
pub fn auth_import_browser_cookies(browser: String) -> Result<ImportOutcome, String> {
    let browser = browser.trim().to_lowercase();
    if !BROWSERS.contains(&browser.as_str()) {
        return Err(format!("Navegador não suportado: {browser}"));
    }

    let binary = crate::stream::yt_dlp().ok_or_else(|| {
        "yt-dlp não encontrado. Ele é necessário para ler os cookies do navegador.".to_string()
    })?;

    // Put the jar in a fresh, private, exclusively-created directory so yt-dlp
    // creates the file itself (it rejects a pre-created empty one) and cannot be
    // tricked into following a pre-planted symlink. The RAII guard removes the
    // whole directory on every return path.
    let directory = create_private_dir()?;
    let _guard = TempJar {
        directory: directory.clone(),
    };
    let path = directory.join("cookies.txt");
    let cookie_path = path.to_string_lossy().into_owned();

    let output = Command::new(&binary)
        .args([
            "--cookies-from-browser",
            &browser,
            "--cookies",
            &cookie_path,
            "--simulate",
            "--skip-download",
            "--no-warnings",
            "--no-progress",
            "https://music.youtube.com/watch?v=uSFXOBaqiR8",
        ])
        .output()
        .map_err(|error| format!("Falha ao executar yt-dlp: {error}"))?;

    // The jar is written on exit even when the extraction itself fails, so read
    // the file first and only fall back to yt-dlp's stderr if it is unusable.
    let contents = std::fs::read_to_string(&path).unwrap_or_default();
    drop(_guard); // Remove the plaintext jar as early as possible.

    let header = cookie_header_from_netscape(&contents);
    let fields = header
        .split("; ")
        .filter_map(|pair| pair.split_once('=').map(|(name, _)| name.to_string()))
        .collect::<Vec<_>>();

    // Require exactly the names the signer looks up, not a substring match
    // (`__Secure-3PSAPISID` alone would import but never sign).
    if !fields
        .iter()
        .any(|name| name == "SAPISID" || name == "__Secure-3PAPISID")
    {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("nenhum cookie SAPISID encontrado");
        return Err(format!(
            "Não consegui ler um cookie do {browser}. {detail}. Se for Chrome/Edge, feche o \
             navegador antes de tentar (ele trava o banco de cookies enquanto está aberto, e \
             versões recentes usam App-Bound Encryption); o Firefox costuma funcionar direto."
        ));
    }

    crate::auth::store_cookie_header(&header)?;

    Ok(ImportOutcome { browser, fields })
}

/// Creates an exclusive, private temp directory to hold the jar. `create_dir`
/// fails if anything already exists at the path (defeating a pre-planted
/// symlink), and a fresh random name makes that collision unlikely.
fn create_private_dir() -> Result<PathBuf, String> {
    let base = std::env::temp_dir();
    for _ in 0..16 {
        let directory = base.join(format!(
            "ytm-browser-cookies-{}-{:016x}",
            std::process::id(),
            random_suffix()
        ));
        match std::fs::create_dir(&directory) {
            Ok(()) => {
                restrict_to_owner(&directory);
                return Ok(directory);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Não foi possível criar um diretório temporário: {error}"
                ));
            }
        }
    }
    Err("Não foi possível criar um diretório temporário exclusivo.".to_string())
}

/// Best-effort `0700` on Unix; on Windows the temp directory is already
/// per-user.
#[cfg(unix)]
fn restrict_to_owner(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700));
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) {}

fn random_suffix() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos() as u64)
        .unwrap_or_default();
    let tick = COUNTER.fetch_add(1, Ordering::Relaxed);
    nanos ^ tick.wrapping_mul(0x9E37_79B9_7F4A_7C15)
}

/// Removes the jar directory when it goes out of scope, on every path.
struct TempJar {
    directory: PathBuf,
}

impl Drop for TempJar {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.directory);
    }
}

/// Builds a `Cookie` header from a Netscape `cookies.txt`, keeping only the
/// YouTube and Google cookies. Pure, so it is unit-tested.
fn cookie_header_from_netscape(contents: &str) -> String {
    let mut pairs: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        // domain \t includeSubdomains \t path \t secure \t expiry \t name \t value
        let fields: Vec<&str> = trimmed.split('\t').collect();
        if fields.len() < 7 {
            continue;
        }
        let domain = fields[0].trim_start_matches('.');
        // Require a label boundary so `evil-youtube.com` cannot pass as
        // `youtube.com`.
        let is_google = domain == "google.com"
            || domain == "youtube.com"
            || domain.ends_with(".google.com")
            || domain.ends_with(".youtube.com");
        if !is_google {
            continue;
        }
        let name = fields[5];
        let value = fields[6];
        if name.is_empty() || !seen.insert(name.to_string()) {
            continue;
        }
        pairs.push(format!("{name}={value}"));
    }

    pairs.join("; ")
}

#[cfg(test)]
mod tests {
    use super::*;

    const JAR: &str = "\
# Netscape HTTP Cookie File
.youtube.com\tTRUE\t/\tTRUE\t1814700000\tSAPISID\tsecret-sapisid
.google.com\tTRUE\t/\tTRUE\t1814700000\t__Secure-3PAPISID\tsecret-3papisid
.youtube.com\tTRUE\t/\tTRUE\t1814700000\tSID\tsid-value
example.com\tTRUE\t/\tTRUE\t1814700000\tTRACKER\tnope
.youtube.com\tTRUE\t/\tTRUE\t1814700000\tSAPISID\tduplicate-ignored
";

    #[test]
    fn keeps_only_google_cookies_and_never_the_tracker() {
        let header = cookie_header_from_netscape(JAR);
        assert!(header.contains("SAPISID=secret-sapisid"));
        assert!(header.contains("__Secure-3PAPISID=secret-3papisid"));
        assert!(header.contains("SID=sid-value"));
        assert!(!header.contains("TRACKER"));
        // First occurrence wins, so a rotated duplicate cannot shadow it.
        assert!(!header.contains("duplicate-ignored"));
        assert_eq!(header.matches("SAPISID=").count(), 1);
    }

    #[test]
    fn ignores_comments_and_malformed_lines() {
        let header = cookie_header_from_netscape(
            "# comment\n\n.youtube.com\tTRUE\t/\tTRUE\t1\tSAPISID\tonly\nbroken-line\n",
        );
        assert_eq!(header, "SAPISID=only");
    }

    // Regression guard: `evil-youtube.com` must not pass as `youtube.com`.
    #[test]
    fn rejects_look_alike_domains() {
        let header = cookie_header_from_netscape(
            "\
evil-youtube.com\tTRUE\t/\tTRUE\t1\tSAPISID\tevil\n\
notgoogle.com\tTRUE\t/\tTRUE\t1\tSID\tevil2\n\
accounts.google.com\tTRUE\t/\tTRUE\t1\t__Secure-3PAPISID\tgood\n",
        );
        assert_eq!(header, "__Secure-3PAPISID=good");
    }
}
