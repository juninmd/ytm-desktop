// End-to-end harness for the desktop paths the screenshot run never reaches.
//
//   npm run build && npm run preview     # serves dist/ on :4173
//   npm run e2e
//
// The browser preview normally falls back to the mock catalogue. Here we inject
// a fake `__TAURI_INTERNALS__.invoke` *before* the app loads, so `isDesktop()`
// is true and every IPC call is answered by a stub that mimics the Rust
// backend. That exercises the real IPC boundary and the real-mode UI — the
// yt-dlp banner, the connected library, account likes — without Rust or an
// account. It is not a substitute for the Rust tests; it is the frontend half.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.E2E_BASE ?? "http://localhost:4173";
const out = process.env.E2E_OUT ?? "docs/screenshots";

const TRACK = {
  id: "v1",
  title: "Faixa do Backend",
  artist: "Artista Real",
  album: "Álbum Real",
  albumId: "al1",
  duration: 214,
  year: 2024,
  plays: "1,2 mi",
};

const HOME = {
  quickPicks: ["pl1"],
  shelves: [{ title: "Ouvir de novo", ids: ["pl1", "pl2", "UCartist"] }],
  collections: [
    { id: "pl1", kind: "playlist", format: "playlist", title: "Playlist do Backend", subtitle: "Playlist", trackIds: [TRACK.id] },
    { id: "pl2", kind: "playlist", format: "playlist", title: "Álbum do Backend", subtitle: "Artista Real", trackIds: [] },
    { id: "UCartist", kind: "artist", format: "artist", title: "Artista do Backend", subtitle: "Artista", trackIds: [] },
  ],
};

const failures = [];
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (error) => consoleErrors.push(String(error)));

// The fake Tauri backend. Only the commands the app actually calls are wired.
await page.addInitScript(
  ({ track, home }) => {
    const calls = [];
    const downloads = [];
    window.__invokeCalls = calls;
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      transformCallback: () => 0,
      unregisterCallback: () => {},
      convertFileSrc: (path) => path,
      invoke: async (cmd, args) => {
        calls.push({ cmd, args });
        switch (cmd) {
          case "auth_restore_session":
            return null;
          case "auth_begin_device_flow":
            return {
              userCode: "WDJB-MJHT",
              deviceCode: "stub-device-code",
              verificationUrl: "https://www.google.com/device",
              expiresIn: 1800,
              interval: 5,
            };
          case "auth_poll_device_flow":
            return { status: "pending" };
          case "music_home":
            return home;
          case "music_library":
            return {
              available: true,
              collections: [
                { id: "pl2", kind: "playlist", format: "playlist", title: "Playlist da Conta", subtitle: "Playlist", trackIds: [] },
              ],
              tracks: [],
            };
          case "music_search":
            return {
              collections: [],
              tracks: [track, { ...track, id: "v2", title: "Segunda Faixa", albumId: "al2" }],
              sections: [],
            };
          case "music_more":
            return { collections: [], tracks: [], sections: [] };
          case "music_radio":
            return [track];
          case "music_browse":
            if (args?.id?.startsWith("UC")) {
              return {
                collections: [
                  {
                    id: args.id,
                    kind: "artist",
                    format: "artist",
                    title: "Artista do Backend",
                    subtitle: "Artista",
                    trackIds: [track.id],
                  },
                ],
                tracks: [track],
                sections: [],
              };
            }
            return { collections: [], tracks: [track], sections: [] };
          case "music_resolver_status":
            return { available: false, binary: null, detail: "stub: yt-dlp ausente" };
          case "music_rate":
            return true;
          case "music_lyrics":
            return {
              synced: true,
              source: "stub",
              lines: [
                { time: 0, text: "Primeira linha" },
                { time: 30, text: "Segunda linha" },
                { time: 60, text: "Terceira linha" },
              ],
            };
          case "music_download": {
            const entry = {
              id: args?.track?.id ?? "v1",
              title: args?.track?.title ?? "Faixa do Backend",
              artist: args?.track?.artist ?? "Artista Real",
              album: args?.track?.album ?? "Álbum Real",
              duration: args?.track?.duration ?? 214,
              file: "C:/stub/v1.m4a",
              bytes: 2659947,
              downloadedAt: 1700000000,
            };
            downloads.push(entry);
            return entry;
          }
          case "music_downloads":
            return downloads;
          case "music_delete_download":
            return null;
          case "plugin:window|is_maximized":
            return false;
          case "plugin:window|scale_factor":
            return 1;
          case "plugin:window|inner_size":
            return { width: 1320, height: 860 };
          case "plugin:window|available_monitors":
            return [
              {
                name: "stub",
                position: { x: 0, y: 0 },
                size: { width: 1920, height: 1080 },
                scaleFactor: 1,
                workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } },
              },
            ];
          case "plugin:window|outer_position":
            return { x: 120, y: 80 };
          case "cookie_browsers":
            return ["firefox", "chrome"];
          case "auth_save_cookies":
          case "auth_clear_cookies":
            return null;
          default:
            return null;
        }
      },
    };
  },
  { track: TRACK, home: HOME },
);

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`shot: ${name}`);
};

