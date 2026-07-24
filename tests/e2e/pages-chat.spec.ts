import { expect, test } from "@playwright/test";
import {
  DEMO_PROXY,
  LOCALHOST_RE,
  installDemoProxyMock,
  installTestConfigMock,
  lastAssistant,
  lastUserMessage,
  readStoredEndpoints,
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

    const endpoints = await readStoredEndpoints(page);
    expect(endpoints[0]).toBe(DEMO_PROXY);
    expect(endpoints.join(",")).not.toMatch(LOCALHOST_RE);
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
    await page.locator("#byokSetting").click();
    await expect(page.locator("#sysMask")).toBeVisible();
    await expect(page.locator("#keyInput")).toBeVisible({ timeout: 15_000 });
    await page.locator("#keyInput").fill("sk-or-settings-test");
    await page.getByRole("button", { name: "Save keys" }).click();

    const stored = await page.evaluate(() => {
      try {
        const keys = JSON.parse(localStorage.getItem("llm_fallbacks_api_keys") || "{}");
        return keys.openrouter || "";
      } catch {
        return "";
      }
    });
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

  test("user message appears in feed", async ({ page }) => {
    await page.locator("#chatinput").fill("hello feed");
    await page.locator("#sendbutton").click();
    await expect(lastUserMessage(page)).toContainText("hello feed", { timeout: 15_000 });
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
