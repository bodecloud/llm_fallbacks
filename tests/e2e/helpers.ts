import type { Page } from "@playwright/test";

/** Matches loopback hosts — zero-config demo should not use these by default. */
export const LOOPBACK_HOST_RE = /127\.0\.0\.1|localhost/i;
export const ERROR_RE =
  /no API key for|proxy pending|still deploying|NetworkError|Failed to fetch|401 Unauthorized|PROXY_UNAVAILABLE|HTTP 502|HTTP 429|Rate limit exceeded|Workers AI failed|proxy_erro/i;

export const DEMO_PROXY = "https://demo-proxy.test";
export const PRIMARY_FAIL_PROXY = "https://primary-fail.test";
export const SECONDARY_OK_PROXY = "https://secondary-ok.test";

export function mockProxySse(content: string): string {
  const words = content.split(/(\s+)/);
  let body = "";
  for (const w of words) {
    if (!w) continue;
    body += `data: ${JSON.stringify({
      choices: [{ index: 0, delta: { content: w }, finish_reason: null }],
    })}\n\n`;
  }
  body += `data: ${JSON.stringify({
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  })}\n\n`;
  body += "data: [DONE]\n\n";
  return body;
}

export async function installDemoProxyMock(page: Page, reply = "42 — zero-config proxy reply") {
  await page.route(`${DEMO_PROXY}/v1/chat/completions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: mockProxySse(reply),
    });
  });
}

export async function installTestConfigMock(page: Page) {
  await page.route("**/config.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "window.LLM_FALLBACKS_CONFIG = " +
        JSON.stringify({
          endpoints: [DEMO_PROXY],
          guestToken: "llm-fallbacks-public",
          defaultModel: "free",
          catalogUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json",
          providerUrlsUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/provider_urls.json",
          chatProxyUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/chat_proxy.json",
          maxTokens: 512,
        }) +
        ";",
    });
  });

  await page.route("**/chat_proxy.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        endpoints: [DEMO_PROXY],
        guestToken: "llm-fallbacks-public",
      }),
    });
  });

  await page.route("**/llm-fallbacks-proxy.bocloud.workers.dev/**", (route) =>
    route.abort("blockedbyclient")
  );

  await page.route("**/free_models.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.route("**/provider_urls.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
}

export async function installDualEndpointFailoverMocks(page: Page) {
  await page.route("**/config.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body:
        "window.LLM_FALLBACKS_CONFIG = " +
        JSON.stringify({
          endpoints: [PRIMARY_FAIL_PROXY],
          guestToken: "llm-fallbacks-public",
          defaultModel: "free",
          catalogUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json",
          providerUrlsUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/provider_urls.json",
          chatProxyUrl:
            "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/chat_proxy.json",
          maxTokens: 512,
        }) +
        ";",
    });
  });

  await page.route("**/chat_proxy.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        endpoints: [PRIMARY_FAIL_PROXY, SECONDARY_OK_PROXY],
        guestToken: "llm-fallbacks-public",
      }),
    });
  });

  await page.route("**/free_models.json", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/provider_urls.json", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.route(`${PRIMARY_FAIL_PROXY}/v1/chat/completions`, async (route) => {
    await route.fulfill({ status: 503, body: "upstream unavailable" });
  });

  await page.route(`${SECONDARY_OK_PROXY}/v1/chat/completions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream; charset=utf-8",
      body: mockProxySse("failover secondary reply"),
    });
  });
}

export function lastAssistant(page: Page) {
  return page.locator(".mur-message-assistant").last().locator(".mur-message-blocks-wrapper");
}

export function lastAssistantMessage(page: Page) {
  return page.locator(".mur-message-assistant").last();
}

export function lastUserMessage(page: Page) {
  return page.locator(".mur-message-user").last();
}

export async function waitForAssistantText(page: Page, timeout = 90_000) {
  await lastAssistantMessage(page).waitFor({ state: "visible", timeout });
  const blocks = lastAssistant(page);
  const message = lastAssistantMessage(page);
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeout) {
    const text = ((await blocks.textContent()) || (await message.textContent()) || "").trim();
    if (text.length > 2 && text !== "…" && !ERROR_RE.test(text)) {
      return text;
    }
    if (text !== last && text.length > 0) {
      last = text;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Assistant reply timeout; last="${last}"`);
}

export async function installLocalChatBundle(page: Page): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const bundlePath = path.join(process.cwd(), "docs/assets/chat.js");
  const body = fs.readFileSync(bundlePath, "utf8");
  await page.route("**/assets/chat.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body,
    });
  });
}

export function readStoredEndpoints(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("llm_fallbacks_proxy_endpoints") || "[]");
    } catch {
      return [];
    }
  });
}
