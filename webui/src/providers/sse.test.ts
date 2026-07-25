import { describe, expect, it } from "vitest";
import type { StreamEvent } from "murm-ui";
import { emitOpenAiSseAsStreamEvents } from "./sse";

function sseResponse(chunks: string[]): Response {
  const body = chunks.map((c) => `data: ${c}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function collectDeltas(events: StreamEvent[]): string {
  return events
    .filter((e): e is Extract<StreamEvent, { type: "text_delta" }> => e.type === "text_delta")
    .map((e) => e.delta)
    .join("");
}

describe("emitOpenAiSseAsStreamEvents", () => {
  it("captures usage from a trailing usage chunk (R58)", async () => {
    const events: StreamEvent[] = [];
    const result = await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }),
      ]),
      (e) => events.push(e),
      performance.now() - 50
    );

    expect(collectDeltas(events)).toBe("hi");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 3,
      totalTokens: 13,
    });
    expect(result.ttftMs).toBeGreaterThanOrEqual(0);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("leaves usage undefined when the stream has no usage chunk (R59)", async () => {
    const result = await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "ok" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      () => {},
      performance.now()
    );
    expect(result.usage).toBeUndefined();
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("sets TTFT on first content delta, not message_start alone", async () => {
    const startedAt = performance.now() - 100;
    const result = await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: {} }] }),
        JSON.stringify({ choices: [{ delta: { content: "x" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      () => {},
      startedAt
    );
    expect(result.ttftMs).toBeGreaterThanOrEqual(90);
  });

  it("ignores malformed usage without dropping latency", async () => {
    const result = await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "a" } }] }),
        JSON.stringify({ usage: { prompt_tokens: "nope" } }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      () => {},
      performance.now()
    );
    expect(result.usage).toBeUndefined();
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });
});
