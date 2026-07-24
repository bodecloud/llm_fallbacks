/**
 * Browser-side llm-fallbacks routing — consumes daily artifacts, walks the ranked
 * free-model chain, and calls provider APIs directly (BYOK in localStorage).
 * No localhost or proxy required when the user has provider API keys.
 */
window.LlmFallbacksClient = (function () {
  const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
  const LOCAL_PROVIDERS = new Set(["ollama", "vllm", "lmstudio", "xinference"]);
  const KEY_STORAGE = "llm_fallbacks_api_keys";
  const MAX_CHAIN = 25;

  const PROVIDER_KEY_FIELDS = {
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

  function loadKeys() {
    try {
      return JSON.parse(localStorage.getItem(KEY_STORAGE) || "{}");
    } catch {
      return {};
    }
  }

  function saveKeys(keys) {
    localStorage.setItem(KEY_STORAGE, JSON.stringify(keys));
  }

  function hasAnyKey(keys) {
    return Object.values(keys).some(function (v) {
      return typeof v === "string" && v.trim().length > 0;
    });
  }

  function isChatCapable(entry) {
    return entry.mode === "chat" || entry.mode === "responses" || entry.mode === "";
  }

  function isLocalModel(id) {
    return LOCAL_PROVIDERS.has(id.split("/")[0]) || /^https?:\/\/(127\.|localhost)/.test(id);
  }

  function buildFreeChain(catalog) {
    const chain = [];
    for (let i = 0; i < catalog.length; i++) {
      const entry = catalog[i];
      if (!isChatCapable(entry) || isLocalModel(entry.id)) continue;
      chain.push(entry.id);
      if (chain.length >= MAX_CHAIN) break;
    }
    return chain;
  }

  function parseModelId(litellmId) {
    const slash = litellmId.indexOf("/");
    if (slash <= 0) return null;
    return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
  }

  function resolveApiKey(provider, keys) {
    const field = PROVIDER_KEY_FIELDS[provider] || provider;
    const val = keys[field] || keys[provider];
    return val && String(val).trim() ? String(val).trim() : null;
  }

  async function callProvider(modelId, body, keys, providerUrls) {
    const parsed = parseModelId(modelId);
    if (!parsed) {
      return { skipped: true, reason: "invalid model id: " + modelId };
    }

    const apiKey = resolveApiKey(parsed.provider, keys);
    if (!apiKey) {
      return { skipped: true, reason: "no API key for " + parsed.provider };
    }

    const payload = {
      messages: body.messages,
      max_tokens: body.max_tokens,
      stream: false,
    };

    if (parsed.provider === "openrouter") {
      payload.model = modelId.replace(/^openrouter\//, "");
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "HTTP-Referer": location.origin + location.pathname,
          "X-Title": "llm-fallbacks",
        },
        body: JSON.stringify(payload),
      });
      return { res, route: "browser/openrouter/" + payload.model };
    }

    const base =
      (providerUrls && providerUrls[parsed.provider]) ||
      (parsed.provider === "groq" ? "https://api.groq.com/openai/v1" : null);

    if (!base) {
      return { skipped: true, reason: "unsupported provider: " + parsed.provider };
    }

    payload.model = parsed.apiModel;
    const url = base.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { res, route: "browser/" + parsed.provider + "/" + parsed.apiModel };
  }

  async function chatWithBrowserFallback(options) {
    const model = options.model || "free";
    const chain = model === "free" ? buildFreeChain(options.catalog) : [model];
    if (!chain.length) {
      throw new Error("No chat-capable models in catalog for browser routing");
    }

    const keys = options.keys || loadKeys();
    let lastError = "Browser fallback chain exhausted";
    let skippedAll = true;

    for (let i = 0; i < chain.length; i++) {
      const modelId = chain[i];
      if (options.onStatus) options.onStatus("browser: " + modelId);
      try {
        const result = await callProvider(
          modelId,
          { messages: options.messages, max_tokens: options.maxTokens },
          keys,
          options.providerUrls
        );
        if (result.skipped) {
          lastError = result.reason;
          continue;
        }
        skippedAll = false;
        const res = result.res;
        if (res.ok) {
          return { data: await res.json(), route: result.route };
        }
        const errText = await res.text();
        lastError = modelId + ": HTTP " + res.status + " — " + errText.slice(0, 160);
        if (!RETRYABLE.has(res.status)) {
          throw new Error(lastError);
        }
      } catch (err) {
        skippedAll = false;
        lastError = modelId + ": " + (err.message || String(err));
      }
    }

    if (skippedAll && !hasAnyKey(keys)) {
      throw new Error(
        "NO_BROWSER_KEYS — add an OpenRouter or Groq API key in Settings (stored locally in your browser)"
      );
    }
    throw new Error(lastError);
  }

  return {
    RETRYABLE,
    loadKeys,
    saveKeys,
    hasAnyKey,
    buildFreeChain,
    chatWithBrowserFallback,
  };
})();
