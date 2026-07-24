import { expect, test } from "@playwright/test";

const LIVE_BASE = process.env.PAGES_BASE_URL || "https://bodecloud.github.io/llm_fallbacks/";
const LOCALHOST_RE = /127\.0\.0\.1|localhost:\d+/i;
const ERROR_RE = /no API key for|proxy pending|still deploying|NetworkError/i;

test.describe("Live GitHub Pages chat (no mocks)", () => {
  test("zero-config send returns a real assistant reply via cloud proxy", async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const liveBase = process.env.PAGES_BASE_URL || baseURL || "https://bodecloud.github.io/llm_fallbacks/";

    await page.goto(liveBase, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "llm-fallbacks" })).toBeVisible();
    await expect(page.locator("#status")).toBeVisible({ timeout: 45_000 });

    await page.evaluate(() => localStorage.removeItem("llm_fallbacks_api_keys"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("#status")).toContainText(/cloud route|proxy\//, { timeout: 45_000 });

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
        { timeout: 60_000 }
      )
      .toBeTruthy();

    const reply = (await assistant.textContent()) || "";
    expect(reply).not.toMatch(LOCALHOST_RE);
    expect(reply).not.toMatch(ERROR_RE);

    const hitProxy = requests.some(
      (u) => u.includes("workers.dev") && u.includes("/v1/chat/completions")
    );
    expect(hitProxy).toBeTruthy();

    await expect(page.locator("#status")).toContainText(/proxy:|ok · proxy\//, { timeout: 60_000 });
  });
});
