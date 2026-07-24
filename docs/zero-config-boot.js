/**
 * Pre-seed chatgpt-web (MIT, xqdoo00o/chatgpt-web) for zero-config llm-fallbacks.
 * Runs before the main UI script; no user setup required on GitHub Pages.
 */
(function () {
  const cfg = window.LLM_FALLBACKS_CONFIG || {};
  const endpoints = Array.isArray(cfg.endpoints) ? cfg.endpoints : [];
  const endpoint = (endpoints[0] || "").replace(/\/$/, "");
  const guestToken = cfg.guestToken || "llm-fallbacks-public";
  const defaultModel = cfg.defaultModel || "free";

  if (!endpoint || /127\.0\.0\.1|localhost/i.test(endpoint)) {
    return;
  }

  try {
    localStorage.setItem("APIHost", endpoint);
    localStorage.setItem("APIKey", guestToken);
    localStorage.setItem("APIModel", "gpt|" + defaultModel);
    localStorage.setItem("modelVersion", "gpt|" + defaultModel);
    localStorage.setItem("APISelect", endpoint);
    localStorage.setItem("UILang", "en");
    localStorage.setItem("themeMode", "dark");
  } catch (_err) {
    /* private mode / blocked storage */
  }
})();
