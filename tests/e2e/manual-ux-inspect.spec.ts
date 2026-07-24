import { expect, test } from "@playwright/test";
import { PAGES_BASE_URL } from "../../playwright.config";
import {
  ERROR_RE,
  lastUserMessage,
  waitForAssistantText,
} from "./helpers";
import * as fs from "fs";
import * as path from "path";

const OUT = path.join(process.cwd(), "playwright-report", "ux-inspect");

test.describe("Manual UX + analytics inspection", () => {
  test("capture UI, verify analytics, audit computed styles", async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(OUT, { recursive: true });

    const eventsSeen: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/v1/events")) {
        eventsSeen.push(req.postData() || req.url());
      }
    });

    await page.goto(PAGES_BASE_URL, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.removeItem("llm_fallbacks_api_keys");
      localStorage.removeItem("llm_fallbacks_proxy_endpoints");
      localStorage.removeItem("llm_fallbacks_guest_token");
      localStorage.removeItem("llm_fallbacks_default_model");
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#chatinput")).toBeVisible({ timeout: 45_000 });

    await page.waitForTimeout(1500);

    const audit = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          bg: s.backgroundColor,
          color: s.color,
          border: s.borderColor,
          display: s.display,
          visibility: s.visibility,
          rect: el.getBoundingClientRect(),
        };
      };
      const sessionEvents = Object.keys(sessionStorage).filter((k) =>
        k.startsWith("llm_fallbacks_evt_")
      );
      return {
        sessionEvents,
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        mountTheme: document.querySelector("#chatMount")?.getAttribute("data-theme"),
        chatForm: pick(".mur-chat-form"),
        chatInput: pick(".mur-chat-input"),
        sendBtn: pick(".mur-send-btn"),
        topBar: pick(".credits-bar.top-credits"),
        sidebar: pick(".mur-sidebar"),
        mainHeader: pick(".mur-main-header"),
        openSidebarBtn: pick(".mur-open-sidebar-btn"),
        shellBg: pick("body"),
        duplicateHeaders: document.querySelectorAll(".mur-main-header").length,
        whiteSurfaces: [...document.querySelectorAll("*")]
          .filter((el) => {
            const s = getComputedStyle(el);
            const bg = s.backgroundColor;
            return (
              bg === "rgb(255, 255, 255)" &&
              s.display !== "none" &&
              el.getBoundingClientRect().width > 40 &&
              el.getBoundingClientRect().height > 20
            );
          })
          .slice(0, 12)
          .map((el) => ({
            tag: el.tagName,
            class: el.className.toString().slice(0, 80),
          })),
      };
    });

    fs.writeFileSync(path.join(OUT, "audit-initial.json"), JSON.stringify(audit, null, 2));
    await page.screenshot({ path: path.join(OUT, "01-initial-desktop.png"), fullPage: false });

    await expect(page.locator(".mur-toolbar-btn")).toHaveCount(0);
    await expect(page.locator("#chatMount.mur-chat-empty .mur-chat-layout-wrapper")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, "02-mobile.png"), fullPage: false });

    await page.setViewportSize({ width: 1280, height: 800 });

    await page.locator("#sysSetting").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, "03-failover-panel.png"), fullPage: false });
    await page.locator("#closeSet").click();

    await page.locator("#explorerSetting").click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, "04-model-explorer.png"), fullPage: false });
    await page.locator("#closeSet").click();

    const isLocal = PAGES_BASE_URL.includes("127.0.0.1") || PAGES_BASE_URL.includes("localhost");
    if (!isLocal) {
      const userMsg = "Reply with exactly one word: wolf";
      await page.locator("#chatinput").fill(userMsg);
      await page.locator("#sendbutton").click();
      await expect(lastUserMessage(page)).toContainText(userMsg, { timeout: 30_000 });
      const reply = await waitForAssistantText(page);
      expect(reply).not.toMatch(ERROR_RE);

      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, "05-after-chat.png"), fullPage: false });

      const postChat = await page.evaluate(() => ({
        sessionEvents: Object.keys(sessionStorage).filter((k) => k.startsWith("llm_fallbacks_evt_")),
        route: (window as Window & { LLM_FALLBACKS_ROUTE?: string }).LLM_FALLBACKS_ROUTE,
      }));

      fs.writeFileSync(
        path.join(OUT, "analytics.json"),
        JSON.stringify({ eventsSeen, postChat }, null, 2)
      );

      expect(postChat.sessionEvents).toContain("llm_fallbacks_evt_homepage_session");
      expect(postChat.sessionEvents).toContain("llm_fallbacks_evt_chat_completion_success");
      expect(eventsSeen.length).toBeGreaterThan(0);
    } else {
      fs.writeFileSync(
        path.join(OUT, "analytics.json"),
        JSON.stringify({ eventsSeen, note: "chat skipped on localhost (CORS)" }, null, 2)
      );
    }

    expect(audit.whiteSurfaces).toEqual([]);
    expect(audit.chatForm?.bg).not.toBe("rgb(255, 255, 255)");
  });
});
