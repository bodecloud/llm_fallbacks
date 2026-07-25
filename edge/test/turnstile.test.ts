import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import { checkTurnstile } from "../src/turnstile";

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
    ...overrides,
  };
}

describe("turnstile", () => {
  it("skips verification when TURNSTILE_SECRET is unset", async () => {
    const req = new Request("https://proxy.example/v1/chat/completions", {
      headers: { "CF-Connecting-IP": "203.0.113.1" },
    });
    const result = await checkTurnstile(req, baseEnv(new MemoryKV()), "https://bodecloud.github.io", [
      "https://bodecloud.github.io",
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects chat when secret set and token missing", async () => {
    const req = new Request("https://proxy.example/v1/chat/completions", {
      headers: { "CF-Connecting-IP": "203.0.113.2", Origin: "https://bodecloud.github.io" },
    });
    const result = await checkTurnstile(
      req,
      baseEnv(new MemoryKV(), { TURNSTILE_SECRET: "test-secret" }),
      "https://bodecloud.github.io",
      ["https://bodecloud.github.io"]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("allows chat when KV pass exists", async () => {
    const kv = new MemoryKV();
    await kv.put("ts:pass:203.0.113.3", "1");
    const req = new Request("https://proxy.example/v1/chat/completions", {
      headers: { "CF-Connecting-IP": "203.0.113.3" },
    });
    const result = await checkTurnstile(
      req,
      baseEnv(kv, { TURNSTILE_SECRET: "test-secret" }),
      "https://bodecloud.github.io",
      ["https://bodecloud.github.io"]
    );
    expect(result.ok).toBe(true);
  });

  it("verifies token via siteverify and stores KV pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const kv = new MemoryKV();
    const req = new Request("https://proxy.example/v1/chat/completions", {
      headers: {
        "CF-Connecting-IP": "203.0.113.4",
        "CF-Turnstile-Response": "valid-token",
      },
    });
    const result = await checkTurnstile(
      req,
      baseEnv(kv, { TURNSTILE_SECRET: "test-secret" }),
      "https://bodecloud.github.io",
      ["https://bodecloud.github.io"]
    );
    expect(result.ok).toBe(true);
    expect(await kv.get("ts:pass:203.0.113.4")).toBe("1");

    vi.unstubAllGlobals();
  });

  it("chat handler returns 403 without turnstile when secret set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("siteverify")) {
          return new Response(JSON.stringify({ success: false }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 503 });
      })
    );

    const res = await worker.fetch(
      new Request("https://proxy.example/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer guest-token",
          "Content-Type": "application/json",
          Origin: "https://bodecloud.github.io",
          "CF-Connecting-IP": "203.0.113.5",
        },
        body: JSON.stringify({ model: "free", messages: [{ role: "user", content: "hi" }] }),
      }),
      baseEnv(new MemoryKV(), { TURNSTILE_SECRET: "test-secret", OPENROUTER_API_KEY: "or-key" })
    );
    expect(res.status).toBe(403);
    vi.unstubAllGlobals();
  });
});
