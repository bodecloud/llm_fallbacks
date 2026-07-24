// Zero-config chat uses the cloud proxy from configs/chat_proxy.json.
window.LLM_FALLBACKS_CONFIG = {
  endpoints: ["https://llm-fallbacks-proxy.bocloud.workers.dev"],
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
