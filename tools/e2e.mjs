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
