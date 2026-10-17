//! Authentication for YTM Desktop.
//!
//! Two schemes exist in the wild, and conflating them is the usual source of
//! broken YouTube Music clients:
//!
//! * **OAuth 2.0 Device Authorization Grant** (implemented here). Documented,
//!   reviewable scopes, works against the public YouTube Data API. It is what
//!   this module ships and what the sign-in screen drives.
//! * **Cookie + `SAPISIDHASH`** (the signing helper is here). The private
//!   InnerTube endpoints that carry the full YouTube Music library do not
//!   accept a bearer token; they want the browser cookie plus a per-request
//!   digest. Undocumented, and it can break without notice.
//!
//! Secrets never cross into the webview. The refresh token is written only
//! from Rust, only to the operating system credential vault.
//!
//! Reference: <https://developers.google.com/identity/protocols/oauth2/limited-input-device>

use std::collections::BTreeMap;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use keyring::v1::Entry;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

const DEVICE_CODE_ENDPOINT: &str = "https://oauth2.googleapis.com/device/code";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
/// Only scopes on Google's allowed list for this flow can be requested.
const SCOPES: &str = "openid email profile https://www.googleapis.com/auth/youtube.readonly";

const KEYRING_SERVICE: &str = "dev.ytm.desktop";
const KEYRING_ACCOUNT: &str = "google-refresh-token";
/// The `Cookie` header for the private InnerTube endpoints. Separate from the
/// OAuth refresh token: the personal library is only reachable with cookies.
const KEYRING_COOKIE_ACCOUNT: &str = "youtube-music-cookie";

/// No credentials are hardcoded. Supply your own TV / limited-input client.
const CLIENT_ID_ENV: &str = "YTM_GOOGLE_CLIENT_ID";
const CLIENT_SECRET_ENV: &str = "YTM_GOOGLE_CLIENT_SECRET";

