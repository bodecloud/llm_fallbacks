import { test, expect } from "@playwright/test";
import {
  installLocalChatBundle,
  installTestConfigMock,
} from "./helpers";

test.describe("Wave 4 — shortcuts sheet", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("llm_fallbacks_shortcuts_hint_dismissed", "1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("opens shortcuts modal on ?", async ({ page }) => {
    await page.keyboard.press("?");
    const modal = page.locator("#lfShortcutsModal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Enter", { exact: true })).toBeVisible();
    await expect(modal.getByText("Send message")).toBeVisible();
    await expect(modal.getByText("Shift + Enter")).toBeVisible();
  });

  test("footer link opens shortcuts", async ({ page }) => {
    await page.getByRole("button", { name: "Shortcuts" }).click();
    await expect(page.locator("#lfShortcutsModal")).toBeVisible();
  });
});
