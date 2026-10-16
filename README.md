# YTM Desktop

A YouTube Music desktop client prototype — **Tauri 2 + React 19 + Tailwind 4** — built around the
interaction model people already have in their fingers from Spotify.

The point of the prototype is the surface: a dense three-pane desktop shell, a real transport, a
queue, and an honest sign-in flow. Playback is simulated against a bundled mock catalogue; the
authentication path is implemented end to end in Rust.

![Sign-in](docs/screenshots/01-signin.png)

| | |
|---|---|
| ![Home](docs/screenshots/03-home.png) | ![Now playing](docs/screenshots/04-playing-queue.png) |
| ![Album](docs/screenshots/05-album.png) | ![Library](docs/screenshots/06-library.png) |
| ![Device code](docs/screenshots/02-device-code.png) | ![Search](docs/screenshots/07-search.png) |

And the same UI inside the actual Tauri window on Windows — not a browser tab:

![Native window](docs/screenshots/09-native-window.png)

## What is real and what is not

| Area | Status |
|---|---|
| Playback transport, queue, shuffle, repeat, volume, likes | Real state machine, **simulated audio** |
| Catalogue | Bundled mock data — no YouTube Music content is fetched |
| Artwork | Generated from a hash of the release id, so there are no image assets to ship |
| Search | Real filtering over the mock catalogue |
| Persistence | Likes, volume and repeat mode in `localStorage` |
| Sign-in | Real OAuth 2.0 device flow in Rust against Google, plus the private-API header signing helper |
| Token storage | Real OS credential vault (`keyring`: Windows Credential Manager / Keychain / Secret Service) |
| Library sync, playback of real audio | Not implemented |

## Stack

- **Tauri 2** — Rust backend, ~6 MB binary, no bundled Chromium
- **React 19** + **TypeScript 6** (strict) — no router, no state library, one reducer for playback
- **Tailwind 4** — CSS-first `@theme` tokens, Vite plugin
- **lucide-react** — icons
- **reqwest / sha1 / keyring** — the Rust side

## Getting started

```bash
npm install

# 1. Review the UI in a browser (auth is simulated here)
npm run dev

# 2. Run the real desktop app
npm run tauri dev

# Production build
npm run build && npm run tauri build
```

Only the desktop build talks to Google. In the browser the auth backend is swapped for a simulated
one so the flow can be reviewed without credentials — the screen itself says so.

## Authentication

The full write-up is in **[docs/authentication.md](docs/authentication.md)**. The short version:

- The app uses Google's **OAuth 2.0 Device Authorization Grant**. You get a short code, approve it on
  `google.com/device`, and the app polls for a token. No password is ever typed into the app and no
  embedded browser is needed.
- The **refresh token is written only from Rust**, only into the OS credential vault. It never enters
  the webview and never touches `localStorage`.
- The private YouTube Music (InnerTube) endpoints that carry the real library do **not** accept a
  bearer token. They want a browser cookie plus a per-request `SAPISIDHASH` digest. That construction
  is implemented in `src-tauri/src/auth.rs` and unit-tested, but it is undocumented and fragile — see
  the trade-offs table in the write-up.

To run the real flow you need your own OAuth client of type *TVs and Limited Input devices*:

```powershell
$env:YTM_GOOGLE_CLIENT_ID     = "000000000000-xxxx.apps.googleusercontent.com"
$env:YTM_GOOGLE_CLIENT_SECRET = "GOCSPX-xxxx"
npm run tauri dev
```

Without them the sign-in screen reports exactly what is missing instead of failing silently. Neither
value is ever committed.

## Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` `→` | Seek ∓5 s |
| `↑` `↓` | Volume ±5 % |
| `n` / `p` | Next / previous track |
| `m` | Mute |

Ignored while typing in a field or while a button has focus, so nothing hijacks expected behaviour.

## Project structure

```
src/
  App.tsx                  shell: auth gate, view routing, keyboard shortcuts
  types.ts                 domain model, no React
  data/catalog.ts          mock catalogue + Collection projection
  hooks/usePlayer.tsx      playback reducer (queue, order, cursor, repeat)
  hooks/useAuth.tsx        device-flow state machine
  hooks/usePlayCollection.ts
  lib/auth.ts              Tauri IPC boundary + browser fallback
  lib/cover.ts             deterministic artwork from a hash
  components/              Sidebar, TopBar, HomeView, CollectionView,
                           TrackTable, PlayerBar, QueuePanel, SignInScreen
src-tauri/src/
  auth.rs                  device flow, token vault, SAPISIDHASH signing
tools/screenshots.mjs      Playwright harness that produced the images above
```

## Design notes

Declared before the first component was written, and worth stating because the brief was "inspired by
Spotify":

> High-density desktop product UI for people who already live in Spotify. Dark shell, one warm
> YouTube-red accent (`#ff3d5a`), generated rather than photographic surfaces.
> Dials: **variance 4 / motion 4 / density 7**.

Deliberately excluded: purple hero gradients, glassmorphism on every surface, pill-shaped everything,
cream backgrounds, italic accent words. The accent appears only where it earns attention — brand mark,
active navigation, play affordances, the current track, liked hearts.

Artwork is a deterministic mesh gradient derived from the release id, overlaid with a faint grid so the
flat gradients read as printed sleeves. Same input, same sleeve, on every launch, with no binary assets
and no network dependency.

## Verification

```bash
npm run build        # tsc --strict + vite build
cd src-tauri && cargo test --lib
npm run preview & npm run screenshots   # writes docs/screenshots, fails on any console error
```

`tools/screenshots.mjs` produces `01`–`08` against the production build and exits non-zero on any
console error. `09-native-window.png` is a one-off capture of the running binary (`cargo build`, then
`PrintWindow` against the window), which is why it shows real window chrome.

## Accessibility

Semantic roles on the track table, `aria-label` on every icon-only control, one visible focus ring for
the whole app, `aria-live` announcements on track change, `prefers-reduced-motion` honoured, and
keyboard reachability for both actions on each card. Contrast targets WCAG AA on body text and
controls.

## License

MIT — see [LICENSE](LICENSE).
