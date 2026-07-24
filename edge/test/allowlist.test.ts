import { describe, expect, it } from "vitest";
import { allowedModelSet, isModelAllowed } from "../src/allowlist";
import type { Env } from "../src/types";

function env(partial: Partial<Env> = {}): Env {
  return {
    AI: {} as Ai,
    PROXY_GUEST_TOKEN: "test",
    ALLOWED_ORIGINS: "https://example.com",
    MODEL_CHAIN: "openrouter/free",
    ALLOWED_MODELS: "openrouter/free,groq/llama-3.1-8b-instant",
    MAX_TOKENS_CAP: "1024",
    ...partial,
  };
}

describe("isModelAllowed", () => {
  it("allows free alias", () => {
    expect(isModelAllowed("free", env())).toBe(true);
    expect(isModelAllowed(undefined, env())).toBe(true);
  });

  it("allows models in ALLOWED_MODELS", () => {
    expect(isModelAllowed("groq/llama-3.1-8b-instant", env())).toBe(true);
  });

  it("allows MODEL_CHAIN entries", () => {
    expect(isModelAllowed("openrouter/free", env({ ALLOWED_MODELS: "" }))).toBe(true);
  });

  it("rejects unknown explicit models", () => {
    expect(isModelAllowed("anthropic/claude-3", env())).toBe(false);
  });

  it("normalizes pipe-prefixed client ids before checking", () => {
    expect(isModelAllowed("openrouter|openrouter/free", env())).toBe(true);
  });
});

describe("allowedModelSet", () => {
  it("always includes free", () => {
    expect(allowedModelSet(env({ ALLOWED_MODELS: "" })).has("free")).toBe(true);
  });
});
