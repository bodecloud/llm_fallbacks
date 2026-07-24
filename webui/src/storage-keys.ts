export const STORAGE_KEYS = {
  endpoints: "llm_fallbacks_proxy_endpoints",
  guestToken: "llm_fallbacks_guest_token",
  defaultModel: "llm_fallbacks_default_model",
  apiKeys: "llm_fallbacks_api_keys",
} as const;

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
