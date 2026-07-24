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

export function emitOpenAiSseAsStreamEvents(
  response: Response,
  onEvent: (event: import("murm-ui").StreamEvent) => void
): Promise<void> {
  let messageStarted = false;
  let currentMessageId = randomId();
  let currentTextBlockId: string | null = null;
  let finishEmitted = false;

  return parseSSE(response, (data) => {
    if (data === "[DONE]") return true;

    let parsed: {
      choices?: {
        delta?: { content?: string };
        finish_reason?: string | null;
      }[];
    };
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
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
