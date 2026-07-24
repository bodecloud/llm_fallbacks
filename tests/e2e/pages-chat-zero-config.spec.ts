import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";
import { ERROR_RE, LOCALHOST_RE, lastAssistant, waitForAssistantText } from "./helpers";

test.describe("Zero-config production chat journey", () => {
  test("fresh visitor chats with streaming and no saved keys", async ({ page }) => {
    test.setTimeout(180_000);

    const networkLog: string[] = [];
    page.on("request", (req) => networkLog.push(req.url()));

    await page.goto(PAGES_BASE_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });

    expect(await page.evaluate(() => localStorage.getItem("APIKey"))).toMatch(
      /llm-fallbacks-public|.+/
    );
    const host = await page.evaluate(() => localStorage.getItem("APIHost") || "");
    expect(host).toMatch(/workers\.dev/);

    await page.locator("#setting").click();
    await expect(page.locator("#keyInput")).toBeVisible();
    await page.locator("#closeSet").click();

    const msg1 = "Reply with exactly one word: alpha";
    await page.locator("#chatinput").fill(msg1);
    await page.locator("#sendbutton").click();
    await expect(page.locator(".request").last()).toContainText(msg1);

    const reply1 = await waitForAssistantText(page);
    console.log("[zero-config] assistant reply 1:", reply1.slice(0, 120));
    expect(reply1).not.toMatch(ERROR_RE);

    const msg2 = "Now reply with exactly one word: beta";
    await page.locator("#chatinput").fill(msg2);
    await page.locator("#sendbutton").click();
    const reply2 = await waitForAssistantText(page);
    console.log("[zero-config] assistant reply 2:", reply2.slice(0, 120));
    expect(reply2).not.toMatch(ERROR_RE);

    const proxyCalls = networkLog.filter(
      (u) => u.includes("workers.dev") && u.includes("/v1/chat/completions")
    );
    expect(proxyCalls.length).toBeGreaterThanOrEqual(2);
    expect(networkLog.filter((u) => LOCALHOST_RE.test(u))).toHaveLength(0);
  });
});