const invoked = (cmd) =>
  page.evaluate((name) => window.__invokeCalls.some((call) => call.cmd === name), cmd);

await page.goto(base, { waitUntil: "networkidle" });

// 1. Signed out, then the real device-code screen driven by the Rust flow.
await page.waitForSelector("text=Entrar no YTM Desktop");
await page.getByRole("button", { name: "Continuar com o Google" }).click();
await page.waitForSelector("text=Confirme no navegador");
await page.waitForTimeout(400);
await shot("10-desktop-device-code");
await page.getByRole("button", { name: "Cancelar" }).click();

// 2. Enter the workspace through the demo path; the catalogue is the real one.
await page.getByRole("button", { name: "Explorar em modo demonstração" }).click();
await page.waitForSelector("text=Playlist do Backend");
check("home renders the backend catalogue", await invoked("music_home"));
check(
  "yt-dlp banner explains the simulated transport",
  (await page.locator("text=Áudio real indisponível").count()) > 0,
);
check("resolver status was probed", await invoked("music_resolver_status"));
await shot("11-desktop-home");

// 3. The connected library renders its collections.
await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
await page.waitForSelector("text=Playlist da Conta");
check("library renders the account collections", await invoked("music_library"));
await shot("12-desktop-library");

// 4. Search hits the backend and shows the returned track.
await page.getByRole("searchbox", { name: "Buscar no catálogo" }).fill("faixa");
await page.waitForSelector("text=Faixa do Backend");
check("search renders backend tracks", await invoked("music_search"));

// 4b. The result tabs narrow the request the way the web player does.
await page.getByRole("button", { name: "Músicas", exact: true }).click();
await page.waitForFunction(
  () =>
    window.__invokeCalls.some(
      (call) => call.cmd === "music_search" && call.args?.filter === "songs",
    ),
  null,
  { timeout: 3000 },
);
check("search filter is sent to the backend", true);

// 4c. An artist card opens the artist page.
await page.getByRole("button", { name: "Início", exact: true }).click();
await page.waitForSelector("text=Artista do Backend");
await page.getByRole("button", { name: "Abrir Artista do Backend" }).first().click();
await page.waitForFunction(
  () => document.querySelector("h1")?.textContent?.includes("Artista do Backend"),
  null,
  { timeout: 5000 },
);
check("artist page loads from the backend", await invoked("music_browse"));
await shot("14-desktop-artist");

