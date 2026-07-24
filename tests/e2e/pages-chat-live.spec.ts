import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";

const LOCALHOST_RE = /127\.0\.0\.1|localhost/i;
const ERROR_RE = /no API key for|proxy pending|still deploying|NetworkError|Failed to fetch/i;

test.describe("Live GitHub Pages chat (no mocks)", () => {
  test.beforeEach(async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.goto(PAGES_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "llm-fallbacks" })).toBeVisible();
    await expect(page.locator("#status")).toBeVisible({ timeout: 45_000 });

    await page.evaluate(() => localStorage.removeItem("llm_fallbacks_api_keys"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toBeVisible({ timeout: 45_000 });

    // Store request log on window for assertions in each test.
    await page.evaluate((urls) => {
      (window as unknown as { __e2eRequests: string[] }).__e2eRequests = urls;
    }, requests);
  });

  test("loads zero-config UI with cloud routes only (no localhost)", async ({ page }) => {
    await expect(page.getByText("zero-config cloud failover")).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(JSON.stringify(config)).not.toMatch(LOCALHOST_RE);
    for (const endpoint of config.endpoints || []) {
      expect(endpoint).not.toMatch(LOCALHOST_RE);
      expect(endpoint).toMatch(/^https:\/\//);
    }

    await expect(page.locator("#status")).toContainText(/cloud route|proxy\//, { timeout: 45_000 });
    await expect(page.locator("#status")).not.toContainText(LOCALHOST_RE);
    await expect(page.locator("body")).not.toContainText("Trying http://127.0.0.1");
  });

  test("zero-config send returns a real assistant reply via cloud proxy", async ({ page }) => {
    test.setTimeout(120_000);

    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));

    await page.locator("#model").selectOption("free");
    await page.getByLabel("Message input").fill("Reply with one short word: pong");
    await page.getByRole("button", { name: "Send" }).click();

    const assistant = page.locator(".msg.assistant").last();
    await expect(assistant).toBeVisible({ timeout: 60_000 });

    await expect
      .poll(
        async () => {
          const text = (await assistant.textContent()) || "";
          return text.length > 3 && text !== "…" && !ERROR_RE.test(text);
        },
        { timeout: 90_000 }
      )
      .toBeTruthy();

    const reply = (await assistant.textContent()) || "";
    expect(reply).not.toMatch(LOCALHOST_RE);
    expect(reply).not.toMatch(ERROR_RE);

    const hitProxy = requests.some(
      (u) => u.includes("workers.dev") && u.includes("/v1/chat/completions")
    );
    expect(hitProxy).toBeTruthy();
    expect(requests.filter((u) => LOCALHOST_RE.test(u))).toEqual([]);

    await expect(page.locator("#status")).toContainText(/ok · proxy\//, { timeout: 60_000 });
  });

  test("settings panel opens and clear chat works", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("OpenRouter API key")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Chat cleared.")).toBeVisible();
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
