import { expect, test } from "@playwright/test";

const LOCALHOST_RE = /127\.0\.0\.1|localhost:\d+/i;

test.describe("GitHub Pages chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "llm-fallbacks" })).toBeVisible();
  });

  test("loads browser-first UI without localhost endpoints", async ({ page }) => {
    await expect(page.getByText("browser-first failover")).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(config.endpoints).toEqual([]);
    expect(JSON.stringify(config)).not.toMatch(LOCALHOST_RE);

    await expect(page.locator("#status")).not.toContainText(LOCALHOST_RE);
    await expect(page.locator("body")).not.toContainText("Trying http://127.0.0.1");
  });

  test("send without keys never contacts localhost", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.getByLabel("Message input").fill("meaning of life");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".msg.assistant")).toBeVisible({ timeout: 15_000 });
    const assistantText = await page.locator(".msg.assistant").last().textContent();
    expect(assistantText).not.toMatch(LOCALHOST_RE);
    expect(assistantText).toMatch(/OpenRouter API key|Browser fallback|unsupported provider/i);

    const localhostRequests = requests.filter((u) => LOCALHOST_RE.test(u));
    expect(localhostRequests).toEqual([]);

    await expect(page.locator("#status")).not.toContainText(LOCALHOST_RE);
  });

  test("send with mocked OpenRouter key returns assistant reply", async ({ page }) => {
    await page.route("**/openrouter.ai/api/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "42 — automated e2e reply" } }],
        }),
      });
    });

    await page.evaluate(() => {
      localStorage.setItem(
        "llm_fallbacks_api_keys",
        JSON.stringify({ openrouter: "sk-or-test-e2e-key" })
      );
    });
    await page.reload({ waitUntil: "networkidle" });

    await page.getByLabel("Message input").fill("meaning of life");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".msg.assistant").last()).toHaveText("42 — automated e2e reply", {
      timeout: 20_000,
    });
    await expect(page.locator("#status")).toContainText("browser/openrouter");
    await expect(page.locator("#status")).not.toContainText(LOCALHOST_RE);
  });

  test("settings panel persists API keys in localStorage", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("OpenRouter API key").fill("sk-or-settings-test");
    await page.getByRole("button", { name: "Save keys" }).click();

    await expect(page.getByText("API keys saved locally")).toBeVisible();

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("llm_fallbacks_api_keys") || "{}")
    );
    expect(stored.openrouter).toBe("sk-or-settings-test");
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
      maxTokens: number;
    };
  }
}
