import { describe, expect, it } from "vitest";
import {
  capabilityBadges,
  catalogSummaryLine,
  formatContextLength,
} from "./catalog-display";
import type { CatalogEntry } from "./providers/browser-router";

describe("catalog-display", () => {
  it("formats millions context", () => {
    expect(formatContextLength(1_050_000)).toBe("1.1M");
  });

  it("formats thousands context", () => {
    expect(formatContextLength(128_000)).toBe("128K");
  });

  it("returns dash for missing context", () => {
    expect(formatContextLength(0)).toBe("—");
  });

  it("builds capability badges", () => {
    const entry: CatalogEntry = {
      id: "test/model",
      supports_vision: true,
      supports_function_calling: true,
    };
    expect(capabilityBadges(entry)).toEqual(["vision", "tools"]);
  });

  it("builds summary line", () => {
    const entry: CatalogEntry = {
      id: "groq/llama",
      quality_score: 9.2,
      context_length: 128_000,
      supports_vision: true,
    };
    expect(catalogSummaryLine(entry)).toMatch(/score 9\.2/);
    expect(catalogSummaryLine(entry)).toMatch(/128K/);
    expect(catalogSummaryLine(entry)).toMatch(/vision/);
  });
});
