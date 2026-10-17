//! A real YouTube Music (InnerTube) client.
//!
//! InnerTube is the private JSON API behind `music.youtube.com`. It is what
//! carries the actual YouTube Music catalogue — the official YouTube Data API
//! cannot see albums, YT Music playlists or mixes. Every endpoint here talks to
//! `https://music.youtube.com/youtubei/v1/<endpoint>` with the `WEB_REMIX`
//! client context, which is exactly what the web player sends.
//!
//! The response format is a deeply nested tree of `*Renderer` objects and it is
//! undocumented, so the parsers walk the tree defensively and read whatever
//! survives. Nothing here is hardcoded to a single response shape: the same
//! extractor handles search results, album shelves and playlist shelves because
//! they share `musicResponsiveListItemRenderer` / `musicTwoRowItemRenderer`.
//!
//! Search, browse and the home feed work **without an account**. The personal
//! library additionally needs the browser cookie plus a per-request
//! `SAPISIDHASH` digest — that is what [`cookies`] and [`origin_headers`] wire
//! up, and [`LibraryStatus`] reports honestly when they are absent.

use serde::Serialize;
use serde_json::{Value, json};

use crate::auth;

const ORIGIN: &str = "https://music.youtube.com";
const ENDPOINT: &str = "https://music.youtube.com/youtubei/v1/";
const CLIENT_NAME: &str = "WEB_REMIX";
const CLIENT_VERSION: &str = "1.20240101.01.00";

/// A playable track. `id` is the YouTube `videoId` — the value the stream
/// resolver and the watch links both key off.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_id: String,
    /// Seconds, when the response carries a clock. `0` means "ask the player".
    pub duration: f64,
    pub year: u32,
    pub plays: String,
    pub thumbnail: String,
}

/// Anything that opens as a whole: an album, a single/EP or a playlist.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub kind: String,
    pub format: String,
    pub title: String,
    pub subtitle: String,
    pub description: Option<String>,
    pub year: Option<u32>,
    pub track_ids: Vec<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shelf {
    pub title: String,
    pub subtitle: Option<String>,
    pub ids: Vec<String>,
}

/// Everything the home screen needs in one round trip.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeData {
    pub quick_picks: Vec<String>,
    pub shelves: Vec<Shelf>,
    pub collections: Vec<Collection>,
}

/// A denormalised page: the cards plus every track they reference. The webview
/// merges both into its catalogue store.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
    pub collections: Vec<Collection>,
    pub tracks: Vec<Track>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStatus {
    pub available: bool,
    pub collections: Vec<Collection>,
    pub tracks: Vec<Track>,
}

/* -------------------------------------------------------------------------- */
/* Request helpers                                                            */
/* -------------------------------------------------------------------------- */

fn context() -> Value {
    json!({
        "client": {
            "clientName": CLIENT_NAME,
            "clientVersion": CLIENT_VERSION,
            "hl": "en",
            "gl": "US",
        },
        "user": { "lockedSafetyMode": false },
        "request": { "useSsl": true },
    })
}

/// The signed headers the private endpoints expect. Without cookies this is
/// empty and the request is anonymous — fine for search/browse/home.
fn origin_headers() -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("Origin", ORIGIN.to_string()),
        ("X-Origin", ORIGIN.to_string()),
        ("X-Goog-AuthUser", "0".to_string()),
    ];

    if let Ok(Some(cookie)) = auth::load_cookie_header() {
        if let Some(sapisid) = extract_cookie(&cookie, "SAPISID")
            .or_else(|| extract_cookie(&cookie, "__Secure-3PAPISID"))
        {
            let digest = auth::sapisid_hash_at(auth::now(), ORIGIN, &sapisid);
            headers.push(("Authorization", format!("SAPISIDHASH {digest}")));
        }
        headers.push(("Cookie", cookie));
    }

    headers
}

/// Which browser-cookie value is currently stored. Surfaced to the UI so it can
/// say "sign in to see your library" instead of showing an empty shelf.
pub fn library_available() -> bool {
    matches!(auth::load_cookie_header(), Ok(Some(_)))
}

