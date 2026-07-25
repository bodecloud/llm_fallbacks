import { describe, expect, it, vi } from "vitest";
import { healthPathForBase, probeEndpoint } from "./health-probe";

describe("health-probe", () => {
  it("uses /health for worker URLs", () => {
    expect(healthPathForBase("https://proxy.workers.dev")).toBe(
      "https://proxy.workers.dev/health"
    );
  });

  it("uses /health/liveliness for Render hosts", () => {
    expect(healthPathForBase("https://app.onrender.com")).toBe(
      "https://app.onrender.com/health/liveliness"
    );
  });

  it("classifies fast 200 as ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await probeEndpoint("https://proxy.test", fetchFn);
    expect(result.state).toBe("ok");
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it("classifies slow 200 as slow", async () => {
    const fetchFn = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, status: 200 }), 2100);
        })
    );
    const result = await probeEndpoint("https://proxy.test", fetchFn);
    expect(result.state).toBe("slow");
  });

  it("classifies 401 as fail with authFailure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await probeEndpoint("https://proxy.test", fetchFn);
    expect(result.state).toBe("fail");
    expect(result.authFailure).toBe(true);
  });

  it("classifies network error as fail", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network"));
    const result = await probeEndpoint("https://proxy.test", fetchFn);
    expect(result.state).toBe("fail");
  });
});
