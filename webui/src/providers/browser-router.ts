import { STORAGE_KEYS, loadJson, saveJson } from "../storage-keys";

export const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const LOCAL_PROVIDERS = new Set(["ollama", "vllm", "lmstudio", "xinference"]);
const MAX_CHAIN = 25;

export const PROVIDER_KEY_FIELDS: Record<string, string> = {
  openrouter: "openrouter",
  groq: "groq",
  cerebras: "cerebras",
  google_ai_studio: "google",
  mistral: "mistral",
  codestral: "mistral",
  deepseek: "deepseek",
  together_ai: "together",
  fireworks_ai: "fireworks",
  sambanova: "sambanova",
  nvidia_nim: "nvidia",
  cohere: "cohere",
  github_models: "github_models",
  huggingface: "huggingface",
  novita: "novita",
  hyperbolic: "hyperbolic",
  nebius: "nebius",
  chutes: "chutes",
  glhf: "glhf",
  featherless: "featherless",
  completions_me: "completions_me",
};

export type ApiKeys = Record<string, string>;

export interface CatalogEntry {
  id: string;
  mode?: string;
  quality_score?: number;
}

export function loadKeys(): ApiKeys {
  return loadJson<ApiKeys>(STORAGE_KEYS.apiKeys, {});
}

export function saveKeys(keys: ApiKeys): void {
  saveJson(STORAGE_KEYS.apiKeys, keys);
}

export function hasAnyKey(keys: ApiKeys): boolean {
  return Object.values(keys).some((v) => typeof v === "string" && v.trim().length > 0);
}

function isChatCapable(entry: CatalogEntry): boolean {
  return entry.mode === "chat" || entry.mode === "responses" || entry.mode === "";
}

function isLocalModel(id: string): boolean {
  return LOCAL_PROVIDERS.has(id.split("/")[0]) || /^https?:\/\/(127\.|localhost)/.test(id);
}

function resolveApiKey(provider: string, keys: ApiKeys): string | null {
  const field = PROVIDER_KEY_FIELDS[provider] || provider;
  const val = keys[field] || keys[provider];
  return val && String(val).trim() ? String(val).trim() : null;
}

export function hasKeyForModel(modelId: string, keys: ApiKeys): boolean {
  const slash = modelId.indexOf("/");
  if (slash <= 0) return false;
  return !!resolveApiKey(modelId.slice(0, slash), keys);
}

export function buildFreeChain(catalog: CatalogEntry[], keys: ApiKeys): string[] {
  const chain: string[] = [];
  for (const entry of catalog) {
    if (!isChatCapable(entry) || isLocalModel(entry.id)) continue;
    if (!hasKeyForModel(entry.id, keys)) continue;
    chain.push(entry.id);
    if (chain.length >= MAX_CHAIN) break;
  }
  return chain;
}

function parseModelId(litellmId: string): { provider: string; apiModel: string } | null {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
}

async function callProvider(
  modelId: string,
  body: { messages: { role: string; content: string }[]; max_tokens?: number },
  keys: ApiKeys,
  providerUrls: Record<string, string>
): Promise<
  | { skipped: true; reason: string }
  | { skipped?: false; res: Response; route: string }
> {
  const parsed = parseModelId(modelId);
  if (!parsed) return { skipped: true, reason: `invalid model id: ${modelId}` };

  const apiKey = resolveApiKey(parsed.provider, keys);
  if (!apiKey) return { skipped: true, reason: `no API key for ${parsed.provider}` };

  const payload: {
    messages: { role: string; content: string }[];
    max_tokens?: number;
    stream: boolean;
    model?: string;
  } = {
    messages: body.messages,
    max_tokens: body.max_tokens,
    stream: false,
  };

  if (parsed.provider === "openrouter") {
    const model =
      modelId === "openrouter/free"
        ? "openrouter/free"
        : modelId.replace(/^openrouter\//, "");
    payload.model = model;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin + location.pathname,
        "X-Title": "llm-fallbacks",
      },
      body: JSON.stringify(payload),
    });
    return { res, route: `browser/openrouter/${model}` };
  }

  const base =
    providerUrls[parsed.provider] ||
    (parsed.provider === "groq" ? "https://api.groq.com/openai/v1" : null);

  if (!base) return { skipped: true, reason: `unsupported provider: ${parsed.provider}` };

  payload.model = parsed.apiModel;
  const url = base.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return { res, route: `browser/${parsed.provider}/${parsed.apiModel}` };
}

function isSkipReason(message: string): boolean {
  return (
    /^no API key for /i.test(message) ||
    /^unsupported provider:/i.test(message) ||
    /^invalid model id:/i.test(message)
  );
}

export async function chatWithBrowserFallback(options: {
  model: string;
  messages: { role: string; content: string }[];
  maxTokens?: number;
  catalog: CatalogEntry[];
  providerUrls: Record<string, string>;
  keys?: ApiKeys;
  onStatus?: (msg: string) => void;
}): Promise<{ content: string; route: string }> {
  const keys = options.keys || loadKeys();
  if (!hasAnyKey(keys)) throw new Error("BROWSER_UNAVAILABLE");

  const model = options.model || "free";
  const chain =
    model === "free"
      ? buildFreeChain(options.catalog, keys)
      : hasKeyForModel(model, keys)
        ? [model]
        : [];

  if (!chain.length) throw new Error("BROWSER_UNAVAILABLE");

  let lastError = "Browser fallback chain exhausted";
  let attempted = false;

  for (const modelId of chain) {
    options.onStatus?.(`browser: ${modelId}`);
    try {
      const result = await callProvider(
        modelId,
        { messages: options.messages, max_tokens: options.maxTokens },
        keys,
        options.providerUrls
      );
      if (result.skipped) continue;
      attempted = true;
      const res = result.res;
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("Empty response from browser route");
        return { content, route: result.route };
      }
      const errText = await res.text();
      lastError = `${modelId}: HTTP ${res.status} — ${errText.slice(0, 160)}`;
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
    } catch (err) {
      attempted = true;
      lastError = `${modelId}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  if (!attempted) throw new Error("BROWSER_UNAVAILABLE");
  if (isSkipReason(lastError)) throw new Error("BROWSER_UNAVAILABLE");
  throw new Error(lastError);
}

export function shouldTryBrowser(
  model: string,
  catalog: CatalogEntry[],
  keys: ApiKeys
): boolean {
  if (model === "free") {
    return hasAnyKey(keys) && buildFreeChain(catalog, keys).length > 0;
  }
  return hasAnyKey(keys) && hasKeyForModel(model, keys);
}

export function shouldFallbackToProxy(browserErr: Error): boolean {
  const msg = browserErr.message || String(browserErr);
  return (
    msg === "BROWSER_UNAVAILABLE" ||
    msg === "PROXY_UNAVAILABLE" ||
    /^no API key for /i.test(msg) ||
    /^unsupported provider:/i.test(msg)
  );
}
