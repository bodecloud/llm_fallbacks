import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, StreamEvent } from "murm-ui";
import { STORAGE_KEYS, saveJson } from "../../storage-keys";
import { defaultProviderTierSettings } from "./defaults";
import {
  TierOrchestrator,
  searxngTierUnavailable,
  webUiTierUnavailable,
} from "./orchestrator";
import { TierOrchestratorError, TierSkipError } from "./types";

const baseRequest: ChatRequest = {
  messages: [{ id: "1", role: "user", blocks: [{ type: "text", text: "hi" }] }],
  options: {},
  signal: new AbortController().signal,
};

describe("TierOrchestrator", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("runs enabled tiers in saved order (quality_api before proxy_failover)", async () => {
    saveJson(STORAGE_KEYS.providerTiers, defaultProviderTierSettings());
    const calls: string[] = [];
    const qualityApi = vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
      calls.push("quality_api");
      onEvent({ type: "text_delta", delta: "ok" });
    });
    const proxyFailover = vi.fn(async () => {
      calls.push("proxy_failover");
    });
    const orchestrator = new TierOrchestrator({
      qualityApi,
      webUi: vi.fn(),
      searxngDiscovery: vi.fn(),
      proxyFailover,
    });

    await orchestrator.streamChat(baseRequest, () => {});

    expect(qualityApi).toHaveBeenCalledOnce();
    expect(proxyFailover).not.toHaveBeenCalled();
    expect(calls).toEqual(["quality_api"]);
  });

  it("honors a reordered tier list (proxy_failover first)", async () => {
    saveJson(STORAGE_KEYS.providerTiers, {
      ...defaultProviderTierSettings(),
      tiers: [
        { id: "proxy_failover", enabled: true },
        { id: "quality_api", enabled: true },
        { id: "web_ui", enabled: false },
        { id: "searxng_discovery", enabled: false },
      ],
    });
    const qualityApi = vi.fn();
    const proxyFailover = vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
      onEvent({ type: "text_delta", delta: "proxy first" });
    });
    const orchestrator = new TierOrchestrator({
      qualityApi,
      webUi: vi.fn(),
      searxngDiscovery: vi.fn(),
      proxyFailover,
    });

    await orchestrator.streamChat(baseRequest, () => {});

    expect(proxyFailover).toHaveBeenCalledOnce();
    expect(qualityApi).not.toHaveBeenCalled();
  });

  it("skips disabled web_ui tier", async () => {
    saveJson(STORAGE_KEYS.providerTiers, defaultProviderTierSettings());
    const webUi = vi.fn(async () => {
      throw webUiTierUnavailable();
    });
    const qualityApi = vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
      onEvent({ type: "text_delta", delta: "ok" });
    });
    const orchestrator = new TierOrchestrator({
      qualityApi,
      webUi,
      searxngDiscovery: vi.fn(),
      proxyFailover: vi.fn(),
    });

    await orchestrator.streamChat(baseRequest, () => {});

    expect(webUi).not.toHaveBeenCalled();
  });

  it("falls through to proxy_failover when quality_api fails", async () => {
    saveJson(STORAGE_KEYS.providerTiers, {
      ...defaultProviderTierSettings(),
      tiers: [
        { id: "quality_api", enabled: true },
        { id: "web_ui", enabled: false },
        { id: "searxng_discovery", enabled: false },
        { id: "proxy_failover", enabled: true },
      ],
    });
    const qualityApi = vi.fn(async () => {
      throw new Error("api down");
    });
    const proxyFailover = vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
      onEvent({ type: "text_delta", delta: "proxy ok" });
    });
    const orchestrator = new TierOrchestrator({
      qualityApi,
      webUi: vi.fn(),
      searxngDiscovery: vi.fn(),
      proxyFailover,
    });

    await orchestrator.streamChat(baseRequest, () => {});

    expect(proxyFailover).toHaveBeenCalledOnce();
  });

  it("throws TierOrchestratorError with attempt list when all tiers fail", async () => {
    saveJson(STORAGE_KEYS.providerTiers, {
      ...defaultProviderTierSettings(),
      tiers: [
        { id: "quality_api", enabled: true },
        { id: "web_ui", enabled: true },
        { id: "searxng_discovery", enabled: false },
        { id: "proxy_failover", enabled: false },
      ],
      webRunnerUrl: "",
    });
    const orchestrator = new TierOrchestrator({
      qualityApi: vi.fn(async () => {
        throw new Error("api fail");
      }),
      webUi: vi.fn(async () => {
        throw webUiTierUnavailable();
      }),
      searxngDiscovery: vi.fn(),
      proxyFailover: vi.fn(),
    });

    await expect(orchestrator.streamChat(baseRequest, () => {})).rejects.toBeInstanceOf(
      TierOrchestratorError
    );

    try {
      await orchestrator.streamChat(baseRequest, () => {});
    } catch (err) {
      const orchestratorErr = err as TierOrchestratorError;
      expect(orchestratorErr.attempts.length).toBeGreaterThanOrEqual(2);
      expect(orchestratorErr.attempts[0].tier).toBe("quality_api");
    }
  });

  it("TierSkipError is recorded but does not abort the chain", async () => {
    saveJson(STORAGE_KEYS.providerTiers, {
      ...defaultProviderTierSettings(),
      tiers: [
        { id: "quality_api", enabled: false },
        { id: "web_ui", enabled: true },
        { id: "searxng_discovery", enabled: false },
        { id: "proxy_failover", enabled: true },
      ],
    });
    const orchestrator = new TierOrchestrator({
      qualityApi: vi.fn(),
      webUi: vi.fn(async () => {
        throw new TierSkipError("web_ui", "no runner url");
      }),
      searxngDiscovery: vi.fn(),
      proxyFailover: vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
        onEvent({ type: "text_delta", delta: "ok" });
      }),
    });

    await orchestrator.streamChat(baseRequest, () => {});
  });
});
