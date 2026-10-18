//! Timed (karaoke) lyrics.
//!
//! InnerTube serves the official lyrics as one plain-text blob with no timing —
//! the response's own footer names the provider (Musixmatch) and there is no
//! per-line timestamp anywhere in the payload. Real-time highlighting therefore
//! needs a synchronised source, and [LRCLIB](https://lrclib.net) is the open,
//! keyless one the ecosystem uses: `GET /api/get` returns an LRC document
//! (`[mm:ss.xx] line`) for a track, matched by artist/title/album/duration.
//!
//! Resolution order:
//!
//! 1. LRCLIB exact match → synchronised lines.
//! 2. LRCLIB search → best match (synced, duration closest).
//! 3. InnerTube official lyrics → plain lines, shown without pretending to sync.

use std::cmp::Ordering;

use serde::{Deserialize, Serialize};

const LRCLIB_GET: &str = "https://lrclib.net/api/get";
const LRCLIB_SEARCH: &str = "https://lrclib.net/api/search";

#[derive(Debug, Deserialize)]
pub struct LyricsQuery {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Seconds; `0` when unknown.
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    /// Seconds from the start (`0` for unsynchronised lines).
    pub time: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    /// True when `lines[].time` is meaningful and the UI can highlight.
    pub synced: bool,
    /// Where the text came from, surfaced to the user.
    pub source: String,
    pub lines: Vec<LyricLine>,
}

#[derive(Debug, Deserialize)]
struct LrclibTrack {
    #[serde(rename = "syncedLyrics")]
    synced: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain: Option<String>,
    duration: Option<f64>,
}

/// Lyrics for a track: synchronised when possible, otherwise the official text.
#[tauri::command(async)]
pub async fn music_lyrics(query: LyricsQuery) -> Result<Lyrics, String> {
    if let Some(track) = lrclib(&query).await {
        if let Some(synced) = track.synced.as_deref() {
            let lines = parse_lrc(synced);
            if !lines.is_empty() {
                return Ok(Lyrics {
                    synced: true,
                    source: "LRCLIB".to_string(),
                    lines,
                });
            }
        }
        if let Some(plain) = track.plain.as_deref() {
            let lines = plain_lines(plain);
            if !lines.is_empty() {
                return Ok(Lyrics {
                    synced: false,
                    source: "LRCLIB".to_string(),
                    lines,
                });
            }
        }
    }

    if let Some(text) = crate::innertube::official_lyrics(&query.id).await {
        let lines = plain_lines(&text);
        if !lines.is_empty() {
            return Ok(Lyrics {
                synced: false,
                source: "YouTube Music".to_string(),
                lines,
            });
        }
    }

    Err("Letra não encontrada para esta faixa.".to_string())
}

/// LRCLIB: prefer a synchronised match from either endpoint; fall back to plain.
///
/// The exact endpoint often has only plain lyrics for a track while the search
/// has a synchronised version, so the exact hit must not short-circuit.
async fn lrclib(query: &LyricsQuery) -> Option<LrclibTrack> {
    let duration = query.duration.round().to_string();
    let exact_url = format!(
        "{LRCLIB_GET}?artist_name={}&track_name={}&album_name={}&duration={}",
        url_encode(&query.artist),
        url_encode(&query.title),
        url_encode(&query.album),
        url_encode(&duration),
    );
    let exact = fetch::<LrclibTrack>(&exact_url)
        .await
        .filter(|track| track.synced.is_some() || track.plain.is_some());

    if exact.as_ref().is_some_and(|track| track.synced.is_some()) {
        return exact;
    }

    let search_url = format!(
        "{LRCLIB_SEARCH}?track_name={}&artist_name={}",
        url_encode(&query.title),
        url_encode(&query.artist),
    );
    let mut results = fetch::<Vec<LrclibTrack>>(&search_url)
        .await
        .unwrap_or_default();
    results.sort_by(|a, b| {
        rank(a, query)
            .partial_cmp(&rank(b, query))
            .unwrap_or(Ordering::Equal)
    });
    let best = results
        .into_iter()
        .find(|track| track.synced.is_some() || track.plain.is_some());

    match best {
        // A synchronised search hit beats a plain exact hit.
        Some(track) if track.synced.is_some() => Some(track),
        other => exact.or(other),
    }
}

/// GETs a URL and deserialises a success body. Network/status/parse failures all
/// become `None` so callers can fall through to the next source.
async fn fetch<T: serde::de::DeserializeOwned>(url: &str) -> Option<T> {
    let response = crate::auth::http()
        .get(url)
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    response.json::<T>().await.ok()
}

/// Percent-encodes a query value (RFC 3986 unreserved set kept verbatim).
fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Lower is better: synced before plain, then duration closest to the track.
fn rank(track: &LrclibTrack, query: &LyricsQuery) -> (u8, f64) {
    let unsynced = u8::from(track.synced.is_none());
    let delta = if query.duration > 0.0 {
        (track.duration.unwrap_or(f64::MAX) - query.duration).abs()
    } else {
        0.0
    };
    (unsynced, delta)
}

