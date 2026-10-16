// Screenshot harness for the YTM Desktop prototype.
//
//   npm run build && npm run preview        # serves dist/ on :4173
//   npm run screenshots
//
// Optional tooling: needs `playwright` and its Chromium build
// (`npx playwright install chromium`). Nothing in the app depends on it.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.SHOOT_BASE ?? "http://localhost:4173";
const out = process.env.SHOOT_OUT ?? "docs/screenshots";

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

const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`shot: ${name}`);
};

await page.goto(base, { waitUntil: "networkidle" });

// 1. Sign-in screen.
await page.waitForSelector("text=Entrar no YTM Desktop");
await shot("01-signin");

// 2. Device-code step: the surface the real Google flow drives.
await page.getByRole("button", { name: "Continuar com o Google" }).click();
await page.waitForSelector("text=Confirme no navegador");
await page.waitForTimeout(600);
await shot("02-device-code");
await page.getByRole("button", { name: "Cancelar" }).click();

// 3. Demo mode -> home.
await page.getByRole("button", { name: "Explorar em modo demonstração" }).click();
await page.waitForSelector("text=Ouvir de novo");
await page.waitForTimeout(400);
await shot("03-home");

// 4. Playback plus the queue panel.
await page.getByRole("button", { name: /Tocar Midnight Autobahn/ }).first().click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Mostrar fila" }).first().click();
await page.waitForTimeout(700);
await shot("04-playing-queue");

// 5. Album detail.
await page.getByRole("button", { name: "Abrir Sal e Vento" }).first().click();
await page.waitForTimeout(700);
await shot("05-album");

// 6. Library grid.
await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
await page.waitForTimeout(500);
await shot("06-library");

// 7. Search.
await page.getByRole("searchbox", { name: "Buscar no catálogo" }).fill("voltagem");
await page.waitForTimeout(500);
await shot("07-search");

// 8. Narrow window: the layout has to hold at the minimum window size.
await page.setViewportSize({ width: 1024, height: 720 });
await page.waitForTimeout(400);
await shot("08-compact");

await browser.close();

if (consoleErrors.length > 0) {
  console.error("console errors:");
  for (const error of consoleErrors) console.error(" -", error);
  process.exitCode = 1;
} else {
  console.log("no console errors");
}
