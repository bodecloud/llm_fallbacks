import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  mockProxySse,
} from "./helpers";

test.describe("Wave 4B — compare mode", () => {
  test.beforeEach(async ({ page }) => {
    let call = 0;
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      call += 1;
      const reply = call === 1 ? "reply from column A" : "reply from column B";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockProxySse(reply),
      });
    });
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#lf-compare-toggle")).toBeVisible({ timeout: 45_000 });
  });

  test("toggle shows grid, dual replies, exit keeps history", async ({ page }) => {
    const toggle = page.locator("#lf-compare-toggle");
    await toggle.evaluate((el: HTMLInputElement) => {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator(".lf-compare-grid")).toBeVisible();
    await expect(page.locator("#lf-compare-banner")).toBeVisible();
    await expect(page.locator("#lf-compare-banner")).toContainText(/two requests/i);

    await page.locator("#chatinput").fill("compare please");
    await page.locator("#sendbutton").click({ force: true });

    await expect(page.locator('[data-pane="a"]')).toContainText("column A", { timeout: 30_000 });
    await expect(page.locator('[data-pane="b"]')).toContainText("column B", { timeout: 30_000 });

    // History keeps compare turns after exit (R35).
    await toggle.evaluate((el: HTMLInputElement) => {
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator(".lf-compare-chrome")).toBeHidden();
    await expect(page.locator(".mur-message-user").last()).toContainText("compare please");
    await expect(page.locator(".mur-message-assistant")).toHaveCount(2, { timeout: 15_000 });
  });
});
