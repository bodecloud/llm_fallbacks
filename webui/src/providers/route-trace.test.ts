import { describe, expect, it } from "vitest";
import { RouteTrace, classifyHopError } from "./route-trace";
import { ChatRouteError } from "./errors";

describe("RouteTrace", () => {
  it("assigns sequential hopIndex values", () => {
    const trace = new RouteTrace();
    const a = trace.record({ tier: "quality_api", outcome: "skip", reason: "no key" });
    const b = trace.record({
      tier: "proxy_failover",
      outcome: "success",
      endpoint: "https://proxy.test",
    });
    expect(a.hopIndex).toBe(0);
    expect(b.hopIndex).toBe(1);
    expect(trace.snapshot()).toHaveLength(2);
  });

  it("honors an explicit hopIndex without colliding", () => {
    const trace = new RouteTrace();
    trace.record({ tier: "proxy_failover", outcome: "error", hopIndex: 0 });
    const next = trace.record({ tier: "proxy_failover", outcome: "success" });
    expect(next.hopIndex).toBe(1);
  });

  it("hasTier reports whether any hop for a tier exists", () => {
    const trace = new RouteTrace();
    expect(trace.hasTier("proxy_failover")).toBe(false);
    trace.record({ tier: "proxy_failover", outcome: "error", endpoint: "https://a.test" });
    expect(trace.hasTier("proxy_failover")).toBe(true);
    expect(trace.hasTier("quality_api")).toBe(false);
  });

  it("snapshot returns a copy", () => {
    const trace = new RouteTrace();
    trace.record({ tier: "quality_api", outcome: "success" });
    const snap = trace.snapshot();
    snap[0].outcome = "error";
    expect(trace.snapshot()[0].outcome).toBe("success");
  });
});

describe("classifyHopError", () => {
  it("uses ChatRouteError.kind when present", () => {
    expect(classifyHopError(new ChatRouteError("cold_start", "waking"))).toBe("cold_start");
  });

  it("falls back to message heuristics", () => {
    expect(classifyHopError(new Error("HTTP 503 upstream"))).toBe("cold_start");
    expect(classifyHopError(new Error("429 rate limit"))).toBe("rate_limit");
  });
});
