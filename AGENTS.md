# AGENTS.md

Desktop client for YouTube Music (prototype): Tauri 2 (Rust backend) with a React 19 + TypeScript (strict) UI.
Docs and README are in pt-BR; code, identifiers and commits are in English.

## Stack

- Tauri 2 (Rust, `src-tauri/`), React 19, TypeScript 6 (strict), Tailwind 4, Vite.
- Vitest for unit tests, Playwright for e2e, rustfmt and clippy for Rust.

## Commands

```bash
npm ci                                                  # install (npm, package-lock.json)
npm run dev                                             # browser preview with simulated catalog
npm run tauri dev                                       # real desktop app
npm run build                                           # tsc --strict + vite build (writes dist/)
npm test                                                # Vitest
npm run e2e                                             # Playwright; needs `npm run preview` on :4173 and `npx playwright install chromium`
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D clippy::all
cargo test --manifest-path src-tauri/Cargo.toml --lib   # offline; YTM_LIVE=1 enables tests against live services
```

## Structure

- `src/components/`: React views and UI pieces (player bar, queue, lyrics, sign-in).
- `src/hooks/`: state and behavior hooks; `playerReducer.ts` is the only home of player state (pure, tested).
- `src/lib/`: frontend boundaries: `music.ts` and `auth.ts` are the IPC layer, with a browser fallback.
- `src-tauri/src/`: Rust commands and services (`lib.rs` IPC, `auth.rs`, `innertube.rs`, `stream.rs`, `downloads.rs`, `lyrics.rs`, `browser_cookies.rs`).
- `src-tauri/tauri.conf.json` and `src-tauri/capabilities/`: CSP, asset protocol scope, permissions.
- `tools/`: `e2e.mjs` (desktop-path harness) and `screenshots.mjs`.

## Conventions

- Commits: English, conventional prefix. Before a PR, run `npm run build`, `npm test` and the cargo commands above.
- CI (`ci.yml`, `windows-latest`, Node 24, stable Rust) runs build, Vitest, e2e with the stubbed backend, rustfmt, clippy `-D clippy::all` and cargo test. It runs on pushes to `main` and on every pull request.
- `security.yml`, `sast.yml` and `central-validate.yml` call reusable workflows from `juninmd/base-actions`.
- Simulated (mock) mode must stay labeled as simulated in the UI. Do not present fake data as real.
- Tokens and cookies are written only by Rust, only to the OS keyring. Never in the webview or `localStorage`.
- Do not commit `YTM_GOOGLE_CLIENT_ID`, `YTM_GOOGLE_CLIENT_SECRET`, cookies or tokens. Never log those values.
- Do not edit `package-lock.json` or `src-tauri/Cargo.lock` by hand.
- Do not loosen the CSP in `src-tauri/tauri.conf.json` or the `assetProtocol` scope.
- `YTM_LIVE=1` tests are opt-in. Never run them in CI.

## Gotchas

- Run `npm run build` before any cargo step. `tauri::generate_context!()` reads `dist/` at compile time.
- `npm run e2e` fails unless `npm run preview` is serving on port 4173.
- Real catalog and audio work only in the desktop app. The browser preview always uses the mock catalog.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.
