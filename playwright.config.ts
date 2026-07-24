import { defineConfig, devices } from "@playwright/test";

/** Production GitHub Pages — no local http.server; tests always hit the live site. */
export const PAGES_BASE_URL =
  process.env.PAGES_BASE_URL || "https://bodecloud.github.io/llm_fallbacks/";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  use: {
    baseURL: PAGES_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
