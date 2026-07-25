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
        'data: {"choices":[{"index":0,"delta":{"content":"export test reply"},"finish_reason":null}]}\n\n' +
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
        "data: [DONE]\n\n",
    });
  });
}

test.describe("Wave 3 — export session", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installProxyMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("exports markdown from sidebar menu", async ({ page }) => {
    await page.locator("#chatinput").fill("export me");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);

    await page.evaluate(() => {
      document.querySelector("#chatMount")?.classList.remove("mur-sidebar-closed");
      localStorage.setItem("mur_sidebar_closed", "false");
    });

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await page.locator(".mur-sidebar-item-link").first().focus();
    await page.locator(".mur-sidebar-options-btn").first().dispatchEvent("click");
    await expect(page.getByRole("menuitem", { name: "Export as Markdown" })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("menuitem", { name: "Export as Markdown" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/llm-fallbacks-.*\.md$/);
    const path = await download.path();
    expect(path).toBeTruthy();
  });
});