// 5. Play a result, then like it: the like must reach the account.
await page.getByRole("searchbox", { name: "Buscar no catálogo" }).fill("faixa");
await page.waitForSelector("text=Faixa do Backend");
await page.getByRole("button", { name: "Tocar Faixa do Backend" }).first().click();
await page.getByRole("button", { name: "Curtir", exact: true }).click();
await page.waitForFunction(
  () => window.__invokeCalls.some((call) => call.cmd === "music_rate" && call.args?.rating === "like"),
  null,
  { timeout: 3000 },
);
check("liking a track writes to the account", await invoked("music_rate"));
check("simulated engine is labelled", (await page.locator("text=simulado").count()) > 0);
await shot("13-desktop-search-like");

// 6. Karaoke lyrics: the panel highlights the current line and can seek.
await page.getByRole("button", { name: "Mostrar letra" }).click();
await page.waitForSelector("text=Sincronizada");
check("lyrics panel loads synced lyrics", await invoked("music_lyrics"));
check(
  "karaoke mode reports the source",
  (await page.locator("text=Sincronizada").count()) > 0,
);
await shot("15-desktop-lyrics");

// 7. The queue and the lyrics share one slot: opening one closes the other,
// whichever button is used (the top bar's too).
await page.getByRole("button", { name: "Mostrar fila" }).first().click();
await page.waitForSelector("text=Fila de reprodução");
check(
  "opening the queue closes the lyrics",
  (await page.locator("h2", { hasText: "Letra" }).count()) === 0,
);

// 7b. Queue control: the row's context menu queues a track, the panel edits it.
const row = page.getByRole("row").filter({ hasText: "Faixa do Backend" }).first();
// Playing from a result list queues the whole list; start from a clean queue.
await page.getByRole("button", { name: "Limpar fila" }).click();
await page.waitForSelector("text=Nada na sequência");
await row.click({ button: "right" });
await page.getByRole("menuitem", { name: "Tocar a seguir" }).waitFor();
await shot("17-desktop-context-menu");
await page.getByRole("menuitem", { name: "Tocar a seguir" }).click();
await page.waitForSelector("text=toca a seguir");
check("play next confirms with a notice", true);
await page.waitForSelector("text=A seguir · 1");
check("the queue lists the queued track", true);

await page.getByRole("button", { name: "Mais opções para Faixa do Backend" }).last().click();
await page.getByRole("menuitem", { name: "Remover da fila" }).click();
await page.waitForSelector("text=Nada na sequência");
check("removing a queued track empties the up-next list", true);

await row.click({ button: "right" });
await page.getByRole("menuitem", { name: "Adicionar à fila" }).click();
await page.waitForSelector("text=A seguir · 1");
await page.getByRole("button", { name: "Limpar fila" }).click();
await page.waitForSelector("text=Nada na sequência");
check("clearing the queue keeps only what is playing", true);

// 7b2. Drag a queued track to reorder, and jump to a track's album from its menu.
await page.getByRole("row").filter({ hasText: "Segunda Faixa" }).first().click({ button: "right" });
await page.getByRole("menuitem", { name: "Adicionar à fila" }).click();
await row.click({ button: "right" });
await page.getByRole("menuitem", { name: "Adicionar à fila" }).click();
await page.waitForSelector("text=A seguir · 2");
const queued = () =>
  page.evaluate(() => [...document.querySelectorAll("[data-reorder-row]")].map((node) => node.textContent));
check("queued tracks keep the order they were added in", (await queued())[0].includes("Segunda Faixa"));
const queueRows = page.locator("[data-reorder-row]");
await queueRows.first().hover();
const grip = await page.getByRole("button", { name: /Arrastar para reordenar/ }).first().boundingBox();
const target = await queueRows.nth(1).boundingBox();
await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
await page.mouse.down();
await page.mouse.move(grip.x + 4, target.y + target.height - 4, { steps: 8 });
await page.mouse.up();
check("dragging a queued track reorders the queue", (await queued())[0].includes("Faixa do Backend"));
await page.getByRole("button", { name: "Limpar fila" }).click();