/* -------------------------------------------------------------------------- */
/* Wire types                                                                 */
/* -------------------------------------------------------------------------- */

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_url: Option<String>,
    verification_uri: Option<String>,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct Profile {
    name: Option<String>,
    email: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    /// Short, human-typed code. Display only — never sent back to Google.
    pub user_code: String,
    /// Opaque handle used for polling. Distinct from `user_code`; conflating
    /// the two is the classic way to get a device flow that never completes.
    pub device_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub display_name: String,
    pub email: String,
    pub via: String,
    pub signed_in_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum PollResult {
    Pending,
    SlowDown,
    Denied,
    Expired,
    Granted { session: Session },
}

struct Credentials {
    client_id: String,
    client_secret: String,
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

/// Step 1 of the device flow: ask Google for a user code and a verification URL.
#[tauri::command]
pub async fn auth_begin_device_flow() -> Result<DeviceCode, String> {
    let credentials = credentials()?;

    let response = http()
        .post(DEVICE_CODE_ENDPOINT)
        .form(&[
            ("client_id", credentials.client_id.as_str()),
            ("scope", SCOPES),
        ])
        .send()
        .await
        .map_err(|error| format!("Não foi possível contatar o Google: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        if body.contains("rate_limit_exceeded") {
            return Err(
                "Muitas solicitações de código em pouco tempo. Aguarde alguns minutos.".to_string(),
            );
        }
        return Err(describe_failure(status.as_u16(), &body));
    }

    let payload: DeviceCodeResponse = response
        .json()
        .await
        .map_err(|error| format!("Resposta inesperada do Google: {error}"))?;

    Ok(DeviceCode {
        user_code: payload.user_code,
        device_code: payload.device_code,
        verification_url: payload
            .verification_url
            .or(payload.verification_uri)
            .unwrap_or_else(|| "https://www.google.com/device".to_string()),
        expires_in: payload.expires_in,
        interval: payload.interval.unwrap_or(5),
    })
}

/// Step 2: poll until the user approves, then persist the refresh token.
///
/// The response body carries the outcome in every case (`authorization_pending`
/// arrives as HTTP 428, `slow_down` and `access_denied` as 403), so the status
/// code is deliberately not the discriminator here.
#[tauri::command]
pub async fn auth_poll_device_flow(device_code: String) -> Result<PollResult, String> {
    let credentials = credentials()?;

    let response = http()
        .post(TOKEN_ENDPOINT)
        .form(&poll_form(&credentials, &device_code))
        .send()
        .await
        .map_err(|error| format!("Não foi possível contatar o Google: {error}"))?;

    let status = response.status();
    let payload: TokenResponse = response
        .json()
        .await
        .map_err(|error| format!("Resposta inesperada do Google: {error}"))?;

    if let Some(error) = payload.error.as_deref() {
        return match error {
            "authorization_pending" => Ok(PollResult::Pending),
            "slow_down" => Ok(PollResult::SlowDown),
            "access_denied" => Ok(PollResult::Denied),
            "expired_token" | "invalid_grant" => Ok(PollResult::Expired),
            other => Err(describe_failure(status.as_u16(), other)),
        };
    }

    let access_token = payload
        .access_token
        .ok_or_else(|| "O Google autorizou mas não devolveu um token de acesso.".to_string())?;

    // Refresh tokens are always issued for this flow; losing one means the user
    // has to repeat the whole device dance, so a storage failure is fatal.
    let refresh_token = payload
        .refresh_token
        .ok_or_else(|| "O Google não devolveu um token de atualização.".to_string())?;
    store_refresh_token(&refresh_token)?;

    Ok(PollResult::Granted {
        session: fetch_profile(&access_token).await,
    })
}

/// Reuses a stored refresh token, so a restart does not force a new sign-in.
#[tauri::command]
pub async fn auth_restore_session() -> Result<Option<Session>, String> {
    let Some(refresh_token) = load_refresh_token()? else {
        return Ok(None);
    };
    let credentials = credentials()?;

    let response = http()
        .post(TOKEN_ENDPOINT)
        .form(&refresh_form(&credentials, &refresh_token))
        .send()
        .await
        .map_err(|error| format!("Não foi possível contatar o Google: {error}"))?;

    let payload: TokenResponse = response
        .json()
        .await
        .map_err(|error| format!("Resposta inesperada do Google: {error}"))?;

    // A revoked or expired grant is a normal outcome, not an error: clear it
    // and fall back to the signed-out screen.
    if payload.error.is_some() {
        clear_refresh_token()?;
        return Ok(None);
    }

    let Some(access_token) = payload.access_token else {
        return Ok(None);
    };

    Ok(Some(fetch_profile(&access_token).await))
}

#[tauri::command]
pub fn auth_sign_out() -> Result<(), String> {
    clear_refresh_token()
}

/// Stores the browser cookie used to reach the personal library.
///
/// The private InnerTube endpoints ignore bearer tokens; they authenticate with
/// the same `Cookie` header the browser sends to `music.youtube.com`, signed
/// per-request with `SAPISIDHASH`. This command is the seam that lets the user
/// paste that header once; it lives only in the OS vault, like the refresh
/// token.
#[tauri::command]
pub fn auth_save_cookies(cookies: String) -> Result<(), String> {
    let trimmed = cookies.trim();
    if trimmed.is_empty() {
        return clear_cookie_header();
    }
    if !trimmed.contains("SAPISID") && !trimmed.contains("__Secure-3PAPISID") {
        return Err(
            "Cookie inválido: falta o valor SAPISID ou __Secure-3PAPISID.".to_string(),
        );
    }
    cookie_entry()?
        .set_password(trimmed)
        .map_err(|error| format!("Não foi possível gravar o cookie no cofre do sistema: {error}"))
}

#[tauri::command]
pub fn auth_clear_cookies() -> Result<(), String> {
    clear_cookie_header()
}

/// Whether a library cookie is stored. Never returns the value itself.
#[tauri::command]
pub fn auth_cookie_status() -> bool {
    matches!(load_cookie_header(), Ok(Some(_)))
}

pub(crate) fn load_cookie_header() -> Result<Option<String>, String> {
    match cookie_entry()?.get_password() {
        Ok(cookie) => Ok(Some(cookie)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Não foi possível ler o cookie do cofre do sistema: {error}"
        )),
    }
}

fn clear_cookie_header() -> Result<(), String> {
    match cookie_entry()?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível remover o cookie do cofre do sistema: {error}"
        )),
    }
}

