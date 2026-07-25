import type { ChatMessage, RunnerAdapter } from "./types.ts";
import { lastUserPrompt } from "./types.ts";

/**
 * Generic selector-driven browser adapter (BYO selectors, R38). Automates an
 * arbitrary free web chat UI: navigate, type the prompt, submit, then poll
 * the reply element until its text stops growing. Nothing is hardcoded to a
 * specific site — the user supplies the target URL and CSS selectors and is
 * responsible for that site's terms of service.
 *
 * Playwright is imported lazily so the runner works (stub adapter, /health)
 * without it installed. Enable with: npm i playwright && npx playwright
 * install chromium
 */
export interface SelectorAdapterConfig {
  targetUrl: string;
  inputSelector: string;
  submitSelector: string;
  replySelector: string;
  /** Max ms to wait for the first reply text. Default 30000. */
  firstReplyTimeoutMs?: number;
  /** Reply is considered complete after this many ms without growth. Default 2500. */
  settleMs?: number;
  /** Run the browser headed for manual login/captcha flows. Default true (headless). */
  headless?: boolean;
}

export function createGenericSelectorAdapter(config: SelectorAdapterConfig): RunnerAdapter {
  for (const key of ["targetUrl", "inputSelector", "submitSelector", "replySelector"] as const) {
    if (!config[key]) {
      throw new Error(`generic-selector adapter config is missing "${key}"`);
    }
  }

  return {
    name: "generic-selector",
    async streamReply(
      messages: ChatMessage[],
      onDelta: (text: string) => void,
      signal?: AbortSignal
    ): Promise<void> {
      let playwright: typeof import("playwright");
      try {
        playwright = await import("playwright");
      } catch {
        throw new Error(
          "Playwright is not installed. Run: npm i playwright && npx playwright install chromium"
        );
      }

      const prompt = lastUserPrompt(messages);
      const firstReplyTimeoutMs = config.firstReplyTimeoutMs ?? 30_000;
      const settleMs = config.settleMs ?? 2_500;

      const browser = await playwright.chromium.launch({ headless: config.headless ?? true });
      try {
        const page = await browser.newPage();
        await page.goto(config.targetUrl, { waitUntil: "domcontentloaded" });
        await page.fill(config.inputSelector, prompt);
        await page.click(config.submitSelector);

        // Stream growth of the last reply element's text; finish when it
        // settles or the abort signal fires.
        let emitted = "";
        let lastGrowth = Date.now();
        const deadline = Date.now() + firstReplyTimeoutMs;
        for (;;) {
          if (signal?.aborted) return;
          const text =
            (await page
              .locator(config.replySelector)
              .last()
              .textContent()
              .catch(() => null)) ?? "";
          if (text.length > emitted.length && text.startsWith(emitted)) {
            onDelta(text.slice(emitted.length));
            emitted = text;
            lastGrowth = Date.now();
          } else if (text && text !== emitted && !text.startsWith(emitted)) {
            // Reply element re-rendered from scratch; re-emit the full text.
            onDelta(text);
            emitted = text;
            lastGrowth = Date.now();
          }
          if (emitted && Date.now() - lastGrowth >= settleMs) break;
          if (!emitted && Date.now() > deadline) {
            throw new Error(
              `No reply text appeared in ${config.replySelector} within ${firstReplyTimeoutMs}ms`
            );
          }
          await page.waitForTimeout(250);
        }
      } finally {
        await browser.close();
      }
    },
  };
}