await row.click({ button: "right" });
await page.getByRole("menuitem", { name: "Ir para o álbum" }).click();
await page.waitForFunction(
  () => window.__invokeCalls.some((call) => call.cmd === "music_browse" && call.args?.id === "al1"),
  null,
  { timeout: 3000 },
);
check("Go to album opens the track's album", true);
await page.getByRole("searchbox", { name: "Buscar no catálogo" }).fill("faixa");
await page.waitForSelector("text=Segunda Faixa");

// 7c. Playback speed and the sleep timer live next to the volume.
await page.getByRole("button", { name: /Velocidade de reprodução/ }).click();
await page.getByRole("menuitemradio", { name: "1.5×" }).click();
check(
  "the chosen speed is shown and persisted",
  (await page.getByRole("button", { name: "Velocidade de reprodução: 1.5×" }).count()) === 1 &&
    (await page.evaluate(() => JSON.parse(localStorage.getItem("ytm-desktop:preferences")).rate)) === 1.5,
);
await page.keyboard.press("]");
check(
  "the ] key steps the speed up",
  (await page.getByRole("button", { name: "Velocidade de reprodução: 2×" }).count()) === 1,
);
for (let i = 0; i < 3; i += 1) await page.keyboard.press("[");
check(
  "the [ key steps the speed back down to normal",
  (await page.getByRole("button", { name: "Velocidade de reprodução: 1×" }).count()) === 1,
);

// A second click on the button that owns an open menu closes it (no flicker-reopen).
await page.getByRole("button", { name: "Timer de sono" }).click();
await page.getByRole("menu").waitFor();
await page.getByRole("button", { name: "Timer de sono" }).click();
await page.waitForTimeout(400);
check("clicking the trigger again closes its menu", (await page.getByRole("menu").count()) === 0);
await page.getByRole("button", { name: "Timer de sono" }).click();
await page.getByRole("menuitemradio", { name: "15 minutos" }).click();
await page.waitForFunction(
  () => /^\d+:\d\d$/.test(document.querySelector('button[aria-label="Timer de sono"] span')?.textContent ?? ""),
  null,
  { timeout: 3000 },
);
check("a timed sleep shows its countdown", true);
await shot("18-desktop-sleep-timer");
await page.getByRole("button", { name: "Timer de sono" }).click();
await page.getByRole("menuitem", { name: "Desligar o timer" }).click();
check(
  "turning the timer off clears it",
  (await page.locator('button[aria-label="Timer de sono"][aria-pressed="true"]').count()) === 0,
);

await page.getByRole("button", { name: "Timer de sono" }).click();
await page.getByRole("menuitemradio", { name: "Ao fim desta faixa" }).click();
check(
  "end-of-track arms the timer",
  (await page.locator('button[aria-label="Timer de sono"][aria-pressed="true"]').count()) === 1,
);
await page.getByRole("button", { name: "Timer de sono" }).click();
await page.getByRole("menuitem", { name: "Desligar o timer" }).click();

// 7d. The shortcut sheet opens from the keyboard and closes with Escape.
await page.keyboard.press("?");
await page.getByRole("dialog", { name: "Atalhos de teclado" }).waitFor();
await shot("19-desktop-shortcuts");
// Focus lands on the body after a click on plain text; Escape must still close it.
await page.getByRole("heading", { name: "Atalhos de teclado" }).click();
await page.keyboard.press("Escape");
check(
  "Escape closes the shortcut sheet",
  (await page.getByRole("dialog").count()) === 0,
);
await page.keyboard.press("m");
check(
  "global keys keep working after clicking a control",
  (await page.getByRole("button", { name: "Ativar som" }).count()) === 1,
);
await page.keyboard.press("m");

// 7d2. Track details, the transition menu and visible shortcut hints.
await row.click({ button: "right" });
await page.getByRole("menuitem", { name: "Detalhes da faixa" }).click();
await page.getByRole("dialog", { name: "Detalhes da faixa" }).waitFor();
check(
  "track details lists what the catalogue knows",
  (await page.getByRole("dialog").locator("text=Artista Real").count()) > 0 &&
    (await page.getByRole("dialog").locator("text=Não baixada").count()) > 0,
);
await page.keyboard.press("Escape");
check("Escape closes the details", (await page.getByRole("dialog").count()) === 0);

