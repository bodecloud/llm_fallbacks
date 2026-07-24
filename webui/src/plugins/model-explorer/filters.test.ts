import { describe, expect, it } from "vitest";
import { applyFilter, sortRows } from "./filters";

const sample = [
  { id: "a/x", provider: "a", quality_score: 10, mode: "chat" },
  { id: "b/y", provider: "b", quality_score: 50, mode: "chat" },
  { id: "c/z", provider: "a", quality_score: 30, mode: "" },
];

describe("model-explorer filters", () => {
  it("filters by exact value", () => {
    const out = applyFilter(sample, {
      method: "value",
      column: "provider",
      value: "a",
      topN: 10,
    });
    expect(out).toHaveLength(2);
  });

  it("filters by regex", () => {
    const out = applyFilter(sample, {
      method: "regex",
      column: "id",
      value: "^b/",
      topN: 10,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b/y");
  });

  it("sorts descending by column", () => {
    const out = sortRows(sample, "quality_score", "desc");
    expect(out[0].quality_score).toBe(50);
  });
});
