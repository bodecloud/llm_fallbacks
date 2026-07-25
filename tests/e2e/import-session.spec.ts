import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  waitForAssistantText,
} from "./helpers";

async function openSessionMenu(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    document.querySelector("#chatMount")?.classList.remove("mur-sidebar-closed");
    localStorage.setItem("mur_sidebar_closed", "false");
  });
  await page.locator(".mur-sidebar-item-link").first().focus();
  await page.locator(".mur-sidebar-options-btn").first().dispatchEvent("click");
}

test.describe("Wave 4 — import session", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body:
          'data: {"choices":[{"index":0,"delta":{"content":"imported ok"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n",
      });
    });
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("imports exported markdown into a new session", async ({ page }) => {
    await page.locator("#chatinput").fill("seed message");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);

    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await openSessionMenu(page);
    await page.getByRole("menuitem", { name: "Export as Markdown" }).click();
    const download = await downloadPromise;
    const exportPath = await download.path();
    expect(exportPath).toBeTruthy();

    await page.locator(".mur-new-chat-btn").click();
    await expect(page.locator(".mur-message")).toHaveCount(0, { timeout: 10_000 });

    await openSessionMenu(page);
    const importItem = page.getByRole("menuitem", { name: "Import conversation" });
    await expect(importItem).toBeVisible({ timeout: 5_000 });

    const fileInput = page.locator('input[type="file"][accept*=".md"]');
    await fileInput.setInputFiles(exportPath!);

    await expect(page.locator(".mur-message-user").getByText("seed message")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator(".mur-message-assistant").getByText("imported ok")).toBeVisible({
      timeout: 10_000,
    });
  });
});
