import { describe, expect, it } from "vitest";

/** Mirror routing helpers for unit tests without Worker runtime. */
function upstreamModelId(litellmId: string): { provider: string; apiModel: string } | null {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
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
