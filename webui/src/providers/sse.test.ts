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

function collectReasoning(events: StreamEvent[]): string[] {
  return events
    .filter((e): e is Extract<StreamEvent, { type: "reasoning_delta" }> => e.type === "reasoning_delta")
    .map((e) => e.delta);
}

function collectToolStarts(events: StreamEvent[]): Extract<StreamEvent, { type: "tool_call_start" }>[] {
  return events.filter(
    (e): e is Extract<StreamEvent, { type: "tool_call_start" }> => e.type === "tool_call_start"
  );
}

function collectToolDeltas(events: StreamEvent[]): Extract<StreamEvent, { type: "tool_call_delta" }>[] {
  return events.filter(
    (e): e is Extract<StreamEvent, { type: "tool_call_delta" }> => e.type === "tool_call_delta"
  );
}

describe("emitOpenAiSseAsStreamEvents", () => {
  it("captures usage from a trailing usage chunk", async () => {
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

  it("leaves usage undefined when the stream has no usage chunk", async () => {
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

  // ── Wave 5A: reasoning ────────────────────────────────────────

  it("emits reasoning_delta for reasoning_content field (R44)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Final answer" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    expect(collectDeltas(events)).toBe("Final answer");
  });

  it("emits reasoning_delta events during reasoning stream (R44)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: "Let me think" } }] }),
        JSON.stringify({ choices: [{ delta: { reasoning_content: " step by step" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "Here's my answer" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const reasoning = collectReasoning(events);
    expect(reasoning.join("")).toBe("Let me think step by step");
    expect(collectDeltas(events)).toBe("Here's my answer");
  });

  it("emits reasoning_delta for 'reasoning' field (OpenRouter format)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning: "Working..." } }] }),
        JSON.stringify({ choices: [{ delta: { content: "Done" }, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    expect(collectReasoning(events).join("")).toBe("Working...");
  });

  it("emits reasoning_delta for 'reasoning_text' field", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_text: "Thinking" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "A" }, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    expect(collectReasoning(events).join("")).toBe("Thinking");
  });

  it("shows no reasoning UI when provider omits reasoning channel (R45)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Just text" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const reasoning = collectReasoning(events);
    expect(reasoning).toHaveLength(0);
  });

  it("marks first token earliest from reasoning or text (R46)", async () => {
    const startedAt = performance.now() - 200;
    const events: StreamEvent[] = [];
    const result = await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: "hmm" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "answer" }, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      startedAt
    );
    expect(result.ttftMs).toBeGreaterThanOrEqual(190);
    expect(collectReasoning(events).join("")).toBe("hmm");
  });

  it("detects encrypted reasoning signal without emitting text", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({
          choices: [{ delta: { reasoning: { encrypted: "base64data==" } } }],
        }),
        JSON.stringify({ choices: [{ delta: { content: "Ans" }, finish_reason: "stop" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const reasoning = collectReasoning(events);
    expect(reasoning.length).toBeGreaterThanOrEqual(1);
    expect(reasoning[0]).toBe("");
  });

  // ── Wave 5A: tool calls ───────────────────────────────────────

  it("emits tool_call_start for new tool call (R47)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: "call_1", function: { name: "get_weather", arguments: "" } }],
              },
            },
          ],
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '{"city":"London"}' } }],
              },
            },
          ],
        }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const starts = collectToolStarts(events);
    expect(starts).toHaveLength(1);
    expect(starts[0].block.toolCallId).toBe("call_1");
    expect(starts[0].block.name).toBe("get_weather");
    expect(starts[0].block.status).toBe("streaming");
  });

  it("emits tool_call_delta for streaming arguments (R47)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: "call_1", function: { name: "search", arguments: "" } }],
              },
            },
          ],
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: "query" } }],
              },
            },
          ],
        }),
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: "=hello" } }],
              },
            },
          ],
        }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const deltas = collectToolDeltas(events);
    expect(deltas).toHaveLength(2);
    expect(deltas[0].argsDelta).toBe("query");
    expect(deltas[1].argsDelta).toBe("=hello");
  });

  it("emits finish with tool_use reason when finish_reason is tool_calls (R48/R49)", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, id: "call_1", function: { name: "f", arguments: "{}" } }],
              },
            },
          ],
        }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }),
      ]),
      (e) => events.push(e),
      performance.now()
    );
    const finish = events.find((e): e is Extract<StreamEvent, { type: "finish" }> => e.type === "finish");
    expect(finish).toBeDefined();
    expect(finish!.reason).toBe("tool_use");
  });

  it("emits usage StreamEvent from usage chunk", async () => {
    const events: StreamEvent[] = [];
    await emitOpenAiSseAsStreamEvents(
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        JSON.stringify({ usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }),
      ]),
      (e) => events.push(e),
      performance.now() - 50
    );
    const usageEvents = events.filter((e): e is Extract<StreamEvent, { type: "usage" }> => e.type === "usage");
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0].input).toBe(5);
    expect(usageEvents[0].output).toBe(2);
    expect(usageEvents[0].total).toBe(7);
  });
});
