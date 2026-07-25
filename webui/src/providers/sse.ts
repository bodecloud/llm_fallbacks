import type { TokenUsage } from "./routing-metadata";

const REASONING_FIELDS = ["reasoning_content", "reasoning", "reasoning_text"];

/** Minimal SSE parser for OpenAI-compatible streaming responses. */
export async function parseSSE(
  response: Response,
  onMessage: (data: string) => boolean | undefined
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data && onMessage(data) === true) return;
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data) onMessage(data);
    }
  }
}

function randomId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function extractReasoning(delta: Record<string, unknown>): { text: string; encrypted: boolean } | null {
  if (
    delta.reasoning &&
    typeof delta.reasoning === "object" &&
    typeof (delta.reasoning as Record<string, unknown>).encrypted === "string"
  ) {
    return { text: "", encrypted: true };
  }
  if (typeof delta.reasoning_encrypted === "string") {
    return { text: "", encrypted: true };
  }
  for (const field of REASONING_FIELDS) {
    if (typeof delta[field] === "string" && (delta[field] as string).length > 0) {
      return { text: delta[field] as string, encrypted: false };
    }
  }
  return null;
}

export interface StreamTimingResult {
  usage?: TokenUsage;
  ttftMs?: number;
  totalMs?: number;
}

function parseUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  const promptTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : undefined;
  const completionTokens =
    typeof u.completion_tokens === "number" ? u.completion_tokens : undefined;
  const totalTokens = typeof u.total_tokens === "number" ? u.total_tokens : undefined;
  if (
    promptTokens === undefined &&
    completionTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }
  return { promptTokens, completionTokens, totalTokens };
}

interface Delta {
  content?: string;
  reasoning_content?: string;
  reasoning?: string;
  reasoning_text?: string;
  reasoning_encrypted?: string;
  tool_calls?: {
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

interface Choice {
  delta?: Delta;
  finish_reason?: string | null;
}

/**
 * Map an OpenAI-compatible SSE response to murm-ui StreamEvents and capture
 * client TTFT/total plus an optional trailing usage chunk.
 *
 * Adds reasoning_delta and tool_call_start/tool_call_delta events for Wave 5A.
 */
export async function emitOpenAiSseAsStreamEvents(
  response: Response,
  onEvent: (event: import("murm-ui").StreamEvent) => void,
  startedAt = performance.now()
): Promise<StreamTimingResult> {
  let messageStarted = false;
  let currentMessageId = randomId();
  let currentTextBlockId: string | null = null;
  let currentReasoningBlockId: string | null = null;
  const activeToolCalls = new Map<number, string>();
  let finishEmitted = false;
  let ttftMs: number | undefined;
  let usage: TokenUsage | undefined;

  const markFirstToken = (): void => {
    if (ttftMs === undefined) {
      ttftMs = Math.max(0, performance.now() - startedAt);
    }
  };

  await parseSSE(response, (data) => {
    if (data === "[DONE]") return true;

    let parsed: {
      choices?: Choice[];
      usage?: unknown;
      id?: string;
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    // Emit usage events from trailing usage chunks
    const parsedUsage = parseUsage(parsed.usage);
    if (parsedUsage) {
      usage = parsedUsage;
      onEvent({
        type: "usage",
        input: parsedUsage.promptTokens ?? 0,
        output: parsedUsage.completionTokens ?? 0,
        total: parsedUsage.totalTokens ?? (parsedUsage.promptTokens ?? 0) + (parsedUsage.completionTokens ?? 0),
      });
    }

    const choice = parsed.choices?.[0];
    if (!choice) return;

    const delta = choice.delta ?? {};

    // 1. Start message on first chunk
    if (!messageStarted) {
      currentMessageId = parsed.id || currentMessageId;
      onEvent({
        type: "message_start",
        message: { id: currentMessageId, role: "assistant", blocks: [] },
      });
      messageStarted = true;
    }

    // 2. Handle reasoning content (R44-R46)
    const reasoningData = extractReasoning(delta as unknown as Record<string, unknown>);
    if (reasoningData) {
      if (!currentReasoningBlockId) currentReasoningBlockId = randomId();
      currentTextBlockId = null;
      markFirstToken();
      onEvent({
        type: "reasoning_delta",
        messageId: currentMessageId,
        blockId: currentReasoningBlockId,
        delta: reasoningData.text,
        encrypted: reasoningData.encrypted,
      });
    }

    // 3. Handle text content
    if (delta.content) {
      markFirstToken();
      if (!currentTextBlockId) currentTextBlockId = randomId();
      onEvent({
        type: "text_delta",
        messageId: currentMessageId,
        blockId: currentTextBlockId,
        delta: delta.content,
      });
    }

    // 4. Handle tool calls (R47-R49)
    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index;
        if (tc.id) {
          currentTextBlockId = null;
          const blockId = randomId();
          activeToolCalls.set(index, blockId);
          onEvent({
            type: "tool_call_start",
            messageId: currentMessageId,
            block: {
              id: blockId,
              type: "tool_call",
              toolCallId: tc.id,
              name: tc.function?.name || "",
              argsText: tc.function?.arguments || "",
              status: "streaming",
            },
          });
        } else if (activeToolCalls.has(index)) {
          onEvent({
            type: "tool_call_delta",
            messageId: currentMessageId,
            blockId: activeToolCalls.get(index)!,
            name: tc.function?.name,
            argsDelta: tc.function?.arguments || "",
          });
        }
      }
    }

    // 5. Handle finish reason
    if (choice.finish_reason && !finishEmitted) {
      const reasonMap: Record<string, "stop" | "length" | "tool_use"> = {
        stop: "stop",
        length: "length",
        tool_calls: "tool_use",
      };
      onEvent({
        type: "finish",
        reason: reasonMap[choice.finish_reason] || "stop",
      });
      finishEmitted = true;
    }
  });

  if (!finishEmitted) {
    onEvent({ type: "finish", reason: "stop" });
  }

  return {
    usage,
    ttftMs,
    totalMs: Math.max(0, performance.now() - startedAt),
  };
}

export function emitTextAsStreamEvents(
  text: string,
  onEvent: (event: import("murm-ui").StreamEvent) => void
): void {
  const messageId = randomId();
  const blockId = randomId();
  onEvent({
    type: "message_start",
    message: { id: messageId, role: "assistant", blocks: [] },
  });
  onEvent({ type: "text_delta", messageId, blockId, delta: text });
  onEvent({ type: "finish", reason: "stop" });
}
