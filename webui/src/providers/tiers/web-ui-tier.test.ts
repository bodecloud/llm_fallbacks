import { describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "murm-ui";
import {
  WebRunnerNotConfiguredError,
  WebRunnerUnavailableError,
  runnerChatUrl,
  streamFromWebRunner,
} from "./web-ui-tier";

const RUNNER = "http://127.0.0.1:8815";

function sseResponse(lines: string[]): Response {
  const body = lines.map((l) => `data: ${l}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function baseOptions(onEvent: (e: StreamEvent) => void, fetchImpl: typeof fetch) {
  return {
    runnerUrl: RUNNER,
    model: "web-ui",
    messages: [{ role: "user", content: "hi" }],
    signal: new AbortController().signal,
    onEvent,
    fetchImpl,
  };
}

describe("streamFromWebRunner", () => {
  it("streams OpenAI-shaped SSE deltas from the runner", async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "runner " } }] }),
        JSON.stringify({ choices: [{ delta: { content: "reply" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ])
    );
    const events: StreamEvent[] = [];
    await streamFromWebRunner(baseOptions((e) => events.push(e), fetchImpl));

    const text = events
      .filter((e): e is Extract<StreamEvent, { type: "text_delta" }> => e.type === "text_delta")
      .map((e) => e.delta)
      .join("");
    expect(text).toBe("runner reply");
    expect(fetchImpl).toHaveBeenCalledWith(runnerChatUrl(RUNNER), expect.anything());
  });

  it("maps HTTP 501 to a not-configured diagnostic", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "no adapter" } }), { status: 501 })
    );
    await expect(
      streamFromWebRunner(baseOptions(() => {}, fetchImpl))
    ).rejects.toBeInstanceOf(WebRunnerNotConfiguredError);
  });

  it("maps network failure to an unreachable diagnostic", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      streamFromWebRunner(baseOptions(() => {}, fetchImpl))
    ).rejects.toBeInstanceOf(WebRunnerUnavailableError);
  });
});