/// Parses an LRC document into timed lines. Pure, so it is unit-tested.
///
/// Handles several timestamps per line, the `[offset:…]` tag, and unrelated
/// metadata tags (`[ar:]`, `[ti:]`, …), which are dropped.
fn parse_lrc(text: &str) -> Vec<LyricLine> {
    let mut lines: Vec<LyricLine> = Vec::new();
    let mut offset_ms: i64 = 0;

    for raw in text.lines() {
        let mut rest = raw;
        let mut times: Vec<f64> = Vec::new();

        // Consume a run of `[..]` tags at the start of the line.
        loop {
            let trimmed = rest.trim_start();
            let Some(open) = trimmed.strip_prefix('[') else {
                rest = trimmed;
                break;
            };
            let Some(close) = open.find(']') else {
                rest = trimmed;
                break;
            };
            let tag = &open[..close];
            let after = &open[close + 1..];

            if let Some(value) = tag.strip_prefix("offset:") {
                offset_ms = value.trim().parse().unwrap_or(offset_ms);
                rest = after;
                continue;
            }
            if let Some(seconds) = parse_timestamp(tag) {
                times.push(seconds);
                rest = after;
                continue;
            }
            if tag.contains(':') {
                // Metadata tag (`[ar:…]`); consume it and keep scanning.
                rest = after;
                continue;
            }
            rest = trimmed;
            break;
        }

        if times.is_empty() {
            continue;
        }
        let line = rest.trim();
        let shift = offset_ms as f64 / 1000.0;
        for time in times {
            lines.push(LyricLine {
                time: (time + shift).max(0.0),
                text: line.to_string(),
            });
        }
    }

    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(Ordering::Equal));
    lines
}

/// `mm:ss`, `mm:ss.xx`, `mm:ss.xxx` or `hh:mm:ss.xx` → seconds.
fn parse_timestamp(tag: &str) -> Option<f64> {
    let parts: Vec<&str> = tag.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return None;
    }
    let seconds: f64 = parts[parts.len() - 1].parse().ok()?;
    let minutes: f64 = parts[parts.len() - 2].parse().ok()?;
    let mut total = minutes * 60.0 + seconds;
    if parts.len() == 3 {
        let hours: f64 = parts[0].parse().ok()?;
        total += hours * 3600.0;
    }
    Some(total)
}

/// Plain text → untimed lines, keeping blank lines as stanza separators.
fn plain_lines(text: &str) -> Vec<LyricLine> {
    text.lines()
        .map(|line| LyricLine {
            time: 0.0,
            text: line.trim_end().to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_timestamps_with_hundredths() {
        let lines = parse_lrc(
            "[00:09.65] The club isn't the best place\n[00:12.10] So the bar is where I go",
        );
        assert_eq!(lines.len(), 2);
        assert!((lines[0].time - 9.65).abs() < 1e-6);
        assert_eq!(lines[0].text, "The club isn't the best place");
        assert!((lines[1].time - 12.10).abs() < 1e-6);
    }

    #[test]
    fn handles_several_tags_per_line_and_offset() {
        let lines = parse_lrc("[offset:500]\n[00:10.00][00:20.00] repeated hook");
        assert_eq!(lines.len(), 2);
        assert!((lines[0].time - 10.5).abs() < 1e-6);
        assert!((lines[1].time - 20.5).abs() < 1e-6);
        assert!(lines.iter().all(|line| line.text == "repeated hook"));
    }

    #[test]
    fn ignores_metadata_tags_and_untimed_lines() {
        let lines = parse_lrc("[ar:Artist]\n[ti:Song]\njust a stray line\n[01:02.00] real");
        assert_eq!(lines.len(), 1);
        assert!((lines[0].time - 62.0).abs() < 1e-6);
        assert_eq!(lines[0].text, "real");
    }

    #[test]
    fn sorts_lines_and_keeps_synced_flag_honest() {
        let lines = parse_lrc("[00:30.00] second\n[00:10.00] first");
        assert_eq!(lines[0].text, "first");
        assert_eq!(lines[1].text, "second");

        let plain = plain_lines("a\n\nb");
        assert_eq!(plain.len(), 3);
        assert!(plain.iter().all(|line| line.time == 0.0));
        assert_eq!(plain[1].text, "");
    }

    #[test]
    fn ranks_synced_and_close_duration_first() {
        let query = LyricsQuery {
            id: "v".into(),
            title: "t".into(),
            artist: "a".into(),
            album: "al".into(),
            duration: 214.0,
        };
        let close_unsynced = LrclibTrack {
            synced: None,
            plain: Some("x".into()),
            duration: Some(214.0),
        };
        let far_synced = LrclibTrack {
            synced: Some("[00:01.00] x".into()),
            plain: None,
            duration: Some(300.0),
        };
        assert!(rank(&far_synced, &query) < rank(&close_unsynced, &query));

        // Among two synced tracks, the closest duration wins.
        let close_synced = LrclibTrack {
            synced: Some("[00:01.00] x".into()),
            plain: None,
            duration: Some(215.0),
        };
        assert!(rank(&close_synced, &query) < rank(&far_synced, &query));
    }

    /// Opt-in live check (`YTM_LIVE=1`): LRCLIB is keyless, so the whole
    /// synchronised path can be verified against the real service.
    #[test]
    fn live_lrclib_returns_synced_lines() {
        if std::env::var("YTM_LIVE").is_err() {
            return;
        }
        let lyrics = tauri::async_runtime::block_on(music_lyrics(LyricsQuery {
            id: "JGwWNGJdvx8".to_string(),
            title: "Shape of You".to_string(),
            artist: "Ed Sheeran".to_string(),
            album: "÷ (Deluxe)".to_string(),
            duration: 233.0,
        }))
        .expect("lyrics resolved");

        assert!(lyrics.synced, "expected synchronised lyrics");
        assert!(lyrics.lines.len() > 5, "too few lines");
        assert!(lyrics.lines.iter().all(|line| line.time >= 0.0));
        assert!(
            lyrics
                .lines
                .windows(2)
                .all(|pair| pair[0].time <= pair[1].time)
        );
    }
}
