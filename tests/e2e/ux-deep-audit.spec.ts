import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";
import { waitForAssistantText } from "./helpers";

test.describe("Deep UX audit", () => {
  test("layout metrics and remaining polish checks", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(PAGES_BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });

    const desktop = await page.evaluate(() => {
      const form = document.querySelector(".mur-chat-form-container");
      const mount = document.querySelector("#chatMount");
      const formRect = form?.getBoundingClientRect();
      const mountRect = mount?.getBoundingClientRect();
      const inputBottom = formRect ? mountRect!.bottom - formRect.bottom : null;
      return {
        hasToolbar: document.querySelectorAll(".mur-toolbar-btn").length,
        emptyClass: mount?.classList.contains("mur-chat-empty"),
        inputAnchoredBottom: inputBottom !== null && inputBottom < 80,
        heroBefore: getComputedStyle(document.querySelector(".mur-chat-layout-wrapper")!, "::before").content,
        sidebarW: document.querySelector(".mur-sidebar")?.getBoundingClientRect().width,
        topBarH: document.querySelector(".credits-bar")?.getBoundingClientRect().height,
      };
    });
    expect(desktop.hasToolbar).toBe(0);
    expect(desktop.emptyClass).toBe(true);
    expect(desktop.inputAnchoredBottom).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      openSidebarDisplay: getComputedStyle(document.querySelector(".mur-open-sidebar-btn")!).display,
    }));
    expect(mobile.openSidebarDisplay).not.toBe("none");

    await page.locator(".mur-open-sidebar-btn").click({ force: true });
    await page.waitForTimeout(400);
    const sidebarOpen = await page.evaluate(() =>
      document.querySelector(".mur-sidebar")?.classList.contains("mur-mobile-open")
    );
    expect(sidebarOpen).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator("#chatinput").fill("Reply with one word: ok");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page);

    const bubbleWidth = await page.locator(".mur-message-assistant").first().evaluate((el) => {
      const mount = document.querySelector("#chatMount")!.getBoundingClientRect().width;
      return el.getBoundingClientRect().width / mount;
    });
    expect(bubbleWidth).toBeLessThan(0.92);

    await page.locator("#byokSetting").click();
    await expect(page.locator("#panel-byok .panel-btn-primary")).toBeVisible();
    const byokBtnStyle = await page.locator("#panel-byok .panel-btn-primary").evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(byokBtnStyle.bg).not.toBe("rgb(255, 255, 255)");
  });
});
