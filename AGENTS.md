# AGENTS.md

Cliente desktop de YouTube Music: Tauri 2 (Rust) + React 19 + TypeScript 6 (strict) + Tailwind 4 + Vite.
Idioma: README e docs em pt-BR; código, identificadores e commits em inglês.

## Comandos

```bash
npm ci                 # instalar (lockfile: package-lock.json, npm)
npm run dev            # preview no navegador, catálogo simulado
npm run tauri dev      # app desktop real
npm run build          # tsc --strict + vite build (gera dist/, exigido pelo Rust)
npm test               # Vitest: playerReducer e catalog
npm run e2e            # Playwright; exige `npm run preview` em :4173 e `npx playwright install chromium`
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D clippy::all
cargo test --manifest-path src-tauri/Cargo.toml --lib   # offline; YTM_LIVE=1 liga testes contra serviços reais
```

## Gates de CI

- `ci.yml` (`verify`, windows-latest): build, Vitest, e2e com backend simulado, rustfmt, clippy `-D clippy::all`, cargo test.
- `security.yml`: scan via `juninmd/base-actions` (reusable).
- Rode `npm run build` antes de qualquer passo Rust: `tauri::generate_context!()` lê `dist/` na compilação.

## Fronteiras

- IPC: `src/lib/music.ts` e `src/lib/auth.ts` chamam os comandos de `src-tauri/src/lib.rs` e têm fallback simulado no navegador.
- Estado do player: só em `src/hooks/playerReducer.ts` (puro, testado).
- Tokens e cookies: escritos só pelo Rust, só no cofre do SO (`keyring`). Nunca no webview nem no `localStorage`.

## Não fazer

- Não commitar `YTM_GOOGLE_CLIENT_ID`, `YTM_GOOGLE_CLIENT_SECRET`, cookies ou tokens; nunca logar esses valores.
- Não editar `package-lock.json` nem `src-tauri/Cargo.lock` à mão.
- Não afrouxar a CSP de `src-tauri/tauri.conf.json` nem o escopo do `assetProtocol`.
- Não rodar testes `YTM_LIVE=1` no CI; são opt-in.
- Não fingir dado real: o modo simulado precisa continuar rotulado como tal na UI.

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