fn cookie_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_COOKIE_ACCOUNT)
        .map_err(|error| format!("Cofre de credenciais do sistema indisponível: {error}"))
}

/// Signs a request the way the YouTube Music client does for the private
/// InnerTube API: `SAPISIDHASH <seconds>_<sha1(seconds sapisid origin)>`.
///
/// Present so the wiring is visible and testable; unused by the OAuth path.
#[tauri::command]
pub fn auth_build_headers(
    origin: String,
    sapisid: String,
    authorization: Option<String>,
) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    headers.insert(
        "Authorization".to_string(),
        authorization.unwrap_or_else(|| format!("SAPISIDHASH {}", sapisid_hash(&origin, &sapisid))),
    );
    headers.insert("Origin".to_string(), origin.clone());
    headers.insert("X-Origin".to_string(), origin);
    headers.insert("X-Goog-AuthUser".to_string(), "0".to_string());
    headers
}

/* -------------------------------------------------------------------------- */
/* Request bodies                                                             */
/* -------------------------------------------------------------------------- */

/// Google requires `client_secret` on the device-code poll even though the app
/// is distributed to end devices — its own documentation assumes such apps
/// cannot keep secrets. Omitting it fails with `invalid_request`.
fn poll_form<'a>(credentials: &'a Credentials, device_code: &'a str) -> Vec<(&'a str, &'a str)> {
    vec![
        ("client_id", credentials.client_id.as_str()),
        ("client_secret", credentials.client_secret.as_str()),
        ("device_code", device_code),
        ("grant_type", DEVICE_GRANT),
    ]
}

/// On refresh, `client_secret` is optional per the specification; it is sent
/// anyway so one credential shape covers every call.
fn refresh_form<'a>(
    credentials: &'a Credentials,
    refresh_token: &'a str,
) -> Vec<(&'a str, &'a str)> {
    vec![
        ("client_id", credentials.client_id.as_str()),
        ("client_secret", credentials.client_secret.as_str()),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ]
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/// Shared HTTP client for every network call the app makes.
pub(crate) fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("ytm-desktop/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client builds from a static configuration")
    })
}

fn credentials() -> Result<Credentials, String> {
    let client_id = std::env::var(CLIENT_ID_ENV).map_err(|_| missing(CLIENT_ID_ENV))?;
    let client_secret = std::env::var(CLIENT_SECRET_ENV).map_err(|_| missing(CLIENT_SECRET_ENV))?;
    Ok(Credentials {
        client_id,
        client_secret,
    })
}

fn missing(variable: &str) -> String {
    format!(
        "Defina {variable} para habilitar o login. Crie um cliente OAuth do tipo \
         \"TVs and Limited Input devices\" no Google Cloud Console."
    )
}

async fn fetch_profile(access_token: &str) -> Session {
    let mut session = Session {
        display_name: "Conta Google".to_string(),
        email: "conectada".to_string(),
        via: "device-code".to_string(),
        signed_in_at: now(),
    };

    let Ok(response) = http()
        .get(USERINFO_ENDPOINT)
        .bearer_auth(access_token)
        .send()
        .await
    else {
        return session;
    };

    if let Ok(profile) = response.json::<Profile>().await {
        if let Some(name) = profile.name {
            session.display_name = name;
        }
        if let Some(email) = profile.email {
            session.email = email;
        }
    }

    session
}

fn describe_failure(status: u16, detail: &str) -> String {
    format!("O Google recusou a solicitação ({status}): {detail}")
}

pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

fn entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("Cofre de credenciais do sistema indisponível: {error}"))
}

fn store_refresh_token(token: &str) -> Result<(), String> {
    entry()?
        .set_password(token)
        .map_err(|error| format!("Não foi possível gravar o token no cofre do sistema: {error}"))
}

fn load_refresh_token() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::v1::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Não foi possível ler o token do cofre do sistema: {error}"
        )),
    }
}

fn clear_refresh_token() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::v1::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Não foi possível remover o token do cofre do sistema: {error}"
        )),
    }
}

