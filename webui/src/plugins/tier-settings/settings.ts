import {
  loadProviderTierSettings,
  saveProviderTierSettings,
} from "../../providers/tiers/settings";
import type { ProviderTierSettings, TierEntry, TierId } from "../../providers/tiers/types";
import { normalizeTierSettings } from "../../providers/tiers/defaults";

export const TIER_LABELS: Record<TierId, string> = {
  quality_api: "Direct / BYOK routes",
  web_ui: "Local web-UI runner (opt-in)",
  searxng_discovery: "SearXNG discovery (opt-in)",
  proxy_failover: "Cloud proxy failover",
};

export const TIER_HINTS: Record<TierId, string> = {
  quality_api:
    "Uses API keys stored in this browser. Skips when no key matches the selected model.",
  web_ui:
    "Optional local companion that drives a browser chat UI. Off by default — you run it.",
  searxng_discovery:
    "Optional self-hosted SearXNG. Suggests free chat URLs when higher tiers fail.",
  proxy_failover:
    "Public Worker / Render endpoints from Server settings. Serves zero-config visitors.",
};

/** Move a tier by delta (−1 = up, +1 = down). Returns a new settings object. */
export function moveTier(
  settings: ProviderTierSettings,
  tierId: TierId,
  delta: -1 | 1
): ProviderTierSettings {
  const tiers = settings.tiers.map((t) => ({ ...t }));
  const from = tiers.findIndex((t) => t.id === tierId);
  if (from < 0) return settings;
  const to = from + delta;
  if (to < 0 || to >= tiers.length) return settings;
  const [entry] = tiers.splice(from, 1);
  tiers.splice(to, 0, entry);
  return normalizeTierSettings({ ...settings, tiers });
}

export function setTierEnabled(
  settings: ProviderTierSettings,
  tierId: TierId,
  enabled: boolean
): ProviderTierSettings {
  const tiers: TierEntry[] = settings.tiers.map((t) =>
    t.id === tierId ? { ...t, enabled } : { ...t }
  );
  return normalizeTierSettings({ ...settings, tiers });
}

export function updateCompanionUrls(
  settings: ProviderTierSettings,
  urls: { webRunnerUrl?: string; searxngUrl?: string }
): ProviderTierSettings {
  return normalizeTierSettings({
    ...settings,
    webRunnerUrl: urls.webRunnerUrl ?? settings.webRunnerUrl,
    searxngUrl: urls.searxngUrl ?? settings.searxngUrl,
  });
}

/** Round-trip helpers used by the panel save path and tests. */
export function persistTierSettings(settings: ProviderTierSettings): ProviderTierSettings {
  const normalized = normalizeTierSettings(settings);
  saveProviderTierSettings(normalized);
  return loadProviderTierSettings();
}
