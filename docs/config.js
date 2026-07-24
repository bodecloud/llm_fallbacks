// Local dev defaults — override via config.js from secrets in CI.
window.LLM_FALLBACKS_CONFIG = {
  endpoints: ["http://127.0.0.1:4000"],
  guestToken: "dev-local-key",
  defaultModel: "free",
  catalogUrl:
    "https://raw.githubusercontent.com/bolabaden/llm_fallbacks/main/configs/free_models.json",
  providerUrlsUrl:
    "https://raw.githubusercontent.com/bolabaden/llm_fallbacks/main/configs/provider_urls.json",
  maxTokens: 512,
};
