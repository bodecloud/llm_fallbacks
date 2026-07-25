import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, StreamEvent } from "murm-ui";
import type { AppConfig } from "../config";

vi.mock("../turnstile-session", () => ({
  ensureTurnstileToken: async () => "",
}));
vi.mock("../plugins/status-strip", () => ({
  showRateLimitBanner: () => {},
}));
vi.mock("../analytics", () => ({
  trackChatCompletionSuccess: () => {},
}));

import { FailoverProvider } from "./FailoverProvider";
import { getLastCompletionMeta } from "./routing-metadata";

const config: AppConfig = {
  endpoints: ["https://proxy.test"],
  guestToken: "guest",
  defaultModel: "free",
  catalogUrl: "",
  providerUrlsUrl: "",
  maxTokens: 256,
};

const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANS";

function request(): ChatRequest {
  return {
    messages: [{ id: "1", role: "user", blocks: [{ type: "text", text: "hi" }] }],
    // Pin the model so resolveModel does not consult session state.
    options: { model: "free" },
    signal: new AbortController().signal,
  };
}

function imageRequest(model: string): ChatRequest {
  return {
    messages: [
      {
        id: "1",
        role: "user",
        blocks: [
          { type: "text", text: "what is this" },
          { type: "file", mimeType: "image/png", name: "x.png", data: PNG_DATA_URL },
        ],
      },
    ],
    options: { model },
    signal: new AbortController().signal,
  };
}

function sseResponse(chunks: string[], init?: ResponseInit): Response {
  const body = chunks.map((c) => `data: ${c}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, ...init });
}

function collectDeltas(events: StreamEvent[]): string {
  return events
    .filter((e): e is Extract<StreamEvent, { type: "text_delta" }> => e.type === "text_delta")
    .map((e) => e.delta)
    .join("");
}

describe("FailoverProvider tier routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("zero-config (no keys) skips quality_api and is served by proxy_failover", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "hello" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] }),
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    const events: StreamEvent[] = [];
    await provider.streamChat(request(), (e) => events.push(e));

    expect(collectDeltas(events)).toBe("hello");
    expect(provider.getLastRoute()).toMatch(/^proxy\//);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces attempted tiers when every enabled tier fails (R40)", async () => {
    const fetchMock = vi.fn(async () => new Response("upstream boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    await expect(provider.streamChat(request(), () => {})).rejects.toMatchObject({
      message: expect.stringContaining("proxy_failover"),
    });
  });

  it("searxng discovery suggests links then chain falls through to proxy (R39/R43)", async () => {
    const { STORAGE_KEYS, saveJson } = await import("../storage-keys");
    saveJson(STORAGE_KEYS.providerTiers, {
      tiers: [
        { id: "quality_api", enabled: true },
        { id: "web_ui", enabled: false },
        { id: "searxng_discovery", enabled: true },
        { id: "proxy_failover", enabled: true },
      ],
      webRunnerUrl: "",
      searxngUrl: "http://searx.test",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("http://searx.test")) {
        return new Response(
          JSON.stringify({
            results: [
              { url: "https://chat.example.com", title: "Example AI chat", content: "free chat" },
            ],
          }),
          { status: 200 }
        );
      }
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "proxy answer" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] }),
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    const events: StreamEvent[] = [];
    await provider.streamChat(request(), (e) => events.push(e));

    expect(collectDeltas(events)).toBe("proxy answer");
    expect(provider.getLastRoute()).toMatch(/^proxy\//);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("http://searx.test/search"))).toBe(true);
  });

  it("blocks an image attachment on a non-vision model (R29)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    provider.setCatalog([{ id: "text/model", supports_vision: false }], {});

    await expect(
      provider.streamChat(imageRequest("text/model"), () => {})
    ).rejects.toMatchObject({ kind: "vision_unsupported" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("attaches a RouteTrace with skip + success hops on zero-config chat (R61)", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "hi" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] }),
        JSON.stringify({ usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }),
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    await provider.streamChat(request(), () => {});

    const meta = getLastCompletionMeta();
    expect(meta?.trace?.length).toBeGreaterThanOrEqual(2);
    expect(meta?.trace?.[0]).toMatchObject({ tier: "quality_api", outcome: "skip" });
    expect(meta?.trace?.some((h) => h.tier === "proxy_failover" && h.outcome === "success")).toBe(
      true
    );
    expect(meta?.usage).toEqual({
      promptTokens: 2,
      completionTokens: 1,
      totalTokens: 3,
    });
    expect(meta?.totalMs).toBeGreaterThanOrEqual(0);
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.stream_options).toEqual({ include_usage: true });
  });

  it("records an error hop then success when the first proxy endpoint fails", async () => {
    const dual: AppConfig = {
      ...config,
      endpoints: ["https://primary-fail.test", "https://secondary-ok.test"],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("primary-fail")) {
        return new Response("upstream unavailable", { status: 503 });
      }
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "ok" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] }),
      ]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(dual);
    await provider.streamChat(request(), () => {});

    const proxyHops = (getLastCompletionMeta()?.trace ?? []).filter(
      (h) => h.tier === "proxy_failover"
    );
    expect(proxyHops.length).toBeGreaterThanOrEqual(2);
    expect(proxyHops[0].outcome).toBe("error");
    expect(proxyHops[0].errorClass).toBe("cold_start");
    expect(proxyHops[0].hopIndex).toBe(0);
    expect(proxyHops.at(-1)?.outcome).toBe("success");
    expect(proxyHops.at(-1)?.hopIndex).toBe(1);
  });

  it("sends an image_url part to the proxy for a vision model (R28)", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "a cat" } }] }),
        JSON.stringify({ choices: [{ finish_reason: "stop" }] }),
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new FailoverProvider(config);
    provider.setCatalog([{ id: "vision/model", supports_vision: true }], {});

    const events: StreamEvent[] = [];
    await provider.streamChat(imageRequest("vision/model"), (e) => events.push(e));

    expect(collectDeltas(events)).toBe("a cat");
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const userContent = sent.messages.at(-1).content;
    expect(Array.isArray(userContent)).toBe(true);
    expect(userContent).toContainEqual({
      type: "image_url",
      image_url: { url: PNG_DATA_URL },
    });
  });
});
