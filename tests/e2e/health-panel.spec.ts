import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
} from "./helpers";

test.describe("Wave 2 — health panel", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/health`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "ok" }),
      });
    });
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      });
    });
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
  });

  test("Server panel shows endpoint health after check", async ({ page }) => {
    await page.locator("#sysSetting").click();
    await expect(page.locator(".shell-panel.open")).toBeVisible({ timeout: 10_000 });
    await page.locator("#checkEndpointsBtn").click();
    await expect(page.locator(".lf-health-dot.lf-health-ok")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(".lf-health-meta")).toContainText(/Reachable/i);
  });
});
