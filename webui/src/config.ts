import { STORAGE_KEYS, loadJson, saveJson } from "./storage-keys";

export interface AppConfig {
  endpoints: string[];
  guestToken: string;
  defaultModel: string;
  catalogUrl: string;
  providerUrlsUrl: string;
  chatProxyUrl?: string;
  maxTokens: number;
}

const LOCALHOST_RE = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i;

export function isLocalEndpoint(url: string): boolean {
  return LOCALHOST_RE.test(url || "");
}

export function normalizeEndpoints(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((u) => String(u).trim().replace(/\/$/, ""))
    .filter((u) => u.length > 0 && !isLocalEndpoint(u));
}

export function readRuntimeConfig(): AppConfig {
  const cfg = window.LLM_FALLBACKS_CONFIG || ({} as AppConfig);
  const storedEndpoints = loadJson<string[]>(STORAGE_KEYS.endpoints, []);
  const endpoints =
    storedEndpoints.length > 0
      ? normalizeEndpoints(storedEndpoints)
      : normalizeEndpoints(cfg.endpoints || []);

  return {
    endpoints,
    guestToken:
      localStorage.getItem(STORAGE_KEYS.guestToken) ||
      cfg.guestToken ||
      "llm-fallbacks-public",
    defaultModel:
      localStorage.getItem(STORAGE_KEYS.defaultModel) ||
      cfg.defaultModel ||
      "free",
    catalogUrl: cfg.catalogUrl || "",
    providerUrlsUrl: cfg.providerUrlsUrl || "",
    chatProxyUrl: cfg.chatProxyUrl,
    maxTokens: cfg.maxTokens || 512,
  };
}

export function seedZeroConfigFromPageConfig(): void {
  const cfg = window.LLM_FALLBACKS_CONFIG;
  if (!cfg) return;

  if (!localStorage.getItem(STORAGE_KEYS.endpoints) && cfg.endpoints?.length) {
    saveJson(STORAGE_KEYS.endpoints, normalizeEndpoints(cfg.endpoints));
  }
  if (!localStorage.getItem(STORAGE_KEYS.guestToken) && cfg.guestToken) {
    localStorage.setItem(STORAGE_KEYS.guestToken, cfg.guestToken);
  }
  if (!localStorage.getItem(STORAGE_KEYS.defaultModel) && cfg.defaultModel) {
    localStorage.setItem(STORAGE_KEYS.defaultModel, cfg.defaultModel);
  }
}

export async function mergeChatProxyArtifact(config: AppConfig): Promise<AppConfig> {
  if (!config.chatProxyUrl) return config;
  try {
    const res = await fetch(config.chatProxyUrl);
    if (!res.ok) return config;
    const proxyCfg = (await res.json()) as {
      endpoints?: string[];
      guestToken?: string;
    };
    const merged = normalizeEndpoints([
      ...config.endpoints,
      ...(proxyCfg.endpoints || []),
    ]);
    const unique = [...new Set(merged)];
    return {
      ...config,
      endpoints: unique,
      guestToken: proxyCfg.guestToken || config.guestToken,
    };
  } catch {
    return config;
  }
}
