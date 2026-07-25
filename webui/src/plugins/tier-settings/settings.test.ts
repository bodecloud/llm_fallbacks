import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, StreamEvent } from "murm-ui";
import { defaultProviderTierSettings } from "../../providers/tiers/defaults";
import { TierOrchestrator } from "../../providers/tiers/orchestrator";
import { loadProviderTierSettings } from "../../providers/tiers/settings";
import {
  moveTier,
  persistTierSettings,
  setTierEnabled,
  updateCompanionUrls,
} from "./settings";

const baseRequest: ChatRequest = {
  messages: [{ id: "1", role: "user", blocks: [{ type: "text", text: "hi" }] }],
  options: {},
  signal: new AbortController().signal,
};

describe("tier-settings helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("moves a tier up and preserves the new order through persistence", () => {
    const start = defaultProviderTierSettings();
    // Default order: quality_api, web_ui, searxng_discovery, proxy_failover
    const moved = moveTier(start, "proxy_failover", -1);
    expect(moved.tiers.map((t) => t.id)).toEqual([
      "quality_api",
      "web_ui",
      "proxy_failover",
      "searxng_discovery",
    ]);

    const saved = persistTierSettings(moved);
    expect(loadProviderTierSettings().tiers.map((t) => t.id)).toEqual(
      saved.tiers.map((t) => t.id)
    );
  });

  it("persists enable toggles and companion URLs", () => {
    let settings = defaultProviderTierSettings();
    settings = setTierEnabled(settings, "web_ui", true);
    settings = updateCompanionUrls(settings, {
      webRunnerUrl: " http://127.0.0.1:8788 ",
      searxngUrl: "http://127.0.0.1:8080",
    });
    const saved = persistTierSettings(settings);
    expect(saved.tiers.find((t) => t.id === "web_ui")?.enabled).toBe(true);
    expect(saved.webRunnerUrl).toBe("http://127.0.0.1:8788");
    expect(saved.searxngUrl).toBe("http://127.0.0.1:8080");
  });

  it("reorder → localStorage → orchestrator attempt order matches (R36)", async () => {
    // Put proxy_failover first, then quality_api. Both enabled.
    const reordered = persistTierSettings({
      ...defaultProviderTierSettings(),
      tiers: [
        { id: "proxy_failover", enabled: true },
        { id: "quality_api", enabled: true },
        { id: "web_ui", enabled: false },
        { id: "searxng_discovery", enabled: false },
      ],
    });
    expect(reordered.tiers.map((t) => t.id).slice(0, 2)).toEqual([
      "proxy_failover",
      "quality_api",
    ]);

    const calls: string[] = [];
    const proxyFailover = vi.fn(async (_req, onEvent: (e: StreamEvent) => void) => {
      calls.push("proxy_failover");
      onEvent({ type: "text_delta", delta: "from proxy" });
    });
    const qualityApi = vi.fn(async () => {
      calls.push("quality_api");
    });

    const orchestrator = new TierOrchestrator({
      qualityApi,
      webUi: vi.fn(),
      searxngDiscovery: vi.fn(),
      proxyFailover,
    });

    await orchestrator.streamChat(baseRequest, () => {});

    expect(calls).toEqual(["proxy_failover"]);
    expect(proxyFailover).toHaveBeenCalledOnce();
    expect(qualityApi).not.toHaveBeenCalled();
  });

  it("does not move past list ends", () => {
    const start = defaultProviderTierSettings();
    expect(moveTier(start, "quality_api", -1)).toEqual(start);
    expect(moveTier(start, "proxy_failover", 1).tiers.map((t) => t.id)).toEqual(
      start.tiers.map((t) => t.id)
    );
  });
});
