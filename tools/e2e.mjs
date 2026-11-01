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
            return { collections: [], tracks: [track], sections: [] };
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
