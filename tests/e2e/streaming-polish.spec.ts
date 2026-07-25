import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  mockProxySse,
  waitForAssistantText,
} from "./helpers";

test.describe("Wave 4 — streaming polish", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("streams long reply with plain-text tail then final markdown", async ({ page }) => {
    const longReply =
      "Here is code:\n\n```js\nconst x = 1;\n```\n\nDone streaming.";
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockProxySse(longReply),
      });
    });

    await page.locator("#chatinput").fill("stream test");
    await page.locator("#sendbutton").click();

    const assistant = page.locator(".mur-message-assistant").last();
    await waitForAssistantText(page, 30_000);
    await expect(assistant).not.toHaveClass(/mur-generating/);
    await expect(assistant.getByText("Done streaming.")).toBeVisible();
    await expect(assistant.locator("pre code, .mur-content-block code")).toBeVisible({
      timeout: 10_000,
    });
  });
});
