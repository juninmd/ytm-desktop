# Migração dos primitivos locais para o `@juninmd/sonido@2.5.0`

O YTM Desktop tinha os seus próprios botões, slider, modal, badges e estados de carregamento/vazio.
Nesta troca eles passam a ser adaptadores finos sobre os componentes que o
[`@juninmd/sonido`](https://github.com/juninmd/sonido) publica: a API que o app já usava (`label`,
`hint`, `active`, `filled`, `valueText`) continua igual, e o comportamento/ARIA (foco preso no
diálogo, `aria-valuetext`, `role="status"`, foco itinerante na navegação) vem do pacote.

## O que trocou

| Primitivo        | Antes (local)                                          | Depois (`@juninmd/sonido@2.5.0`)                          | Arquivos principais                                |
| ---------------- | ------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------- |
| Button/IconButton | `<button>` com classes Tailwind e hover próprio       | `Button` (`variant="ghost"`, `size="icon"`)               | `ui/IconButton.tsx`, `PlayerBar.tsx`, `TopBar.tsx` |
| Modal → Dialog   | `div role="dialog"` + foco/Esc/Tab feitos à mão        | `Dialog` sobre `<dialog>` nativo (foco preso, Esc, backdrop) | `ui/Modal.tsx`                                     |
| Slider           | `<input type="range">` + trilho em gradiente inline    | `Slider` (trilho, thumb e `aria-valuetext` do pacote)     | `ui/Slider.tsx`                                    |
| Spinner          | `Loader2` + `animate-spin` em 7 pontos                 | `Spinner` (`role="status"` quando rotulado)               | `SearchView`, `CollectionView`, `ArtistView`, `LyricsPanel`, `TrackTable` |
| Skeleton         | texto "Carregando o catálogo."                         | `Skeleton` (bloco de mídia + linhas, shimmer)             | `HomeView.tsx`                                     |
| EmptyState       | blocos ad-hoc de ícone + título + botão                | `EmptyState` (ícone, título, descrição, ação)             | `SearchView`, `DownloadsView`, `LibraryView`, `LyricsPanel` |
| Badge            | `<span>` em formato de pílula, borda à mão             | `Badge` (`tone`, `dot`)                                   | `PlayerBar.tsx`, `TopBar.tsx`, `Sidebar.tsx`       |
| Artwork          | `<img>` cru (ou gradiente gerado)                      | `Artwork` (fade-in, fallback de erro, iniciais)            | `Cover.tsx`                                        |
| Dock/Sidebar     | `<ul>` de botões com `aria-current` manual             | `NavRail` (`aria-current`, grupos, marca, badge)          | `Sidebar.tsx`                                      |
| Kbd              | `<kbd>` com classes Tailwind                           | `Kbd`                                                     | `ShortcutsDialog.tsx`                              |
| SearchField      | `<input type="search">` + ícone + botão de limpar      | `SearchField` (Esc limpa, botão de limpar, dica de atalho) | `TopBar.tsx`                                       |

Onze primitivos distintos, contando `Button`/`IconButton` como um.

## Tema

O Sonido lê tokens `--sn-*`. Em vez de aceitar a paleta coral/violeta do pacote, o `index.css` mapeia
cada token para o tema do app:

- superfícies → `--color-canvas` / `--color-panel` / `--color-raised` / `--color-hover`;
- texto → `--color-fg` / `--color-muted` / `--color-subtle`;
- accent → `--color-accent` (`#ff3d5a`), com `--sn-sig-*` e `--sn-gradient-signature` no mesmo tom,
  então o gradiente de ação continua vermelho-quente, não coral;
- tipografia, raio e anel de foco seguem os tokens do app.

`data-theme="dark"` fica no `<html>` (o app tem um tema só) e o `styles.css` do pacote é importado
uma vez em `src/main.tsx`, **antes** de `index.css`, para que o bridge tenha a última palavra.

Um detalhe que pareceu bug e não é: o CSS do Sonido é não-camadado, então utilitários Tailwind
(`@layer utilities`) não conseguem sobrescrevê-lo. Por isso os ajustes de densidade
(`.app-icon`, `.app-slider`, `.app-search`, `.app-navrail`, `.app-dialog`) são regras com seletor
próprio no `index.css`, e não classes utilitárias no `className`.

## O que ficou local

- **Menu de contexto**: os menus de faixa/fila abrem no ponteiro e no elemento, com título de seção
  e itens `aria-checked`. O `Menu` do Sonido é um menu-button preso ao gatilho, sem essas formas;
  trocar seria perder o clique-direito e os `menuitemradio`.