async fn post(endpoint: &str, body: Value) -> Result<Value, String> {
    let mut request = auth::http()
        .post(format!("{ENDPOINT}{endpoint}"))
        .json(&body);
    for (name, value) in origin_headers() {
        request = request.header(name, value);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Não foi possível contatar o YouTube Music: {error}"))?;

    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("Resposta inesperada do YouTube Music ({status}): {error}"))?;

    if !status.is_success() {
        return Err(format!("O YouTube Music recusou a solicitação ({status})."));
    }

    Ok(payload)
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/// The signed-in (or anonymous) home feed.
#[tauri::command]
pub async fn music_home() -> Result<HomeData, String> {
    let payload = post(
        "browse",
        json!({ "context": context(), "browseId": "FEmusic_home" }),
    )
    .await?;
    Ok(parse_home(&payload))
}

/// Real catalogue search.
#[tauri::command]
pub async fn music_search(query: String) -> Result<CatalogPage, String> {
    let payload = post("search", json!({ "context": context(), "query": query })).await?;
    Ok(parse_page(&payload, None))
}

/// Opens an album (`MPREb_…`), a playlist (`VL…`) or any browse id.
#[tauri::command]
pub async fn music_browse(id: String) -> Result<CatalogPage, String> {
    let browse_id = normalise_browse_id(&id);
    let payload = post(
        "browse",
        json!({ "context": context(), "browseId": browse_id }),
    )
    .await?;

    let (title, subtitle, kind) = microformat(&payload);
    let mut page = parse_page(&payload, Some((title.clone(), subtitle, kind)));
    for track in &mut page.tracks {
        if track.album.is_empty() {
            track.album = title.clone();
        }
        if track.album_id.is_empty() {
            track.album_id = id.clone();
        }
    }
    if let Some(collection) = page.collections.first_mut() {
        collection.id = id;
    }
    Ok(page)
}

/// The personal library: playlists and liked songs. Requires stored cookies.
#[tauri::command]
pub async fn music_library() -> Result<LibraryStatus, String> {
    if !library_available() {
        return Ok(LibraryStatus {
            available: false,
            collections: Vec::new(),
            tracks: Vec::new(),
        });
    }

    let payload = post(
        "browse",
        json!({ "context": context(), "browseId": "FEmusic_liked_playlists" }),
    )
    .await?;

    let mut collections = Vec::new();
    let mut tracks = Vec::new();
    for item in collect(&payload, "musicTwoRowItemRenderer") {
        if let Some(collection) = two_row_collection(item) {
            collections.push(collection);
        }
    }
    for item in collect(&payload, "musicResponsiveListItemRenderer") {
        if let Some(track) = list_track(item, "", "", None) {
            tracks.push(track);
        }
    }

    // Saved albums live behind a different browse id.
    if let Ok(albums) = post(
        "browse",
        json!({ "context": context(), "browseId": "FEmusic_liked_albums" }),
    )
    .await
    {
        for item in collect(&albums, "musicTwoRowItemRenderer") {
            if let Some(collection) = two_row_collection(item) {
                collections.push(collection);
            }
        }
    }

    // Liked songs are their own playlist ("VLLM").
    if let Ok(liked) = post(
        "browse",
        json!({ "context": context(), "browseId": "VLLM" }),
    )
    .await
    {
        let mut liked_tracks = Vec::new();
        for item in collect(&liked, "musicResponsiveListItemRenderer") {
            if let Some(track) = list_track(item, "Músicas curtidas", "VLLM", None) {
                liked_tracks.push(track);
            }
        }
        if !liked_tracks.is_empty() {
            collections.push(Collection {
                id: "VLLM".to_string(),
                kind: "playlist".to_string(),
                format: "playlist".to_string(),
                title: "Músicas curtidas".to_string(),
                subtitle: "YouTube Music".to_string(),
                description: None,
                year: None,
                track_ids: liked_tracks.iter().map(|track| track.id.clone()).collect(),
                thumbnail: best_thumbnail(&liked),
            });
            tracks.extend(liked_tracks);
        }
    }

    let mut seen = std::collections::HashSet::new();
    collections.retain(|collection| seen.insert(collection.id.clone()));

    Ok(LibraryStatus {
        available: true,
        collections,
        tracks,
    })
}

/// Whether the personal library can be reached, without fetching it.
#[tauri::command]
pub fn music_library_status() -> bool {
    library_available()
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/// Depth-first collection of every `key` found anywhere in the document.
fn collect<'a>(value: &'a Value, key: &str) -> Vec<&'a Value> {
    let mut found = Vec::new();
    walk(value, key, &mut found);
    found
}

