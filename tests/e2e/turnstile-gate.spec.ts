import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installDemoProxyMock,
  installLocalChatBundle,
  installTestConfigMock,
  waitForAssistantText,
} from "./helpers";

test.describe("Wave 2 — rate limit UX", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "45",
        },
        body: JSON.stringify({
          error: {
            type: "rate_limit",
            message: "Rate limit exceeded (minute). Try again later.",
            retry_after: 45,
          },
          retry_after: 45,
        }),
      });
    });
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput, .mur-chat-input").first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test("429 shows retry seconds in chat error", async ({ page }) => {
    const input = page.locator("#chatinput, .mur-chat-input").first();
    await input.fill("hello");
    await page.locator("#sendbutton, .mur-send-btn").first().click();
    await expect(page.locator(".mur-message-assistant, .mur-message").last()).toContainText(
      /45 seconds/i,
      { timeout: 30_000 }
    );
    await expect(page.locator("#lfStatusStrip")).toContainText(/Rate limited/i);
  });
});

test.describe("Wave 2 — turnstile disabled", () => {
  test("chat works without turnstileSiteKey", async ({ page }) => {
    await installTestConfigMock(page);
    await installDemoProxyMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput, .mur-chat-input").first()).toBeVisible({
      timeout: 45_000,
    });

    const input = page.locator("#chatinput, .mur-chat-input").first();
    await input.fill("ping");
    await page.locator("#sendbutton, .mur-send-btn").first().click();
    const reply = await waitForAssistantText(page);
    expect(reply).toMatch(/zero-config proxy reply/i);
    await expect(page.locator("#lf-turnstile-mount")).toHaveCount(0);
  });
});
