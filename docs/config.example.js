// Copy to config.js for local testing.
window.LLM_FALLBACKS_CONFIG = {
  endpoints: [],
  guestToken: "llm-fallbacks-public",
  defaultModel: "free",
  catalogUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json",
  providerUrlsUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/provider_urls.json",
  chatProxyUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/chat_proxy.json",
  maxTokens: 512,
};

// Optional local LiteLLM dev (not used on GitHub Pages):
// endpoints: ["http://127.0.0.1:4000"],
// guestToken: "your-litellm-master-key",
