import { describe, expect, it } from "vitest";
import { defaultProviderTierSettings, normalizeTierSettings } from "./defaults";
import type { ProviderTierSettings } from "./types";

describe("tier defaults", () => {
  it("enables quality_api and proxy_failover by default (zero-config routing)", () => {
    const settings = defaultProviderTierSettings();
    const enabled = settings.tiers.filter((t) => t.enabled).map((t) => t.id);
    expect(enabled).toContain("quality_api");
    expect(enabled).toContain("proxy_failover");
    expect(enabled).not.toContain("web_ui");
    expect(enabled).not.toContain("searxng_discovery");
  });
});

describe("normalizeTierSettings", () => {
  it("preserves the user's saved tier order", () => {
    const raw: ProviderTierSettings = {
      tiers: [
        { id: "proxy_failover", enabled: true },
        { id: "quality_api", enabled: false },
        { id: "searxng_discovery", enabled: true },
        { id: "web_ui", enabled: false },
      ],
      webRunnerUrl: "",
      searxngUrl: "",
    };
    const normalized = normalizeTierSettings(raw);
    expect(normalized.tiers.map((t) => t.id)).toEqual([
      "proxy_failover",
      "quality_api",
      "searxng_discovery",
      "web_ui",
    ]);
    expect(normalized.tiers[0].enabled).toBe(true);
    expect(normalized.tiers[1].enabled).toBe(false);
  });

  it("appends omitted tiers at their default-enabled state", () => {
    const raw: ProviderTierSettings = {
      tiers: [{ id: "proxy_failover", enabled: false }],
      webRunnerUrl: "",
      searxngUrl: "",
    };
    const normalized = normalizeTierSettings(raw);
    expect(normalized.tiers.map((t) => t.id)).toEqual([
      "proxy_failover",
      "quality_api",
      "web_ui",
      "searxng_discovery",
    ]);
    // Explicit stored value wins over the default.
    expect(normalized.tiers.find((t) => t.id === "proxy_failover")?.enabled).toBe(false);
    // Omitted quality_api falls back to its default-enabled state.
    expect(normalized.tiers.find((t) => t.id === "quality_api")?.enabled).toBe(true);
  });

  it("dedupes and drops unknown tier ids", () => {
    const raw = {
      tiers: [
        { id: "quality_api", enabled: true },
        { id: "quality_api", enabled: false },
        { id: "bogus_tier", enabled: true },
      ],
      webRunnerUrl: "",
      searxngUrl: "",
    } as unknown as ProviderTierSettings;
    const normalized = normalizeTierSettings(raw);
    const ids = normalized.tiers.map((t) => t.id);
    expect(ids.filter((id) => id === "quality_api")).toHaveLength(1);
    expect(ids).not.toContain("bogus_tier");
    // First occurrence wins.
    expect(normalized.tiers.find((t) => t.id === "quality_api")?.enabled).toBe(true);
  });
});
