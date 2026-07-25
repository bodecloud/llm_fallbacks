import { describe, expect, it } from "vitest";
import {
  METERED_COMPARE_BANNER,
  bothColumnsMetered,
  columnIsMetered,
  defaultCompareState,
} from "./column-provider";
import { STORAGE_KEYS, saveJson } from "../../storage-keys";
import type { CatalogEntry } from "../../providers/browser-router";

const catalog: CatalogEntry[] = [
  { id: "groq/llama", provider: "groq", supports_vision: false },
  { id: "openrouter/free", provider: "openrouter" },
];

describe("compare column helpers", () => {
  it("defaults to inactive with free vs openrouter/free", () => {
    const state = defaultCompareState("free");
    expect(state.active).toBe(false);
    expect(state.columns.a.model).toBe("free");
    expect(state.columns.b.model).toBe("openrouter/free");
  });

  it("treats free as metered (public proxy)", () => {
    expect(columnIsMetered("free", catalog, {})).toBe(true);
  });

  it("treats a BYOK-backed model as not metered", () => {
    expect(columnIsMetered("groq/llama", catalog, { groq: "sk-test" })).toBe(false);
  });

  it("flags both-columns-metered for R34 banner", () => {
    localStorage.clear();
    saveJson(STORAGE_KEYS.apiKeys, {});
    const state = defaultCompareState();
    state.active = true;
    state.columns.a.model = "free";
    state.columns.b.model = "openrouter/free";
    expect(bothColumnsMetered(state, catalog, {})).toBe(true);
    expect(METERED_COMPARE_BANNER).toMatch(/two requests/i);
  });

  it("does not flag metered banner when one column is BYOK", () => {
    const state = defaultCompareState();
    state.active = true;
    state.columns.a.model = "free";
    state.columns.b.model = "groq/llama";
    expect(bothColumnsMetered(state, catalog, { groq: "sk-test" })).toBe(false);
  });
});
