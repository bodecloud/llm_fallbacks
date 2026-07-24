import { describe, expect, it } from "vitest";
import { checkRateLimit, rateLimitConfig } from "../src/rate-limit";
import type { Env } from "../src/types";

class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

function requestWithIp(ip: string): Request {
  return new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip },
  });
}

function env(kv: MemoryKV, overrides: Partial<Env> = {}): Env {
  return {
    AI: {} as Ai,
    METRICS_KV: kv as unknown as KVNamespace,
    PROXY_GUEST_TOKEN: "test",
    ALLOWED_ORIGINS: "https://example.com",
    MODEL_CHAIN: "openrouter/free",
    ALLOWED_MODELS: "openrouter/free",
    MAX_TOKENS_CAP: "1024",
    RATE_LIMIT_PER_MINUTE: "2",
    RATE_LIMIT_PER_DAY: "10",
    RATE_LIMIT_WINDOW_SECONDS: "60",
    ...overrides,
  };
}

describe("rateLimitConfig", () => {
  it("falls back to defaults for invalid values", () => {
    const base = env(new MemoryKV());
    expect(
      rateLimitConfig({
        ...base,
        RATE_LIMIT_PER_MINUTE: "nope",
        RATE_LIMIT_PER_DAY: "nope",
        RATE_LIMIT_WINDOW_SECONDS: "nope",
      }),
    ).toEqual({
      perMinute: 30,
      perDay: 300,
      windowSeconds: 60,
    });
  });
});

describe("checkRateLimit", () => {
  it("allows requests under the per-minute cap", async () => {
    const kv = new MemoryKV();
    const e = env(kv);
    expect(await checkRateLimit(requestWithIp("1.2.3.4"), e)).toEqual({ allowed: true });
    expect(await checkRateLimit(requestWithIp("1.2.3.4"), e)).toEqual({ allowed: true });
  });

  it("blocks when per-minute cap exceeded", async () => {
    const kv = new MemoryKV();
    const e = env(kv);
    await checkRateLimit(requestWithIp("9.9.9.9"), e);
    await checkRateLimit(requestWithIp("9.9.9.9"), e);
    const third = await checkRateLimit(requestWithIp("9.9.9.9"), e);
    expect(third.allowed).toBe(false);
    if (!third.allowed) {
      expect(third.scope).toBe("minute");
    }
  });

  it("allows all when KV is unavailable", async () => {
    const e = env(new MemoryKV());
    delete e.METRICS_KV;
    expect(await checkRateLimit(requestWithIp("1.1.1.1"), e)).toEqual({ allowed: true });
  });
});
