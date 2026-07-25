import { test, expect, type Page } from "@playwright/test";
import {
  DEMO_PROXY,
  installLocalChatBundle,
  installTestConfigMock,
  mockProxySse,
  waitForAssistantText,
} from "./helpers";

const MOCK_CATALOG = [
  {
    id: "groq/llama-3.3-70b",
    provider: "groq",
    quality_score: 9.2,
    context_length: 128000,
    supports_vision: true,
  },
  { id: "google/gemini-2.0-flash", provider: "google", quality_score: 8.5 },
];

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function attachPng(page: Page): Promise<void> {
  await page.setInputFiles('input[type="file"]', {
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.locator(".mur-attachment-preview-item")).toBeVisible({ timeout: 15_000 });
}

test.describe("Wave 4B — vision attachments", () => {
  let lastProxyBody: { messages?: { role: string; content: unknown }[] } | null;

  test.beforeEach(async ({ page }) => {
    lastProxyBody = null;
    await installTestConfigMock(page);
    await page.route("**/free_models.json", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_CATALOG),
      });
    });
    await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
      lastProxyBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream; charset=utf-8",
        body: mockProxySse("I can see a tiny transparent pixel."),
      });
    });
    await installLocalChatBundle(page);
    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".lf-model-picker-select")).toBeVisible({ timeout: 45_000 });
  });

  test("PNG + vision model streams a reply and sends image_url to the proxy (AE1)", async ({
    page,
  }) => {
    await page.locator(".lf-model-picker-select").selectOption("groq/llama-3.3-70b");
    await attachPng(page);

    await page.locator("#chatinput").fill("what is in this image?");
    await page.locator("#sendbutton").click({ force: true });

    const reply = await waitForAssistantText(page);
    expect(reply).toContain("tiny transparent pixel");

    expect(lastProxyBody).not.toBeNull();
    const userMessage = lastProxyBody?.messages?.at(-1);
    expect(Array.isArray(userMessage?.content)).toBe(true);
    const parts = userMessage?.content as { type: string; image_url?: { url: string } }[];
    const imagePart = parts.find((p) => p.type === "image_url");
    expect(imagePart?.image_url?.url).toMatch(/^data:image\/png;base64,/);
  });

  test("PNG on a non-vision model blocks with a clear message (R29)", async ({ page }) => {
    // Default model stays `free` (not vision-capable in the catalog).
    await attachPng(page);

    await page.locator("#chatinput").fill("describe this image");
    await page.locator("#sendbutton").click({ force: true });

    await expect(page.locator("#chatMount")).toContainText(/can't read images/i, {
      timeout: 30_000,
    });
    expect(lastProxyBody).toBeNull();
  });
});
