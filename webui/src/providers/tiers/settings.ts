import { STORAGE_KEYS, loadJson, saveJson } from "../../storage-keys";
import { defaultProviderTierSettings, normalizeTierSettings } from "./defaults";
import type { ProviderTierSettings } from "./types";

export function loadProviderTierSettings(): ProviderTierSettings {
  const fallback = defaultProviderTierSettings();
  const raw = loadJson<ProviderTierSettings>(STORAGE_KEYS.providerTiers, fallback);
  return normalizeTierSettings({
    tiers: raw.tiers ?? fallback.tiers,
    webRunnerUrl: raw.webRunnerUrl ?? "",
    searxngUrl: raw.searxngUrl ?? "",
  });
}

export function saveProviderTierSettings(settings: ProviderTierSettings): void {
  saveJson(STORAGE_KEYS.providerTiers, normalizeTierSettings(settings));
}
