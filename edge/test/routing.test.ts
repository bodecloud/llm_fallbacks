import { describe, expect, it } from "vitest";

/** Mirror routing helpers for unit tests without Worker runtime. */
function upstreamModelId(litellmId: string): { provider: string; apiModel: string } | null {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
}

function extractWorkersAIContent(result: unknown): string | null {
  if (typeof result === "string") {
    return result.trim() || null;
  }
  if (!result || typeof result !== "object") {
    return null;
  }
  const obj = result as {
    response?: string;
    text?: string;
    result?: unknown;
    choices?: { message?: { content?: string }; delta?: { content?: string } }[];
  };
  const choiceContent =
    obj.choices?.[0]?.message?.content ?? obj.choices?.[0]?.delta?.content ?? "";
  const legacy = obj.response ?? obj.text ?? "";
  const nested =
    typeof obj.result === "string"
      ? obj.result
      : extractWorkersAIContent(obj.result) ?? "";
  const content = (choiceContent || legacy || nested).trim();
  return content || null;
}

function isSupportedChainModel(
  modelId: string,
  keys: { openrouter?: string; groq?: string },
): boolean {
  const parsed = upstreamModelId(modelId);
  if (!parsed) return false;
  if (parsed.provider === "openrouter") return Boolean(keys.openrouter);
  if (parsed.provider === "groq") return Boolean(keys.groq);
  return false;
}

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

describe("isSupportedChainModel", () => {
  it("skips browser-only providers", () => {
    expect(isSupportedChainModel("chatgpt/gpt-5", { openrouter: "k" })).toBe(false);
    expect(isSupportedChainModel("gemini/gemini-exp-1206", { openrouter: "k" })).toBe(false);
  });

  it("allows openrouter when key present", () => {
    expect(isSupportedChainModel("openrouter/free", { openrouter: "k" })).toBe(true);
    expect(isSupportedChainModel("openrouter/free", {})).toBe(false);
  });
});
