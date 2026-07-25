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
