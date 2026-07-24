import { expect, test } from "@playwright/test";
import {
  DEMO_PROXY,
  LOCALHOST_RE,
  installDemoProxyMock,
  installTestConfigMock,
  lastAssistant,
  waitForAssistantText,
} from "./helpers";

test.describe("GitHub Pages chat (mocked SSE on live site)", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installDemoProxyMock(page);

    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("loads UI without localhost endpoints", async ({ page }) => {
    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(JSON.stringify(config)).not.toMatch(LOCALHOST_RE);

    const host = await page.evaluate(() => localStorage.getItem("APIHost") || "");
    expect(host).toBe(DEMO_PROXY);
    expect(host).not.toMatch(LOCALHOST_RE);
  });

  test("send without keys streams mocked proxy reply", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.locator("#chatinput").fill("meaning of life");
    await page.locator("#sendbutton").click();

    const reply = await waitForAssistantText(page, 30_000);
    expect(reply).toContain("42 — zero-config proxy reply");

    expect(requests.some((u) => u.includes("demo-proxy.test"))).toBeTruthy();
    expect(requests.filter((u) => LOCALHOST_RE.test(u))).toHaveLength(0);
  });

  test("settings can store optional API key locally", async ({ page }) => {
    await page.locator("#sysSetting").click();
    await expect(page.locator("#sysMask")).toBeVisible();
    await page.locator("#keyInput").fill("sk-or-settings-test");
    await page.locator("#keyInput").dispatchEvent("change");
    await page.locator("#closeSet").click();

    const stored = await page.evaluate(() => localStorage.getItem("APIKey") || "");
    expect(stored.length).toBeGreaterThan(0);
  });

  test("assistant renders markdown body not raw JSON", async ({ page }) => {
    await page.locator("#chatinput").fill("hello");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);

    const html = await lastAssistant(page).innerHTML();
    expect(html).not.toMatch(/^\s*\{\s*\.\.\./);
    expect(html).toContain("42");
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
