import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installFailoverTimelineMocks,
  installLocalChatBundle,
  installLocalIndexHtml,
  installTestConfigMock,
  mockProxySse,
  waitForAssistantText,
} from "./helpers";

test.describe("Wave 6A — failover timeline + usage badge", () => {
  test("expand chip shows hops, usage badge, alias note, and session totals", async ({
    page,
  }) => {
    await installFailoverTimelineMocks(page);
    await installLocalChatBundle(page);
    await installLocalIndexHtml(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
    await page.locator("#chatinput").fill("show me the hops");
    await page.locator("#sendbutton").click({ force: true });

    const reply = await waitForAssistantText(page);
    expect(reply).toContain("failover timeline reply");

    const chip = page.locator(".lf-routing-chip").last();
    await expect(chip).toBeVisible({ timeout: 15_000 });
    await expect(chip.locator(".lf-usage-badge")).toContainText(/tok|TTFT|ms/i);

    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(chip).toHaveAttribute("aria-expanded", "true");

    const panel = page.locator(".lf-routing-panel").last();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".lf-hop-row")).toHaveCount(3, { timeout: 5_000 });
    // quality_api skip + primary error + secondary success
    await expect(panel.locator(".lf-hop-outcome-skip").first()).toBeVisible();
    await expect(panel.locator(".lf-hop-outcome-error").first()).toBeVisible();
    await expect(panel.locator(".lf-hop-outcome-success").last()).toBeVisible();
    await expect(panel.locator(".lf-alias-note")).toContainText(/openrouter\/free/i);

    await expect(page.locator(".lf-session-totals")).toBeVisible();
    await expect(page.locator(".lf-session-totals")).toContainText(/Session:/i);
  });

  test("latency-only badge when usage chunk is absent (R59)", async ({ page }) => {
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockProxySse("no usage here"),
      });
    });
    await installLocalChatBundle(page);
    await installLocalIndexHtml(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });

    await page.locator("#chatinput").fill("latency only");
    await page.locator("#sendbutton").click({ force: true });
    await waitForAssistantText(page);

    const badge = page.locator(".lf-usage-badge").last();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).not.toContainText(/tok/i);
    await expect(badge).toContainText(/ms/i);
  });
});