- **OAuth/pareamento** (`SignInScreen`, `LibraryCookieForm`): fluxo do app, não é primitivo.
- **MiniPlayer, LyricsCinema, aviso do player**: composições específicas do domínio (janela nativa,
  letra sincronizada, `aria-live` do store).
- **Eq e Logo**: identidade do app (equalizador de "tocando agora" e marca).

## Componentes genéricos que faltaram no pacote

- `Equalizer` e `PlayerCard` **não existem** no `@juninmd/sonido@2.5.0` (não são exportados pelo
  `index`), então o equalizador e o cartão do player continuam locais.
- `Menu`: sem API de menu ancorado/context menu, sem `heading` nem item marcado.
- `Dialog`: o botão de fechar tem `aria-label="Fechar"` fixo e não aceita `closeKeys` (o app precisa
  fechar a folha de atalhos com `?`).
- `Slider`: não tem variante "sem rótulo/valor" nem `aria-label`; o player já desenha os tempos, então
  o bridge esconde a linha `meta` e mantém o trilho.
- `SearchField`: não permite escolher o `id` do input (o `<label>` usa um id interno); o app precisa
  de `id="global-search"` para o atalho `/`.
- `Tabs`: existe, mas os filtros de busca/biblioteca são `aria-pressed` e o e2e os consulta por
  `role=button`; virar `role=tab` mudaria o contrato sem ganho.

## Screenshots

`antes.png` e `depois.png` foram gerados de duas árvores de trabalho, sem pasta `legacy/`:

1. `origin/main` num worktree descartável em
   `C:/Users/jr_ac/AppData/Local/Temp/opencode/before-ytm-desktop`, com um harness efêmero que usa
   os primitivos daquele checkout (e o `index.css` real) na porta 5333 → **antes**;
2. a árvore desta branch, com o mesmo harness usando os componentes do Sonido, na porta 5323 →
   **depois**.

O harness dos dois lados monta a mesma folha: player bar (transporte, seek e volume), navegação
lateral, busca, carregando/vazio e a folha de atalhos. Só dados fictícios ("Rodovia de Vidro",
"Fita K7 Azul", "Sessão de Estudo"). Nenhum `preview.*` ou harness foi commitado.

```bash
node C:/Users/jr_ac/AppData/Local/Temp/opencode/shot/full.cjs \
  "http://localhost:5333/harness.html" \
  "D:/Solutions/pessoal/wt-sonido/ytm-desktop/docs/sonido-migration/antes.png"

node C:/Users/jr_ac/AppData/Local/Temp/opencode/shot/full.cjs \
  "http://localhost:5323/harness.html" \
  "D:/Solutions/pessoal/wt-sonido/ytm-desktop/docs/sonido-migration/depois.png"
```

Chromium 1180×900, `deviceScaleFactor: 2`, `fullPage`.

## Comandos e resultados

Todos em Windows (`win32`, Node 24), na raiz do repo.

| Comando | Resultado |
| ------- | --------- |
| `npm ci --dry-run` | `up to date` — `package-lock.json` em sincronia com `package.json` |
| `node node_modules/typescript/bin/tsc --noEmit` | sem erros (strict, `noUnusedLocals`) |
| `npm run build` (`tsc` + `vite build`) | ok — 2141 módulos; `dist/assets/index-*.css` 190,1 kB (34,7 kB gzip), `index-*.js` 390,9 kB (117,7 kB gzip) |
| `npm test` (Vitest) | 13 arquivos, 100 testes, todos passando |
| `npm run e2e` (`vite preview` + `tools/e2e.mjs`) | todos os checks ok, nenhum erro de console |

Nenhuma falha específica de Windows apareceu: build, Vitest e o e2e passam nesta máquina. Como não
há falha a explicar, não há nada de `origin/main` a reproduzir; o único ajuste de teste foi de
seletor, descrito abaixo.

### Ajuste no e2e

O trilho de seek agora é nomeado pelo `<label>` do `Slider` do Sonido (o `aria-label` próprio saiu).
O check de "clicar na linha da letra busca o tempo" procurava
`input[aria-label="Posição da faixa"]`; passou a procurar o único `input[type="range"]` dentro de
`[data-cinema]`. A asserção continua a mesma: o valor do trilho tem de chegar a 59 s. O nome
acessível foi conferido no navegador (`getByRole("slider", { name: "Posição da faixa" })` resolve 1).

