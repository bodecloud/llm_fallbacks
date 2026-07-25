import type { ProviderTierSettings, TierEntry, TierId } from "./types";

export const TIER_IDS: TierId[] = [
  "quality_api",
  "web_ui",
  "searxng_discovery",
  "proxy_failover",
];

// Zero-config default: BYOK direct routes first (when keys exist), then the
// public proxy chain. quality_api skips instantly without keys, so a keyless
// visitor is served by proxy_failover — matching pre-4B proxy-first behavior.
export const DEFAULT_TIER_ENTRIES: TierEntry[] = [
  { id: "quality_api", enabled: true },
  { id: "web_ui", enabled: false },
  { id: "searxng_discovery", enabled: false },
  { id: "proxy_failover", enabled: true },
];

const DEFAULT_ENABLED_BY_ID = new Map<TierId, boolean>(
  DEFAULT_TIER_ENTRIES.map((t) => [t.id, t.enabled])
);

export function defaultProviderTierSettings(): ProviderTierSettings {
  return {
    tiers: DEFAULT_TIER_ENTRIES.map((t) => ({ ...t })),
    webRunnerUrl: "",
    searxngUrl: "",
  };
}

// Preserve the user's saved tier order (R36) — dedupe and drop unknown ids,
// then append any tier the stored settings omitted at its default-enabled
// state. Rebuilding from a fixed TIER_IDS order would silently discard the
// ordering the settings panel writes.
export function normalizeTierSettings(raw: ProviderTierSettings): ProviderTierSettings {
  const seen = new Set<TierId>();
  const tiers: TierEntry[] = [];
  for (const entry of raw.tiers ?? []) {
    if (!DEFAULT_ENABLED_BY_ID.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    tiers.push({ id: entry.id, enabled: !!entry.enabled });
  }
  for (const id of TIER_IDS) {
    if (!seen.has(id)) tiers.push({ id, enabled: DEFAULT_ENABLED_BY_ID.get(id) ?? false });
  }
  return {
    tiers,
    webRunnerUrl: raw.webRunnerUrl?.trim() ?? "",
    searxngUrl: raw.searxngUrl?.trim() ?? "",
  };
}