await page.getByRole("button", { name: /Transição entre faixas/ }).click();
await page.getByRole("menuitemradio", { name: "Sobrepor 6 segundos" }).click();
check(
  "the transition length is shown and persisted",
  (await page.getByRole("button", { name: "Transição entre faixas: 6 s" }).count()) === 1 &&
    (await page.evaluate(() => JSON.parse(localStorage.getItem("ytm-desktop:preferences")).crossfade)) === 6,
);
await page.getByRole("button", { name: /Transição entre faixas/ }).click();
await page.getByRole("menuitemradio", { name: "Sem sobreposição (sem pausas)" }).click();

check(
  "controls advertise their keyboard shortcut",
  (await page.locator('button[title="Embaralhar (S)"]').count()) === 1 &&
    (await page.locator('button[title="Modo mini (Ctrl Shift M)"]').count()) === 1,
);

// A queued track for the mini strip's list to show.
await page.getByRole("row").filter({ hasText: "Segunda Faixa" }).first().click({ button: "right" });
await page.getByRole("menuitem", { name: "Adicionar à fila" }).click();

// 7e. Mini mode: the workspace gives way to a compact strip and the window shrinks.
const windowCall = (name) =>
  page.evaluate((cmd) => window.__invokeCalls.filter((call) => call.cmd === cmd), `plugin:window|${name}`);
await page.keyboard.press("Control+Shift+M");
await page.waitForSelector("[data-mini]");
const shrink = (await windowCall("set_size")).at(-1);
check(
  "mini mode shrinks the native window",
  JSON.stringify(shrink?.args).includes("420") && JSON.stringify(shrink?.args).includes("150"),
);
check(
  "mini mode pins the window above the others",
  JSON.stringify((await windowCall("set_always_on_top")).at(-1)?.args).includes("true"),
);
await page.setViewportSize({ width: 420, height: 150 });
await page.waitForTimeout(200);
check(
  "the strip fits its window without scrolling",
  await page.evaluate(
    () => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
  ),
);
await shot("20-desktop-mini-mode");
await page.setViewportSize({ width: 420, height: 420 });
await page.getByRole("button", { name: "Mostrar fila" }).click();
await page.waitForSelector("[data-mini-queue]");
check(
  "the strip's list opens and grows the window",
  JSON.stringify((await windowCall("set_size")).at(-1)?.args).includes("420") &&
    (await page.locator("[data-mini-queue]").locator("text=Segunda Faixa").count()) > 0,
);
await shot("21-desktop-mini-queue");
await page.getByRole("button", { name: "Ocultar fila" }).click();
await page.waitForFunction(() => document.querySelector("[data-mini-queue]") === null);
await page.waitForFunction(
  () =>
    JSON.stringify(
      window.__invokeCalls.filter((call) => call.cmd === "plugin:window|set_size").at(-1)?.args,
    ).includes("150"),
  null,
  { timeout: 3000 },
);
check("closing the list shrinks the window back", true);
await page.setViewportSize({ width: 420, height: 150 });
await page.getByRole("button", { name: "Ocultar os controles até passar o mouse" }).click();
check(
  "controls can be set to hide until hover, and the choice persists",
  (await page.locator("[data-controls]").getAttribute("class")).includes("opacity-0") &&
    (await page.evaluate(() => localStorage.getItem("ytm-desktop:mini-autohide"))) === "1",
);
await page.getByRole("button", { name: "Mostrar os controles sempre" }).click();
await page.getByRole("button", { name: "Pausar" }).click();
check("the strip drives the transport", (await page.getByRole("button", { name: "Tocar", exact: true }).count()) === 1);
await page.getByRole("button", { name: "Tocar", exact: true }).click();
await page.getByRole("button", { name: "Voltar ao modo completo" }).click();
await page.setViewportSize({ width: 1440, height: 900 });
await page.waitForSelector("text=Resultados para");
const restore = (await windowCall("set_size")).at(-1);
check(
  "leaving mini mode restores the full window size",
  JSON.stringify(restore?.args).includes("1320") && JSON.stringify(restore?.args).includes("860"),
);
check(
  "leaving mini mode restores the position",
  JSON.stringify((await windowCall("set_position")).at(-1)?.args).includes("120"),
);

