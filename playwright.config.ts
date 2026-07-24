import { defineConfig, devices } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:8765";
const baseURL = process.env.PAGES_BASE_URL || localBaseURL;
const useLocalServer = !process.env.PAGES_BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  webServer: useLocalServer
    ? {
        command: "python3 -m http.server 8765 --directory docs",
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
  use: {
    baseURL,
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
