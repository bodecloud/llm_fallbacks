import { describe, expect, it } from "vitest";
import type { CompletionMeta } from "../../providers/routing-metadata";
import {
  accumulateSessionTotals,
  emptySessionTotals,
  formatSessionTotals,
} from "./totals";

function meta(partial: Partial<CompletionMeta>): CompletionMeta {
  return { endpoint: "https://proxy.test", fallbackCount: 0, ...partial };
}

describe("session usage totals", () => {
  it("sums tokens and wall time across replies with usage (R60)", () => {
    let totals = emptySessionTotals();
    totals = accumulateSessionTotals(
      totals,
      meta({ usage: { promptTokens: 10, completionTokens: 5 }, totalMs: 100 })
    );
    totals = accumulateSessionTotals(
      totals,
      meta({ usage: { promptTokens: 20, completionTokens: 8 }, totalMs: 200 })
    );
    expect(totals).toMatchObject({
      replies: 2,
      repliesWithUsage: 2,
      promptTokens: 30,
      completionTokens: 13,
      totalMs: 300,
    });
    expect(formatSessionTotals(totals)).toBe("Session: 2 replies · 30→13 tok · 300ms");
  });

  it("labels partial token sums when only some replies expose usage (R59)", () => {
    let totals = emptySessionTotals();
    totals = accumulateSessionTotals(
      totals,
      meta({ usage: { promptTokens: 10, completionTokens: 2 }, totalMs: 50 })
    );
    totals = accumulateSessionTotals(totals, meta({ totalMs: 80 }));
    expect(totals.repliesWithUsage).toBe(1);
    expect(formatSessionTotals(totals)).toContain("partial");
    expect(formatSessionTotals(totals)).toContain("130ms");
  });

  it("shows time-only when no reply exposes usage", () => {
    let totals = emptySessionTotals();
    totals = accumulateSessionTotals(totals, meta({ totalMs: 40 }));
    expect(formatSessionTotals(totals)).toBe("Session: 1 reply · 40ms");
  });

  it("resets to empty via emptySessionTotals", () => {
    expect(formatSessionTotals(emptySessionTotals())).toBe("Session: no replies yet");
  });
});