/// `SHA1("<seconds> <sapisid> <origin>")`, prefixed with the timestamp it was
/// computed from.
pub fn sapisid_hash_at(timestamp: u64, origin: &str, sapisid: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(format!("{timestamp} {sapisid} {origin}").as_bytes());
    format!("{timestamp}_{}", hex::encode(hasher.finalize()))
}

fn sapisid_hash(origin: &str, sapisid: &str) -> String {
    sapisid_hash_at(now(), origin, sapisid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credentials() -> Credentials {
        Credentials {
            client_id: "client-id.apps.googleusercontent.com".to_string(),
            client_secret: "client-secret".to_string(),
        }
    }

    #[test]
    fn sapisid_hash_matches_the_documented_construction() {
        // Vector computed independently with
        // sha1("1700000000 SAPISID-EXAMPLE https://music.youtube.com").
        assert_eq!(
            sapisid_hash_at(1700000000, "https://music.youtube.com", "SAPISID-EXAMPLE"),
            "1700000000_c3379152e4d14a64ff124dec8a93c9a8f0861c2c"
        );
    }

    // Regression guard: the poll previously omitted client_secret, and Google
    // answers that with HTTP 400 invalid_request: "Missing required parameter".
    #[test]
    fn poll_form_carries_the_client_secret() {
        let credentials = credentials();
        let form = poll_form(&credentials, "device-code");
        assert!(form.contains(&("client_secret", "client-secret")));
        assert!(form.contains(&("device_code", "device-code")));
        assert!(form.contains(&("grant_type", DEVICE_GRANT)));
        assert!(form.contains(&("client_id", "client-id.apps.googleusercontent.com")));
    }

    #[test]
    fn refresh_form_carries_the_client_secret() {
        let credentials = credentials();
        let form = refresh_form(&credentials, "refresh-token");
        assert!(form.contains(&("client_secret", "client-secret")));
        assert!(form.contains(&("grant_type", "refresh_token")));
    }

    #[test]
    fn headers_carry_the_signed_authorization() {
        let headers = auth_build_headers(
            "https://music.youtube.com".to_string(),
            "SAPISID-EXAMPLE".to_string(),
            Some("SAPISIDHASH 1_abc".to_string()),
        );

        assert_eq!(
            headers.get("Authorization").map(String::as_str),
            Some("SAPISIDHASH 1_abc")
        );
        assert_eq!(
            headers.get("X-Goog-AuthUser").map(String::as_str),
            Some("0")
        );
        assert_eq!(
            headers.get("Origin").map(String::as_str),
            Some("https://music.youtube.com")
        );
    }

    #[test]
    fn headers_sign_when_no_authorization_is_supplied() {
        let headers = auth_build_headers(
            "https://music.youtube.com".to_string(),
            "SAPISID-EXAMPLE".to_string(),
            None,
        );
        let authorization = headers.get("Authorization").expect("signed");
        let digest = authorization
            .strip_prefix("SAPISIDHASH ")
            .expect("carries the scheme");
        let (seconds, hash) = digest.split_once('_').expect("is timestamp_digest");

        assert!(seconds.parse::<u64>().is_ok());
        assert_eq!(hash.len(), 40);
        assert!(hash.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn granted_and_error_payloads_parse() {
        let granted: TokenResponse =
            serde_json::from_str(r#"{"access_token":"a","refresh_token":"r"}"#).expect("parses");
        assert_eq!(granted.access_token.as_deref(), Some("a"));
        assert_eq!(granted.refresh_token.as_deref(), Some("r"));
        assert!(granted.error.is_none());

        let pending: TokenResponse =
            serde_json::from_str(r#"{"error":"authorization_pending"}"#).expect("parses");
        assert_eq!(pending.error.as_deref(), Some("authorization_pending"));
        assert!(pending.access_token.is_none());
    }

    #[test]
    fn poll_result_serialises_the_shape_the_ui_expects() {
        let pending = serde_json::to_value(PollResult::Pending).expect("serialises");
        assert_eq!(pending["status"], "pending");

        let slow = serde_json::to_value(PollResult::SlowDown).expect("serialises");
        assert_eq!(slow["status"], "slow-down");
    }
}
