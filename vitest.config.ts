import { defineConfig } from "vitest/config";

// Unit tests only: the pure reducer and the catalogue merge. The browser-facing
// wiring is covered by the Playwright harness in tools/e2e.mjs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
