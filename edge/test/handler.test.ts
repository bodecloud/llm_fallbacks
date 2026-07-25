import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";

class MemoryKV {
  private store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, value);
  }
}

function baseEnv(kv: MemoryKV, overrides: Partial<Env> = {}): Env {
  return {
    AI: {} as Ai,
    METRICS_KV: kv as unknown as KVNamespace,
    PROXY_GUEST_TOKEN: "guest-token",
    ALLOWED_ORIGINS: "https://bodecloud.github.io",
    MODEL_CHAIN: "openrouter/free",
    ALLOWED_MODELS: "openrouter/free",
    MAX_TOKENS_CAP: "1024",
    RATE_LIMIT_PER_MINUTE: "30",
    RATE_LIMIT_PER_DAY: "300",
    OPENROUTER_API_KEY: "or-key",
    ...overrides,
  };
}

function chatRequest(body: Record<string, unknown>, token = "guest-token"): Request {
  return new Request("https://proxy.example/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "https://bodecloud.github.io",
      "CF-Connecting-IP": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

describe("Worker fetch handler", () => {
  it("rejects missing guest token", async () => {
    const res = await worker.fetch(chatRequest({ model: "free", messages: [{ role: "user", content: "hi" }] }, ""), baseEnv(new MemoryKV()));
    expect(res.status).toBe(401);
  });

  it("rejects non-allowlisted models", async () => {
    const res = await worker.fetch(
      chatRequest({
        model: "anthropic/claude-3-opus",
        messages: [{ role: "user", content: "hi" }],
      }),
      baseEnv(new MemoryKV()),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toMatch(/not allowlisted/i);
  });

  it("OPTIONS exposes routing headers in CORS", async () => {
    const res = await worker.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "OPTIONS",
        headers: { Origin: "https://bodecloud.github.io" },
      }),
      baseEnv(new MemoryKV()),
    );
    expect(res.status).toBe(204);
    const exposed = res.headers.get("Access-Control-Expose-Headers") ?? "";
    expect(exposed).toMatch(/x-llm-fallbacks-endpoint/i);
    expect(exposed).toMatch(/x-litellm-model-name/i);
  });

  it("returns 429 when per-minute rate limit exceeded", async () => {
    const kv = new MemoryKV();
    const env = baseEnv(kv, { RATE_LIMIT_PER_MINUTE: "1", RATE_LIMIT_PER_DAY: "100" });
    const body = { model: "free", messages: [{ role: "user", content: "hi" }] };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 })),
    );
    try {
      await worker.fetch(chatRequest(body), env);
      const second = await worker.fetch(chatRequest(body), env);
      expect(second.status).toBe(429);
      expect(second.headers.get("Retry-After")).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
