import type { Page } from "@playwright/test";

export const LOCALHOST_RE = /127\.0\.0\.1|localhost/i;
export const ERROR_RE =
  /no API key for|proxy pending|still deploying|NetworkError|Failed to fetch|401 Unauthorized/i;

export const DEMO_PROXY = "https://demo-proxy.test";

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

  await page.route("**/llm-fallbacks-proxy.bocloud.workers.dev/**", (route) =>
    route.abort("blockedbyclient")
  );
}

export function lastAssistant(page: Page) {
  return page.locator(".response").last().locator(".markdown-body, .responseBody").first();
}

export async function waitForAssistantText(page: Page, timeout = 90_000) {
  const assistant = lastAssistant(page);
  await assistant.waitFor({ state: "visible", timeout });
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeout) {
    const text = ((await assistant.textContent()) || "").trim();
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
