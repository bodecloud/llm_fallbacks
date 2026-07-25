import { test, expect } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  waitForAssistantText,
} from "./helpers";

const MOCK_CATALOG = [
  { id: "groq/llama-3.3-70b", provider: "groq", quality_score: 9.2 },
  { id: "google/gemini-2.0-flash", provider: "google", quality_score: 8.5 },
];

async function installCatalogMock(page: import("@playwright/test").Page) {
  await page.route("**/free_models.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CATALOG),
    });
  });
}

async function installProxyWithHeaders(page: import("@playwright/test").Page) {
  await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
    const body =
      'data: {"choices":[{"index":0,"delta":{"content":"hello "},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{"content":"world"},"finish_reason":null}]}\n\n' +
      'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
      "data: [DONE]\n\n";
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      headers: {
        "x-llm-fallbacks-endpoint": "demo-proxy.test",
        "x-litellm-model-name": "openrouter/free",
        "Access-Control-Expose-Headers":
          "x-llm-fallbacks-endpoint,x-litellm-model-name",
      },
      body,
    });
  });
}

test.describe("Wave 1 — model picker", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installCatalogMock(page);
    await installProxyWithHeaders(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".lf-model-picker-select")).toBeVisible({ timeout: 45_000 });
  });

  test("picker visible and changes model for chat request", async ({ page }) => {
    const picker = page.locator(".lf-model-picker-select");
    await expect(picker).toBeVisible();
    await picker.selectOption("groq/llama-3.3-70b");

    let capturedModel = "";
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      const req = route.request().postDataJSON() as { model?: string };
      capturedModel = req.model ?? "";
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        headers: { "x-llm-fallbacks-endpoint": "demo-proxy.test" },
        body:
          'data: {"choices":[{"index":0,"delta":{"content":"model picker ok"},"finish_reason":null}]}\n\n' +
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
          "data: [DONE]\n\n",
      });
    });

    await page.locator("#chatinput").fill("test model picker");
    await page.locator("#sendbutton").click();
    await expect.poll(() => capturedModel, { timeout: 30_000 }).toBe("groq/llama-3.3-70b");
  });
});

test.describe("Wave 1 — routing chip", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installCatalogMock(page);
    await installProxyWithHeaders(page);
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("shows routing chip after reply", async ({ page }) => {
    await page.locator("#chatinput").fill("show chip");
    await page.locator("#sendbutton").click();
    await waitForAssistantText(page, 30_000);
    const chip = page.locator(".lf-routing-chip").last();
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await expect(chip).toContainText(/demo-proxy|openrouter\/free/i);
  });
});