// The strip remembers where it was left and returns there on the next use.
await page.keyboard.press("Control+Shift+M");
await page.waitForSelector("[data-mini]");
await page.waitForTimeout(300);
const reopened = JSON.stringify((await windowCall("set_position")).at(-1)?.args);
check("mini mode reopens at its remembered position", reopened.includes("Physical") && reopened.includes("120"));
await page.getByRole("button", { name: "Voltar ao modo completo" }).click();
await page.waitForSelector("text=Resultados para");

// 7f. Lyrics in cinema mode: the stage opens from the panel and Escape leaves it.
await page.getByRole("button", { name: "Mostrar letra" }).click();
await page.getByRole("button", { name: "Modo cinema da letra" }).click();
await page.waitForSelector("[data-cinema] [data-line]");
await shot("22-desktop-lyrics-cinema");
check(
  "cinema shows every lyric line over the stage",
  (await page.locator("[data-cinema] [data-line]").count()) === 3,
);
await page.locator('[data-cinema] [data-line="2"]').click();
await page.waitForFunction(
  () => document.querySelector('[data-cinema] input[aria-label="Posição da faixa"]')?.value >= 59,
  null,
  { timeout: 3000 },
);
check("clicking a line seeks to it", true);
await page.keyboard.press("Escape");
check("Escape leaves cinema mode", (await page.locator("[data-cinema]").count()) === 0);
await page.getByRole("button", { name: "Ocultar letra" }).click();

// 8. Downloading a track reaches the backend, and it shows under "Baixados".
await page.getByRole("button", { name: "Baixar Faixa do Backend" }).first().click();
await page.waitForFunction(
  () => window.__invokeCalls.some((call) => call.cmd === "music_download"),
  null,
  { timeout: 3000 },
);
check("downloading a track reaches the backend", await invoked("music_download"));

await page.getByRole("button", { name: "Baixados", exact: true }).click();
await page.waitForSelector("text=Baixados");
check("downloads view lists the saved track", (await page.locator("text=Faixa do Backend").count()) > 0);
await shot("16-desktop-downloads");

// 9. The session is persisted for the next launch.
const stored = await page.evaluate(() => localStorage.getItem("ytm-desktop:preferences"));
const session = stored ? JSON.parse(stored).session : null;
check(
  "the session (queue + position) is persisted",
  Boolean(session) && session.queue.length > 0,
);

// 10. Switching the language changes the chrome.
await page.selectOption("#locale", "en");
await page.waitForSelector("text=Home");
check("switching to English translates the chrome", (await page.locator("text=Downloads").count()) > 0);
await page.selectOption("#locale", "pt");
await page.waitForSelector("text=Início");

// 11. In a narrow window the search collapses to a button and opens on focus.
await page.setViewportSize({ width: 1000, height: 700 });
const searchWidth = () => page.evaluate(() => document.getElementById("global-search").getBoundingClientRect().width);
await page.waitForTimeout(350);
check("search collapses when the window is narrow", (await searchWidth()) < 80);
await page.keyboard.press("/");
await page.waitForTimeout(350);
check("the / key opens the collapsed search", (await searchWidth()) > 200);
await page.setViewportSize({ width: 1440, height: 900 });

await browser.close();

if (consoleErrors.length > 0) {
  console.error("console errors:");
  for (const error of consoleErrors) console.error(" -", error);
}
if (failures.length > 0 || consoleErrors.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("all e2e checks passed, no console errors");
}
