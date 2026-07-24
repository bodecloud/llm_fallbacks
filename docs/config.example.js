// Copy to config.js and set values, or let deploy-pages.yml generate config.js from secrets.
window.LLM_FALLBACKS_CONFIG = {
  // OpenAI-compatible endpoints in failover order (Worker primary, LiteLLM secondary).
  endpoints: [
    "https://llm-fallbacks-proxy.YOUR_SUBDOMAIN.workers.dev",
    "https://llm-fallbacks-gateway.onrender.com",
  ],
  // Guest token — NOT a provider API key. Set PROXY_GUEST_TOKEN in Worker/LiteLLM.
  guestToken: "replace-me",
  defaultModel: "free",
  catalogUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/free_models.json",
  providerUrlsUrl:
    "https://raw.githubusercontent.com/bodecloud/llm_fallbacks/main/configs/provider_urls.json",
  maxTokens: 512,
};
