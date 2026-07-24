import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";
import {
  ERROR_RE,
  LOCALHOST_RE,
  lastAssistant,
  waitForAssistantText,
} from "./helpers";

test.describe("Live GitHub Pages chat (no mocks)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGES_BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("llm_fallbacks_api_keys");
      localStorage.removeItem("APIKey");
      localStorage.removeItem("APIHost");
      localStorage.removeItem("APIModel");
      localStorage.removeItem("modelVersion");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("loads zero-config UI with cloud routes only (no localhost)", async ({ page }) => {
    await expect(page).toHaveTitle(/llm-fallbacks/i);
    await expect(page.locator("#chatinput")).toBeVisible();
    await expect(page.locator("#sendbutton")).toBeVisible();

    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(JSON.stringify(config)).not.toMatch(LOCALHOST_RE);
    for (const endpoint of config.endpoints || []) {
      expect(endpoint).toMatch(/^https:\/\/.+\.workers\.dev$/);
    }

    const storedHost = await page.evaluate(() => localStorage.getItem("APIHost") || "");
    expect(storedHost).toMatch(/workers\.dev/);
    expect(storedHost).not.toMatch(LOCALHOST_RE);
  });

  test("streams a real assistant reply via cloud proxy", async ({ page }) => {
    test.setTimeout(180_000);

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    const userMsg = "Reply with one short word: pong";
    await page.locator("#chatinput").fill(userMsg);
    await page.locator("#sendbutton").click();

    await expect(page.locator(".request").last()).toContainText(userMsg);

    const assistant = lastAssistant(page);
    let seenPartial = false;
    const start = Date.now();
    while (Date.now() - start < 90_000) {
      const text = ((await assistant.textContent()) || "").trim();
      if (text.length > 0 && text !== "…") {
        seenPartial = true;
      }
      if (seenPartial && text.length > 2 && !ERROR_RE.test(text) && !text.endsWith("…")) {
        break;
      }
      await page.waitForTimeout(200);
    }

    const reply = await waitForAssistantText(page);
    expect(reply).not.toMatch(LOCALHOST_RE);
    expect(reply).not.toMatch(ERROR_RE);
    expect(seenPartial).toBeTruthy();

    const hitProxy = requests.some(
      (u) => u.includes("workers.dev") && u.includes("/v1/chat/completions")
    );
    expect(hitProxy).toBeTruthy();
    expect(requests.filter((u) => LOCALHOST_RE.test(u))).toHaveLength(0);
  });

  test("settings dialog opens without requiring keys", async ({ page }) => {
    await page.locator("#setting").click();
    await expect(page.locator("#sysDialog")).toBeVisible();
    await expect(page.locator("#apiHostInput")).toBeVisible();
    await page.locator("#closeSet").click();
    await expect(page.locator("#sysMask")).toBeHidden();
  });
});

declare global {
  interface Window {
    LLM_FALLBACKS_CONFIG: {
      endpoints: string[];
      guestToken: string;
      defaultModel: string;
      catalogUrl: string;
      providerUrlsUrl: string;
      chatProxyUrl?: string;
      maxTokens: number;
    };
  }
}
