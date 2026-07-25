import { describe, expect, it } from "vitest";
import {
  FREE_ALIAS_NOTE,
  formatRoutingChip,
  formatUsageBadge,
  type CompletionMeta,
} from "./routing-metadata";

describe("formatUsageBadge", () => {
  it("shows tokens and latency when usage is present (R58)", () => {
    const meta: CompletionMeta = {
      endpoint: "https://proxy.test",
      fallbackCount: 0,
      usage: { promptTokens: 10, completionTokens: 4 },
      ttftMs: 120,
      totalMs: 800,
    };
    expect(formatUsageBadge(meta)).toBe("10→4 tok · TTFT 120ms · 800ms");
  });

  it("shows latency only when usage is absent (R59)", () => {
    const meta: CompletionMeta = {
      endpoint: "https://proxy.test",
      fallbackCount: 1,
      ttftMs: 50,
      totalMs: 400,
    };
    expect(formatUsageBadge(meta)).toBe("TTFT 50ms · 400ms");
  });

  it("returns empty string when nothing is available", () => {
    expect(formatUsageBadge({ endpoint: "x", fallbackCount: 0 })).toBe("");
  });
});

describe("formatRoutingChip", () => {
  it("keeps the Wave 1 summary shape", () => {
    expect(
      formatRoutingChip({
        endpoint: "https://demo.proxy.test/v1",
        modelHeader: "openrouter/free",
        fallbackCount: 1,
      })
    ).toBe("demo.proxy.test · openrouter/free · 1 fallback");
  });
});

describe("FREE_ALIAS_NOTE", () => {
  it("mentions both free and openrouter/free (R62)", () => {
    expect(FREE_ALIAS_NOTE).toMatch(/`free`/);
    expect(FREE_ALIAS_NOTE).toMatch(/`openrouter\/free`/);
  });
});
