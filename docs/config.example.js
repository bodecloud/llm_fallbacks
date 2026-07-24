// Copy to config.js for local testing.
window.LLM_FALLBACKS_CONFIG = {
  // Optional cloud proxies (Worker, Render LiteLLM) — used only after browser routing fails.
  endpoints: [],
  guestToken: "",
  defaultModel: "free",
  catalogUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json",
  providerUrlsUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/provider_urls.json",
  maxTokens: 512,
};

// For local LiteLLM dev only (not used on GitHub Pages):
// endpoints: ["http://127.0.0.1:4000"],
// guestToken: "your-litellm-master-key",
