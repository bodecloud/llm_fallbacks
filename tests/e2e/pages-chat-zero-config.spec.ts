import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";

/**
 * End-to-end proof that https://bodecloud.github.io/llm_fallbacks/ works with
 * zero user configuration: no API keys, no Settings, default free model only.
 */
test.describe("Zero-config production chat journey", () => {
  test("fresh visitor can chat without touching Settings or saving keys", async ({ page }) => {
    test.setTimeout(180_000);

    const networkLog: { url: string; method: string }[] = [];
    page.on("request", (req) => {
      networkLog.push({ url: req.url(), method: req.method() });
    });

    // --- 1. Fresh visit: wipe any prior keys ---
    await page.goto(PAGES_BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("llm_fallbacks_api_keys");
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "llm-fallbacks" })).toBeVisible();
    await expect(page.getByText("zero-config cloud failover")).toBeVisible();

    // --- 2. Confirm no saved keys anywhere ---
    const keysBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("llm_fallbacks_api_keys") || "{}")
    );
    expect(Object.keys(keysBefore)).toHaveLength(0);

    // --- 3. Settings: fields empty, close without saving ---
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("OpenRouter API key")).toHaveValue("");
    await expect(page.getByLabel("Groq API key (optional)")).toHaveValue("");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // --- 4. Catalog + proxy ready (no localhost) ---
    const status = page.locator("#status");
    await expect(status).toContainText(/cloud route|zero-config/, { timeout: 45_000 });
    await expect(status).toContainText(/no keys required/i, { timeout: 45_000 });
    await expect(status).not.toContainText(/127\.0\.0\.1|localhost/i);

    const config = await page.evaluate(() => window.LLM_FALLBACKS_CONFIG);
    expect(config.endpoints.length).toBeGreaterThan(0);
    for (const ep of config.endpoints) {
      expect(ep).toMatch(/^https:\/\/.+\.workers\.dev$/);
    }

    // --- 5. Model dropdown: default free, no BYOK-only providers ---
    const modelSelect = page.locator("#model");
    await expect(modelSelect).toHaveValue("free");
    const modelOptions = await modelSelect.locator("option").allTextContents();
    expect(modelOptions.some((o) => o.includes("lemonade/"))).toBeFalsy();

    // --- 6. First message: fill textarea, submit form ---
    const input = page.getByLabel("Message input");
    const userMsg1 = "Reply with exactly one word: alpha";
    await input.fill(userMsg1);
    await expect(input).toHaveValue(userMsg1);

    await page.getByRole("button", { name: "Send" }).click();
    await expect(input).toHaveValue("");

    const userBubble1 = page.locator(".msg.user").last();
    await expect(userBubble1).toHaveText(userMsg1);

    const assistant1 = page.locator(".msg.assistant").last();
    await expect(assistant1).toBeVisible();
    await expect(assistant1).toHaveText("…");

    await expect
      .poll(
        async () => {
          const text = (await assistant1.textContent()) || "";
          return text !== "…" && text.length > 1 && !/no API key|proxy pending|Failed to fetch/i.test(text);
        },
        { timeout: 90_000 }
      )
      .toBeTruthy();

    const reply1 = ((await assistant1.textContent()) || "").trim();
    console.log("[zero-config] assistant reply 1:", reply1.slice(0, 120));

    await expect(status).toContainText(/ok · proxy\//, { timeout: 30_000 });
    const statusAfter1 = await status.textContent();
    console.log("[zero-config] status after msg 1:", statusAfter1);
    expect(statusAfter1).toMatch(/workers\.dev/);

    // --- 7. Second message: multi-turn without any config change ---
    const userMsg2 = "Now reply with exactly one word: beta";
    await input.fill(userMsg2);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".msg.user").last()).toHaveText(userMsg2);

    const assistant2 = page.locator(".msg.assistant").last();
    await expect
      .poll(
        async () => {
          const text = (await assistant2.textContent()) || "";
          return text !== "…" && text.length > 1;
        },
        { timeout: 90_000 }
      )
      .toBeTruthy();

    const reply2 = ((await assistant2.textContent()) || "").trim();
    console.log("[zero-config] assistant reply 2:", reply2.slice(0, 120));

    // --- 8. Clear chat ---
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText("Chat cleared.")).toBeVisible();
    await expect(page.locator(".msg.user")).toHaveCount(0);

    // --- 9. Still zero keys; proxy was used (not browser BYOK) ---
    const keysAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("llm_fallbacks_api_keys") || "{}")
    );
    expect(Object.keys(keysAfter)).toHaveLength(0);

    const proxyCalls = networkLog.filter(
      (r) => r.method === "POST" && r.url.includes("workers.dev") && r.url.includes("/v1/chat/completions")
    );
    expect(proxyCalls.length).toBeGreaterThanOrEqual(2);
    console.log("[zero-config] proxy POST calls:", proxyCalls.length);

    const localhostCalls = networkLog.filter((r) => /127\.0\.0\.1|localhost/i.test(r.url));
    expect(localhostCalls).toHaveLength(0);
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
