import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installLocalIndexHtml,
  installTestConfigMock,
  mockProxySse,
} from "./helpers";

const TIERS_KEY = "llm_fallbacks_provider_tiers";

test.describe("Wave 4B — tier settings panel", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockProxySse("proxy reply"),
      });
    });
    await installLocalChatBundle(page);
    await installLocalIndexHtml(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#tiersSetting")).toBeVisible({ timeout: 45_000 });
  });

  test("reorder persists to localStorage and survives reload (R36)", async ({ page }) => {
    await page.locator("#tiersSetting").click();
    const panel = page.locator("#shell-panel-tiers");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".lf-tier-row")).toHaveCount(4);

    // Default order starts with quality_api; move proxy_failover to the top.
    await panel.locator('[data-tier-up="proxy_failover"]').click();
    await panel.locator('[data-tier-up="proxy_failover"]').click();
    await panel.locator('[data-tier-up="proxy_failover"]').click();
    await expect(panel.locator(".lf-tier-row").first()).toHaveAttribute(
      "data-tier-id",
      "proxy_failover"
    );

    await panel.locator("#lf-tier-save").click();
    await expect(panel.locator("#lf-tier-status")).toContainText(/Saved order: proxy_failover/);

    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || "null"),
      TIERS_KEY
    );
    expect(stored?.tiers?.[0]).toEqual({ id: "proxy_failover", enabled: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#tiersSetting")).toBeVisible({ timeout: 45_000 });
    await page.locator("#tiersSetting").click();
    await expect(
      page.locator("#shell-panel-tiers .lf-tier-row").first()
    ).toHaveAttribute("data-tier-id", "proxy_failover");
  });

  test("zero-config chat still streams with web/searxng tiers untouched (AE3)", async ({
    page,
  }) => {
    await page.locator("#chatinput").fill("hello zero config");
    await page.locator("#sendbutton").click({ force: true });
    await expect(page.locator(".mur-message-assistant").last()).toContainText("proxy reply", {
      timeout: 30_000,
    });
  });
});
