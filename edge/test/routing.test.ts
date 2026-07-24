import { describe, expect, it } from "vitest";
import {
  extractWorkersAIContent,
  isChainModelSupported,
  normalizeClientModel,
  upstreamModelId,
} from "../src/routing";

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

describe("normalizeClientModel", () => {
  it("maps empty and free to free", () => {
    expect(normalizeClientModel()).toBe("free");
    expect(normalizeClientModel("free")).toBe("free");
  });

  it("strips provider prefix before pipe", () => {
    expect(normalizeClientModel("openrouter|meta-llama/llama-3:free")).toBe("meta-llama/llama-3:free");
  });

  it("passes through bare model ids", () => {
    expect(normalizeClientModel("openrouter/free")).toBe("openrouter/free");
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
