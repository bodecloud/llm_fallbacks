import type { TokenUsage } from "./routing-metadata";

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

/**
 * Map an OpenAI-compatible SSE response to murm-ui StreamEvents and capture
 * client TTFT/total plus an optional trailing usage chunk (R58/R59).
 */
export async function emitOpenAiSseAsStreamEvents(
  response: Response,
  onEvent: (event: import("murm-ui").StreamEvent) => void,
  startedAt = performance.now()
): Promise<StreamTimingResult> {
  let messageStarted = false;
  let currentMessageId = randomId();
  let currentTextBlockId: string | null = null;
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
      choices?: {
        delta?: { content?: string; reasoning_content?: string };
        finish_reason?: string | null;
      }[];
      usage?: unknown;
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }

    // Trailing usage chunk often has no choices (OpenAI stream_options).
    const parsedUsage = parseUsage(parsed.usage);
    if (parsedUsage) {
      usage = parsedUsage;
    }

    const choice = parsed.choices?.[0];
    if (!choice) return;

    if (!messageStarted) {
      onEvent({
        type: "message_start",
        message: { id: currentMessageId, role: "assistant", blocks: [] },
      });
      messageStarted = true;
    }

    const delta = choice.delta ?? {};
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
