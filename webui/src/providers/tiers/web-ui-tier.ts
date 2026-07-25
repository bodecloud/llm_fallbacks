/**
 * web_ui tier (R38): stream from a user-run companion runner that automates
 * free web chat UIs. The runner speaks OpenAI-shaped SSE at
 * /v1/chat/completions, so the browser client here is a thin fetch + SSE
 * bridge. Off by default; the public Pages demo never requires it.
 */
import type { StreamEvent } from "murm-ui";
import { emitOpenAiSseAsStreamEvents } from "../sse";

export class WebRunnerNotConfiguredError extends Error {
  constructor(runnerUrl: string, detail: string) {
    super(
      `Web runner at ${runnerUrl} has no adapter configured (${detail}). ` +
        "Set up runner/runner.config.json — see runner/README.md."
    );
    this.name = "WebRunnerNotConfiguredError";
  }
}

export class WebRunnerUnavailableError extends Error {
  constructor(runnerUrl: string, cause: string) {
    super(
      `Web runner at ${runnerUrl} is unreachable (${cause}). ` +
        "Check that the runner is started and the URL in Tiers settings is correct."
    );
    this.name = "WebRunnerUnavailableError";
  }
}

export function runnerChatUrl(runnerUrl: string): string {
  return `${runnerUrl.replace(/\/$/, "")}/v1/chat/completions`;
}

export async function streamFromWebRunner(options: {
  runnerUrl: string;
  model: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(runnerChatUrl(options.runnerUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: options.signal,
    });
  } catch (err) {
    if (options.signal.aborted) throw err;
    const cause = err instanceof Error ? err.message : String(err);
    throw new WebRunnerUnavailableError(options.runnerUrl, cause || "network/CORS error");
  }

  if (res.status === 501) {
    const bodyText = await res.text();
    throw new WebRunnerNotConfiguredError(options.runnerUrl, bodyText.slice(0, 160) || "HTTP 501");
  }
  if (!res.ok) {
    const bodyText = await res.text();
    throw new WebRunnerUnavailableError(
      options.runnerUrl,
      `HTTP ${res.status} — ${bodyText.slice(0, 160)}`
    );
  }

  await emitOpenAiSseAsStreamEvents(res, options.onEvent);
}
