/**
 * Browser-side llm-fallbacks routing — optional BYOK path only.
 * Default zero-config chat uses the cloud proxy; this module handles
 * extra providers when the user has chosen to add API keys in Settings.
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

  function resolveApiKey(provider, keys) {
    const field = PROVIDER_KEY_FIELDS[provider] || provider;
    const val = keys[field] || keys[provider];
    return val && String(val).trim() ? String(val).trim() : null;
  }

  function hasKeyForModel(modelId, keys) {
    const slash = modelId.indexOf("/");
    if (slash <= 0) return false;
    return !!resolveApiKey(modelId.slice(0, slash), keys);
  }

  function buildFreeChain(catalog, keys) {
    const chain = [];
    for (let i = 0; i < catalog.length; i++) {
      const entry = catalog[i];
      if (!isChatCapable(entry) || isLocalModel(entry.id)) continue;
      if (!hasKeyForModel(entry.id, keys)) continue;
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
      payload.model =
        modelId === "openrouter/free" ? "openrouter/free" : modelId.replace(/^openrouter\//, "");
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

  function isSkipReason(message) {
    return (
      /^no API key for /i.test(message) ||
      /^unsupported provider:/i.test(message) ||
      /^invalid model id:/i.test(message)
    );
  }

  async function chatWithBrowserFallback(options) {
    const keys = options.keys || loadKeys();
    if (!hasAnyKey(keys)) {
      throw new Error("BROWSER_UNAVAILABLE");
    }

    const model = options.model || "free";
    const chain =
      model === "free" ? buildFreeChain(options.catalog, keys) : hasKeyForModel(model, keys) ? [model] : [];

    if (!chain.length) {
      throw new Error("BROWSER_UNAVAILABLE");
    }

    let lastError = "Browser fallback chain exhausted";
    let attempted = false;

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
          continue;
        }
        attempted = true;
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
        attempted = true;
        lastError = modelId + ": " + (err.message || String(err));
      }
    }

    if (!attempted) {
      throw new Error("BROWSER_UNAVAILABLE");
    }
    if (isSkipReason(lastError)) {
      throw new Error("BROWSER_UNAVAILABLE");
    }
    throw new Error(lastError);
  }

  return {
    RETRYABLE,
    loadKeys,
    saveKeys,
    hasAnyKey,
    hasKeyForModel,
    buildFreeChain,
    chatWithBrowserFallback,
  };
})();
