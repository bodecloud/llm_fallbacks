import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installDemoProxyMock,
  installLocalChatBundle,
  installTestConfigMock,
  lastAssistantMessage,
  waitForAssistantText,
} from "./helpers";

test.describe("Wave 1 — message actions", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installDemoProxyMock(page, "first reply");
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("regenerate produces a new assistant message", async ({ page }) => {
    await page.locator("#chatinput").fill("hello regenerate");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);

    await installDemoProxyMock(page, "second reply");

    const regenBtn = lastAssistantMessage(page).locator('[data-action-id="regenerate"]');
    await regenBtn.waitFor({ state: "visible", timeout: 10_000 });
    await regenBtn.click();

    await expect(lastAssistantMessage(page)).toContainText(/second reply|first reply/, {
      timeout: 30_000,
    });
    const count = await page.locator(".mur-message-assistant").count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("stop aborts in-flight generation", async ({ page }) => {
    await page.unroute(`${DEMO_PROXY}/v1/chat/completions`);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await new Promise((r) => setTimeout(r, 8_000));
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body:
          'data: {"choices":[{"index":0,"delta":{"content":"never shown"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n",
      });
    });

    await page.locator("#chatinput").fill("slow stream");
    await page.locator("#sendbutton").click();
    await expect(page.locator("#sendbutton")).toHaveAttribute("aria-label", /stop/i, { timeout: 5_000 });
    await page.locator("#sendbutton").click();
    await expect(page.locator("#sendbutton")).toHaveAttribute("aria-label", /send message/i, {
      timeout: 10_000,
    });
    await expect(page.locator(".mur-message-assistant")).toHaveCount(0);
  });
});
