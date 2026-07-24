import { expect, test } from "@playwright/test";

const LOCALHOST_RE = /127\.0\.0\.1|localhost:\d+/i;

test.describe("GitHub Pages chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/chat_proxy.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          endpoints: ["https://demo-proxy.test"],
          guestToken: "llm-fallbacks-public",
        }),
      });
    });

    await page.route("https://demo-proxy.test/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "42 — zero-config proxy reply" } }],
        }),
      });
    });

    await page.goto("./", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "llm-fallbacks" })).toBeVisible();
    await expect(page.locator("#status")).toBeVisible({ timeout: 30_000 });
  });

  test("loads zero-config UI without localhost endpoints", async ({ page }) => {
    await expect(page.getByText("zero-config cloud failover")).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(JSON.stringify(config)).not.toMatch(LOCALHOST_RE);

    await expect(page.locator("#status")).not.toContainText(LOCALHOST_RE);
    await expect(page.locator("body")).not.toContainText("Trying http://127.0.0.1");
  });

  test("send without keys uses cloud proxy and returns a reply", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.getByLabel("Message input").fill("meaning of life");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".msg.assistant").last()).toHaveText("42 — zero-config proxy reply", {
      timeout: 20_000,
    });

    expect(requests.some((u) => u.includes("demo-proxy.test"))).toBeTruthy();
    expect(requests.filter((u) => LOCALHOST_RE.test(u))).toEqual([]);
    await expect(page.locator("#status")).toContainText("proxy/");
    await expect(page.locator(".msg.assistant").last()).not.toContainText(/OpenRouter API key/i);
  });

  test("send with optional OpenRouter key uses browser routing", async ({ page }) => {
    await page.route("**/chat_proxy.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ endpoints: [], guestToken: "llm-fallbacks-public" }),
      });
    });

    await page.route("**/openrouter.ai/api/v1/chat/completions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choices: [{ message: { role: "assistant", content: "42 — optional BYOK reply" } }],
        }),
      });
    });

    await page.evaluate(() => {
      localStorage.setItem(
        "llm_fallbacks_api_keys",
        JSON.stringify({ openrouter: "sk-or-test-e2e-key" })
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Message input").fill("meaning of life");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".msg.assistant").last()).toHaveText("42 — optional BYOK reply", {
      timeout: 20_000,
    });
    await expect(page.locator("#status")).toContainText("browser/openrouter");
    await expect(page.locator(".msg.assistant").last()).not.toContainText(/no API key for/i);
  });

  test("model dropdown hides providers without saved keys", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        "llm_fallbacks_api_keys",
        JSON.stringify({ openrouter: "sk-or-test-e2e-key" })
      );
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toBeVisible({ timeout: 30_000 });

    const options = await page.locator("#model option").allTextContents();
    expect(options.some((o) => o.includes("lemonade/"))).toBeFalsy();
    expect(options.some((o) => o.includes("openrouter/"))).toBeTruthy();
  });

  test("settings panel persists optional API keys in localStorage", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("OpenRouter API key").fill("sk-or-settings-test");
    await page.locator("#keys-form").getByRole("button", { name: "Save keys" }).click();

    await expect(page.getByText(/Optional API keys saved locally/)).toBeVisible();

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
      chatProxyUrl?: string;
      maxTokens: number;
    };
  }
}