fn walk<'a>(value: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match value {
        Value::Object(map) => {
            if let Some(hit) = map.get(key) {
                // The key may hold a single object or an array of them.
                match hit {
                    Value::Array(items) => out.extend(items.iter()),
                    other => out.push(other),
                }
            }
            for child in map.values() {
                walk(child, key, out);
            }
        }
        Value::Array(items) => {
            for child in items {
                walk(child, key, out);
            }
        }
        _ => {}
    }
}

/// `{"simpleText": …}` / `{"runs": [{"text": …}]}` — both spellings are used.
fn text_of(value: &Value) -> String {
    if let Some(simple) = value.get("simpleText").and_then(Value::as_str) {
        return simple.to_string();
    }
    value
        .get("runs")
        .and_then(Value::as_array)
        .map(|runs| {
            runs.iter()
                .filter_map(|run| run.get("text").and_then(Value::as_str))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// The largest thumbnail url under `value`, if the response carries one.
fn best_thumbnail(value: &Value) -> Option<String> {
    let mut thumbnails = collect(value, "thumbnails");
    let first = thumbnails.first_mut()?.as_array()?;
    first.last()?.get("url")?.as_str().map(str::to_string)
}

/// `mm:ss` / `h:mm:ss`, or `None` for anything else.
fn clock(value: &str) -> Option<f64> {
    if !value.contains(':') || value.contains(' ') || value.len() > 8 {
        return None;
    }
    let mut total = 0f64;
    for part in value.split(':') {
        let unit: f64 = part.parse().ok()?;
        total = total * 60.0 + unit;
    }
    if total <= 0.0 { None } else { Some(total) }
}

const PAGE_TYPES: [&str; 8] = [
    "Song", "Video", "Album", "Playlist", "Artist", "Episode", "Podcast", "Profile",
];

/// Every text run in a list item, in order, with the ` • ` separators dropped.
fn tokens(item: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for column_key in ["flexColumns", "fixedColumns"] {
        let Some(columns) = item.get(column_key).and_then(Value::as_array) else {
            continue;
        };
        for column in columns {
            let Some(text) = column
                .get("musicResponsiveListItemFlexColumnRenderer")
                .and_then(|renderer| renderer.get("text"))
            else {
                continue;
            };
            let Some(runs) = text.get("runs").and_then(Value::as_array) else {
                continue;
            };
            for run in runs {
                if let Some(value) = run.get("text").and_then(Value::as_str) {
                    let trimmed = value.trim();
                    if !trimmed.is_empty() && trimmed != "•" {
                        out.push(trimmed.to_string());
                    }
                }
            }
        }
    }
    out
}

/// `"Play Veridis Quo (Edit) - Daft Punk"` → `(title, artist)`. This label is
/// the most reliable artist source, because some list items omit it from their
/// visible columns entirely.
fn accessibility_title_artist(item: &Value) -> Option<(String, String)> {
    let label = item
        .get("overlay")?
        .get("musicItemThumbnailOverlayRenderer")?
        .get("content")?
        .get("musicPlayButtonRenderer")?
        .get("accessibilityPlayData")?
        .get("accessibilityData")?
        .get("label")?
        .as_str()?;

    let trimmed = label.strip_prefix("Play ").unwrap_or(label);
    let (title, artist) = trimmed.rsplit_once(" - ")?;
    Some((title.to_string(), artist.to_string()))
}

fn video_id(item: &Value) -> Option<String> {
    // 1) The play overlay always carries the exact track id.
    if let Some(id) = item
        .get("overlay")
        .and_then(|overlay| overlay.get("musicItemThumbnailOverlayRenderer"))
        .and_then(|content| content.get("content"))
        .and_then(|content| content.get("musicPlayButtonRenderer"))
        .and_then(|button| button.get("playNavigationEndpoint"))
        .and_then(watch_video_id)
    {
        return Some(id);
    }

    // 2) Otherwise the title itself links to the watch page.
    let title = item
        .get("flexColumns")?
        .get(0)?
        .get("musicResponsiveListItemFlexColumnRenderer")?
        .get("text")?
        .get("runs")?
        .get(0)?;
    watch_video_id(&title.get("navigationEndpoint")?.clone())
}

fn watch_video_id(endpoint: &Value) -> Option<String> {
    endpoint
        .get("watchEndpoint")
        .and_then(|watch| watch.get("videoId"))
        .and_then(Value::as_str)
        .or_else(|| {
            endpoint
                .get("watchPlaylistEndpoint")
                .and_then(|watch| watch.get("playlistId"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
}

fn browse_id_of(item: &Value) -> Option<String> {
    item.get("navigationEndpoint")
        .and_then(|navigation| navigation.get("browseEndpoint"))
        .and_then(|browse| browse.get("browseId"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            item.get("navigationEndpoint")
                .and_then(|navigation| navigation.get("watchEndpoint"))
                .and_then(|watch| watch.get("playlistId"))
                .and_then(Value::as_str)
                .map(|id| format!("VL{id}"))
        })
}

/// Builds a track from a `musicResponsiveListItemRenderer`.
fn list_track(
    item: &Value,
    album: &str,
    album_id: &str,
    album_thumb: Option<&str>,
) -> Option<Track> {
    let id = video_id(item)?;
    let all = tokens(item);

    let column_title = item
        .get("flexColumns")
        .and_then(|columns| columns.get(0))
        .and_then(|column| column.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|renderer| renderer.get("text"))
        .map(text_of)
        .filter(|text| !text.is_empty());

    let (label_title, label_artist) = accessibility_title_artist(item).unzip();

    let title = column_title
        .or(label_title)
        .unwrap_or_else(|| "Faixa desconhecida".to_string());

    let page_type = all
        .iter()
        .find(|token| PAGE_TYPES.contains(&token.as_str()));
    let duration = all.iter().find_map(|token| clock(token)).unwrap_or(0.0);
    let plays = all
        .iter()
        .find(|token| {
            token.ends_with("plays") || token.ends_with("views") || token.ends_with("ouvintes")
        })
        .cloned()
        .unwrap_or_default();

    // The artist is the token right after the page type, or the second visible
    // column when no page type is present (album and library shelves).
    let artist = label_artist
        .or_else(|| {
            page_type
                .and_then(|kind| all.iter().skip_while(|token| *token != kind).nth(1))
                .filter(|token| !token.ends_with("plays") && clock(token).is_none())
                .cloned()
        })
        .or_else(|| all.get(1).cloned())
        .unwrap_or_else(|| "Artista desconhecido".to_string());

    Some(Track {
        id,
        title,
        artist,
        album: album.to_string(),
        album_id: album_id.to_string(),
        duration,
        year: 0,
        plays,
        thumbnail: best_thumbnail(item)
            .or_else(|| album_thumb.map(str::to_string))
            .unwrap_or_default(),
    })
}

fn two_row_collection(item: &Value) -> Option<Collection> {
    let id = browse_id_of(item)?;
    let title = item.get("title").map(text_of).unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let subtitle = item.get("subtitle").map(text_of).unwrap_or_default();
    let kind = if id.starts_with("MPRE") || id.starts_with("OLAK") {
        "album"
    } else {
        "playlist"
    };

    Some(Collection {
        id,
        kind: kind.to_string(),
        format: kind.to_string(),
        title,
        subtitle,
        description: None,
        year: None,
        track_ids: Vec::new(),
        thumbnail: best_thumbnail(item),
    })
}

/// The `ogType`-style header YouTube Music ships for detail pages.
fn microformat(payload: &Value) -> (String, String, String) {
    let data = payload
        .get("microformat")
        .and_then(|micro| micro.get("microformatDataRenderer"));

    let title = data
        .and_then(|data| data.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("Coleção")
        .to_string();
    let description = data
        .and_then(|data| data.get("description"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let og_type = data
        .and_then(|data| data.get("ogType"))
        .and_then(Value::as_str)
        .unwrap_or("");

    // "Album • Daft Punk" / "Playlist • SlowMusicOfficial".
    let mut parts = description.split(" • ");
    let kind = parts.next().unwrap_or("");
    let subtitle = parts.collect::<Vec<_>>().join(" • ");

    if og_type == "music.song" {
        return (title, subtitle, "playlist".to_string());
    }
    let normalised = match kind {
        "Album" => "album",
        "Single" => "single",
        "EP" => "ep",
        "Playlist" => "playlist",
        _ => "album",
    };
    (title, subtitle, normalised.to_string())
}

/// Parses any response that contains songs and/or collection cards.
fn parse_page(payload: &Value, header: Option<(String, String, String)>) -> CatalogPage {
    let mut tracks: Vec<Track> = Vec::new();
    let mut collections: Vec<Collection> = Vec::new();

    let (album_title, album_id, album_thumb) = match &header {
        Some((title, _, _)) => (title.clone(), String::new(), best_thumbnail(payload)),
        None => (String::new(), String::new(), None),
    };

    for item in collect(payload, "musicResponsiveListItemRenderer") {
        let all = tokens(item);
        let page_type = all
            .iter()
            .find(|token| PAGE_TYPES.contains(&token.as_str()));

        match page_type.map(String::as_str) {
            Some("Album") | Some("Playlist") => {
                if let Some(collection) = list_collection(item) {
                    collections.push(collection);
                }
            }
            Some("Artist") | Some("Podcast") | Some("Profile") | Some("Episode") => {}
            _ => {
                if let Some(track) =
                    list_track(item, &album_title, &album_id, album_thumb.as_deref())
                {
                    tracks.push(track);
                }
            }
        }
    }

    for item in collect(payload, "musicTwoRowItemRenderer") {
        if let Some(collection) = two_row_collection(item) {
            collections.push(collection);
        }
    }

    // A detail page with a header describes exactly one collection. Dedupe the
    // cards that came out of the body first, so the header (which has no id yet)
    // survives the identity filter below.
    dedupe(&mut collections);
    if let Some((title, subtitle, format)) = header {
        let track_ids = tracks.iter().map(|track| track.id.clone()).collect();
        collections.insert(
            0,
            Collection {
                id: String::new(),
                kind: if format == "playlist" {
                    "playlist".to_string()
                } else {
                    "album".to_string()
                },
                format,
                title,
                subtitle,
                description: None,
                year: None,
                track_ids,
                thumbnail: album_thumb,
            },
        );
    }

    CatalogPage {
        collections,
        tracks,
    }
}

/// Collection card from a search/list item (`Album` / `Playlist` rows).
fn list_collection(item: &Value) -> Option<Collection> {
    let id = browse_id_of(item)?;
    let title = item
        .get("flexColumns")
        .and_then(|columns| columns.get(0))
        .and_then(|column| column.get("musicResponsiveListItemFlexColumnRenderer"))
        .and_then(|renderer| renderer.get("text"))
        .map(text_of)?;

    let all = tokens(item);
    let page_type = all
        .iter()
        .find(|token| PAGE_TYPES.contains(&token.as_str()))
        .cloned()
        .unwrap_or_else(|| "Playlist".to_string());
    let subtitle = all
        .iter()
        .skip_while(|token| **token != page_type)
        .nth(1)
        .filter(|token| !token.ends_with("plays"))
        .cloned()
        .unwrap_or_default();

    let kind = if page_type == "Album" {
        "album"
    } else {
        "playlist"
    };

    Some(Collection {
        id,
        kind: kind.to_string(),
        format: kind.to_string(),
        title,
        subtitle,
        description: None,
        year: None,
        track_ids: Vec::new(),
        thumbnail: best_thumbnail(item),
    })
}

fn parse_home(payload: &Value) -> HomeData {
    let mut collections: Vec<Collection> = Vec::new();
    let mut shelves: Vec<Shelf> = Vec::new();

    for carousel in collect(payload, "musicCarouselShelfRenderer") {
        let title = carousel
            .get("header")
            .and_then(|header| header.get("musicCarouselShelfBasicHeaderRenderer"))
            .and_then(|header| header.get("title"))
            .map(text_of)
            .unwrap_or_default();
        if title.is_empty() {
            continue;
        }

        let mut ids = Vec::new();
        for item in collect(carousel, "musicTwoRowItemRenderer") {
            if let Some(collection) = two_row_collection(item) {
                ids.push(collection.id.clone());
                collections.push(collection);
            }
        }
        if !ids.is_empty() {
            shelves.push(Shelf {
                title,
                subtitle: None,
                ids,
            });
        }
    }

    let quick_picks = shelves
        .iter()
        .find(|shelf| shelf.title.eq_ignore_ascii_case("Quick picks"))
        .map(|shelf| shelf.ids.clone())
        .unwrap_or_else(|| {
            shelves
                .first()
                .map(|shelf| shelf.ids.clone())
                .unwrap_or_default()
        });

    dedupe(&mut collections);
    HomeData {
        quick_picks,
        shelves,
        collections,
    }
}

fn dedupe(collections: &mut Vec<Collection>) {
    let mut seen = std::collections::HashSet::new();
    collections
        .retain(|collection| !collection.id.is_empty() && seen.insert(collection.id.clone()));
}

/// `PL…` → `VLPL…` (a bare playlist id is not a valid browse id).
fn normalise_browse_id(id: &str) -> String {
    if id.starts_with("PL") || id.starts_with("RD") || id.starts_with("OLAK") {
        format!("VL{id}")
    } else {
        id.to_string()
    }
}

fn extract_cookie(cookie: &str, name: &str) -> Option<String> {
    cookie
        .split(';')
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(key, _)| *key == name)
        .map(|(_, value)| value.to_string())
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clock_reads_mm_ss_and_h_mm_ss() {
        assert_eq!(clock("2:45"), Some(165.0));
        assert_eq!(clock("1:02:03"), Some(3723.0));
        assert_eq!(clock("Song"), None);
        assert_eq!(clock("110M plays"), None);
    }

    #[test]
    fn extract_cookie_picks_the_named_pair() {
        let cookie = "VISITOR=abc; SAPISID=xyz-123; HSID=1|2";
        assert_eq!(
            extract_cookie(cookie, "SAPISID").as_deref(),
            Some("xyz-123")
        );
        assert_eq!(extract_cookie(cookie, "NOPE"), None);
    }

    #[test]
    fn normalise_prefixes_bare_playlist_ids() {
        assert_eq!(normalise_browse_id("PL123"), "VLPL123");
        assert_eq!(normalise_browse_id("VLPL123"), "VLPL123");
        assert_eq!(normalise_browse_id("MPREb_abc"), "MPREb_abc");
    }

    #[test]
    fn parses_a_search_song_the_way_the_web_player_shows_it() {
        let item = serde_json::from_str(SEARCH_SONG).unwrap();
        let track = list_track(&item, "", "", None).expect("a track");

        assert_eq!(track.id, "uSFXOBaqiR8");
        assert_eq!(track.title, "Veridis Quo (Edit)");
        assert_eq!(track.artist, "Daft Punk");
        assert_eq!(track.duration, 165.0);
        assert_eq!(track.plays, "110M plays");
    }

    #[test]
    fn search_results_split_into_tracks_and_collections() {
        let payload = serde_json::from_str(SEARCH_PAGE).unwrap();
        let page = parse_page(&payload, None);

        assert!(page.tracks.iter().any(|track| track.title == "Da Funk"));
        assert!(
            page.collections
                .iter()
                .any(|collection| collection.id == "MPREb_K8qWMWVqXGi")
        );
    }

    #[test]
    fn album_shelf_yields_an_album_with_its_tracks() {
        let payload = serde_json::from_str(ALBUM_PAGE).unwrap();
        let header = microformat(&payload);
        assert_eq!(header.0, "Random Access Memories");
        assert_eq!(header.2, "album");

        let page = parse_page(&payload, Some(header));
        assert_eq!(page.tracks.len(), 2);
        assert_eq!(page.tracks[0].id, "IluRBvnYMoY");
        assert_eq!(page.collections[0].format, "album");
        assert_eq!(page.collections[0].track_ids.len(), 2);
    }

    #[test]
    fn home_reads_quick_picks_off_the_carousel() {
        let payload = serde_json::from_str(HOME_PAGE).unwrap();
        let home = parse_home(&payload);

        assert_eq!(
            home.quick_picks,
            vec!["VLPLGRY1G015gD0Wn9cQuJqHwyrikKyPb7dZ"]
        );
        assert_eq!(home.shelves[0].title, "Quick picks");
    }

    /// Hits the real InnerTube API. Opt-in (`YTM_LIVE=1`) so CI stays offline and
    /// deterministic; run it locally to confirm the parser still matches reality
    /// when YouTube changes a response shape.
    #[test]
    fn live_endpoints_match_the_parser() {
        if std::env::var("YTM_LIVE").is_err() {
            return;
        }

        let search = tauri::async_runtime::block_on(music_search("daft punk".to_string()))
            .expect("live search");
        assert!(!search.tracks.is_empty(), "search returned no tracks");
        assert!(
            search.collections.iter().any(|c| c.kind == "album"),
            "search returned no albums"
        );
        let first = &search.tracks[0];
        assert!(!first.id.is_empty() && !first.title.is_empty());

        let album = search
            .collections
            .iter()
            .find(|c| c.kind == "album")
            .unwrap()
            .id
            .clone();
        let page = tauri::async_runtime::block_on(music_browse(album.clone())).expect("browse");
        assert_eq!(page.collections[0].id, album);
        assert!(!page.tracks.is_empty(), "album had no tracks");
        assert!(page.tracks.iter().all(|t| t.album_id == album));

        let home = tauri::async_runtime::block_on(music_home()).expect("home");
        assert!(!home.shelves.is_empty(), "home returned no shelves");
    }

    // --- fixtures: real responses, trimmed to the fields the parser reads ---

    const SEARCH_SONG: &str = r#"{
      "overlay": { "musicItemThumbnailOverlayRenderer": { "content": {
        "musicPlayButtonRenderer": {
          "playNavigationEndpoint": { "watchEndpoint": { "videoId": "uSFXOBaqiR8" } },
          "accessibilityPlayData": { "accessibilityData": { "label": "Play Veridis Quo (Edit) - Daft Punk" } }
        } } } },
      "flexColumns": [
        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
          { "text": "Veridis Quo (Edit)" } ] } } },
        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
          { "text": "Song" }, { "text": " • " }, { "text": "2:45" } ] } } },
        { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
          { "text": "110M plays" } ] } } }
      ]
    }"#;

    const SEARCH_PAGE: &str = r#"{
      "contents": { "musicResponsiveListItemRenderer": [
        {
          "overlay": { "musicItemThumbnailOverlayRenderer": { "content": { "musicPlayButtonRenderer": {
            "playNavigationEndpoint": { "watchEndpoint": { "videoId": "d7woYjGWs6k" } },
            "accessibilityPlayData": { "accessibilityData": { "label": "Play Da Funk - Daft Punk" } } } } } },
          "flexColumns": [
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "Da Funk" } ] } } },
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
              { "text": "Song" }, { "text": " • " }, { "text": "Daft Punk" } ] } } }
          ]
        },
        {
          "navigationEndpoint": { "browseEndpoint": { "browseId": "MPREb_K8qWMWVqXGi" } },
          "flexColumns": [
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "Random Access Memories" } ] } } },
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [
              { "text": "Album" }, { "text": " • " }, { "text": "Daft Punk" }, { "text": " • " }, { "text": "2013" } ] } } }
          ]
        }
      ] }
    }"#;

    const ALBUM_PAGE: &str = r#"{
      "microformat": { "microformatDataRenderer": {
        "title": "Random Access Memories",
        "description": "Album • Daft Punk",
        "ogType": "music.album" } },
      "contents": { "musicShelfRenderer": { "contents": [
        { "musicResponsiveListItemRenderer": {
          "overlay": { "musicItemThumbnailOverlayRenderer": { "content": { "musicPlayButtonRenderer": {
            "playNavigationEndpoint": { "watchEndpoint": { "videoId": "IluRBvnYMoY" } },
            "accessibilityPlayData": { "accessibilityData": { "label": "Play Give Life Back to Music - Daft Punk" } } } } } },
          "flexColumns": [
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "Give Life Back to Music" } ] } } },
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "Daft Punk" } ] } } }
          ] } },
        { "musicResponsiveListItemRenderer": {
          "overlay": { "musicItemThumbnailOverlayRenderer": { "content": { "musicPlayButtonRenderer": {
            "playNavigationEndpoint": { "watchEndpoint": { "videoId": "ZVJ4Z8V5wGA" } },
            "accessibilityPlayData": { "accessibilityData": { "label": "Play The Game of Love - Daft Punk" } } } } } },
          "flexColumns": [
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "The Game of Love" } ] } } },
            { "musicResponsiveListItemFlexColumnRenderer": { "text": { "runs": [ { "text": "Daft Punk" } ] } } }
          ] } }
      ] } }
    }"#;

    const HOME_PAGE: &str = r#"{
      "contents": { "musicCarouselShelfRenderer": {
        "header": { "musicCarouselShelfBasicHeaderRenderer": { "title": { "runs": [ { "text": "Quick picks" } ] } } },
        "contents": [ { "musicTwoRowItemRenderer": {
          "title": { "runs": [ { "text": "2000's" } ] },
          "subtitle": { "runs": [ { "text": "Playlist" } ] },
          "navigationEndpoint": { "browseEndpoint": { "browseId": "VLPLGRY1G015gD0Wn9cQuJqHwyrikKyPb7dZ" } },
          "thumbnailRenderer": { "musicThumbnailRenderer": { "thumbnail": { "thumbnails": [
            { "url": "https://example.test/small.jpg", "width": 60 },
            { "url": "https://example.test/big.jpg", "width": 226 } ] } } } } } ]
      } }
    }"#;
}
