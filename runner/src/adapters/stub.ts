import type { ChatMessage, RunnerAdapter } from "./types.ts";
import { lastUserPrompt } from "./types.ts";

/**
 * Smoke-test adapter: streams a fixed reply in small chunks. Useful for
 * verifying the tier wiring end to end before configuring a real browser
 * adapter.
 */
export function createStubAdapter(reply?: string): RunnerAdapter {
  return {
    name: "stub",
    async streamReply(messages: ChatMessage[], onDelta: (text: string) => void): Promise<void> {
      const text = reply ?? `Stub runner echo: ${lastUserPrompt(messages)}`;
      const words = text.split(/(\s+)/);
      for (const word of words) {
        if (word) onDelta(word);
      }
    },
  };
}
