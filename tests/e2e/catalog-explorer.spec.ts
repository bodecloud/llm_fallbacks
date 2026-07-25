import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
} from "./helpers";

const MOCK_CATALOG = [
  {
    id: "google/gemini-2.0-flash",
    provider: "google",
    quality_score: 88.5,
    context_length: 1_050_000,
    supports_vision: true,
    supports_function_calling: true,
  },
];

async function installCatalogMock(page: import("@playwright/test").Page) {
  await page.route("**/free_models.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CATALOG),
    });
  });
}

async function installProxyMock(page: import("@playwright/test").Page) {
  await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body:
        'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
        "data: [DONE]\n\n",
    });
  });
}

test.describe("Wave 3 — catalog explorer", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installCatalogMock(page);
    await installProxyMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("explorer shows context and capability badges", async ({ page }) => {
    await page.locator("#explorerSetting").click();
    await expect(page.locator("#explorer-table")).toBeVisible({ timeout: 15_000 });

    const row = page.locator("#explorer-table tbody tr").first();
    await expect(row).toContainText("google/gemini-2.0-flash");
    await expect(row.locator("td").nth(3)).toHaveText("1.1M");
    await expect(row.locator(".lf-cap-vision")).toBeVisible();
    await expect(row.locator(".lf-cap-tools")).toBeVisible();
  });
});
