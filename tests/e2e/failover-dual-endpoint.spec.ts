import { expect, test } from "@playwright/test";
import {
  DEMO_PROXY,
  LOCALHOST_RE,
  PRIMARY_FAIL_PROXY,
  SECONDARY_OK_PROXY,
  installDemoProxyMock,
  installDualEndpointFailoverMocks,
  installLocalChatBundle,
  installTestConfigMock,
  waitForAssistantText,
} from "./helpers";

test.describe("Dual-endpoint client failover (mocked AE2)", () => {
  test.beforeEach(async ({ page }) => {
    await installDualEndpointFailoverMocks(page);
    await installLocalChatBundle(page);

    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("tries secondary endpoint when primary returns 503", async ({ page }) => {
    const chatRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/v1/chat/completions")) {
        chatRequests.push(req.url());
      }
    });

    await page.locator("#chatinput").fill("failover check");
    await page.locator("#sendbutton").click();

    const reply = await waitForAssistantText(page, 30_000);
    expect(reply).toContain("failover secondary reply");

    expect(chatRequests.some((u) => u.startsWith(PRIMARY_FAIL_PROXY))).toBeTruthy();
    expect(chatRequests.some((u) => u.startsWith(SECONDARY_OK_PROXY))).toBeTruthy();
    expect(chatRequests.filter((u) => LOCALHOST_RE.test(u))).toHaveLength(0);
  });
});

test.describe("Single-endpoint regression (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    await installTestConfigMock(page);
    await installDemoProxyMock(page);

    await page.goto("./", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });
  });

  test("single configured endpoint still works", async ({ page }) => {
    const chatRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/v1/chat/completions")) {
        chatRequests.push(req.url());
      }
    });

    await page.locator("#chatinput").fill("single endpoint");
    await page.locator("#sendbutton").click();

    const reply = await waitForAssistantText(page, 30_000);
    expect(reply).toContain("42 — zero-config proxy reply");
    expect(chatRequests.some((u) => u.startsWith(DEMO_PROXY))).toBeTruthy();
    expect(chatRequests.some((u) => u.startsWith(SECONDARY_OK_PROXY))).toBeFalsy();
  });
});
