import { describe, expect, it } from "vitest";
import { extractWorkersAIContent, isChainModelSupported, upstreamModelId } from "../src/routing";

describe("upstreamModelId", () => {
  it("parses openrouter ids", () => {
    expect(upstreamModelId("openrouter/meta-llama/llama-3:free")).toEqual({
      provider: "openrouter",
      apiModel: "meta-llama/llama-3:free",
    });
  });

  it("rejects bare names", () => {
    expect(upstreamModelId("free")).toBeNull();
  });
});

describe("extractWorkersAIContent", () => {
  it("parses plain string responses", () => {
    expect(extractWorkersAIContent("  pong  ")).toBe("pong");
  });

  it("parses legacy response field", () => {
    expect(extractWorkersAIContent({ response: "hello" })).toBe("hello");
  });

  it("parses OpenAI-shaped choices", () => {
    expect(
      extractWorkersAIContent({
        choices: [{ message: { content: "Pong." } }],
      }),
    ).toBe("Pong.");
  });

  it("parses nested result objects", () => {
    expect(
      extractWorkersAIContent({
        result: { choices: [{ message: { content: "nested" } }] },
      }),
    ).toBe("nested");
  });
});

describe("isChainModelSupported", () => {
  it("skips browser-only providers", () => {
    expect(isChainModelSupported("chatgpt/gpt-5", { OPENROUTER_API_KEY: "k" })).toBe(false);
    expect(isChainModelSupported("gemini/gemini-exp-1206", { OPENROUTER_API_KEY: "k" })).toBe(false);
  });

  it("allows openrouter when key present", () => {
    expect(isChainModelSupported("openrouter/free", { OPENROUTER_API_KEY: "k" })).toBe(true);
    expect(isChainModelSupported("openrouter/free", {})).toBe(false);
  });
});
