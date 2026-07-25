export interface ChatMessage {
  role: string;
  content: string;
}

/**
 * A runner adapter turns a chat transcript into a streamed plain-text reply.
 * Adapters are user-configured — the runner ships with a stub for smoke
 * testing and a generic selector-driven browser adapter (BYO selectors).
 */
export interface RunnerAdapter {
  name: string;
  streamReply(
    messages: ChatMessage[],
    onDelta: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

export function lastUserPrompt(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}
