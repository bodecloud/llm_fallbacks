import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  waitForAssistantText,
} from "./helpers";

async function installProxyMock(page: import("@playwright/test").Page) {
  await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body:
        'data: {"choices":[{"index":0,"delta":{"content":"hash routing ok"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
        "data: [DONE]\n\n",
    });
  });
}

test.describe("Wave 3 — hash routing", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installProxyMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("hash URL survives reload with messages", async ({ page }) => {
    await page.locator("#chatinput").fill("persist this chat");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);

    await expect.poll(() => page.url()).toMatch(/#\/chat\//);

    const url = page.url();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mur-message-user").last()).toContainText("persist this chat", {
      timeout: 30_000,
    });
    await expect(page.locator(".mur-message-assistant").last()).toContainText(/hash routing ok/i, {
      timeout: 30_000,
    });
  });
});
