/**
 * Static chat client — zero-config cloud proxy first, optional browser BYOK second.
 */

(function () {
  const cfg = window.LLM_FALLBACKS_CONFIG || {};
  const client = window.LlmFallbacksClient;
  const chatEl = document.getElementById("chat");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const modelSelect = document.getElementById("model");
  const statusEl = document.getElementById("status");
  const clearBtn = document.getElementById("clear");
  const settingsBtn = document.getElementById("settings");
  const settingsPanel = document.getElementById("settings-panel");
  const keysForm = document.getElementById("keys-form");

  const messages = [];
  const RETRYABLE = client.RETRYABLE;
  const defaultModel = cfg.defaultModel || "free";
  const maxTokens = cfg.maxTokens || 512;

  let catalog = [];
  let providerUrls = {};
  let guestToken = cfg.guestToken || "";
  let proxyEndpoints = [];

  function isLocalEndpoint(url) {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(url || "");
  }

  function normalizeEndpoints(list) {
    return (Array.isArray(list) ? list : []).filter(function (u) {
      return u && !isLocalEndpoint(u);
    });
  }

  proxyEndpoints = normalizeEndpoints(cfg.endpoints);

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function appendMessage(role, content, extraClass) {
    const div = document.createElement("div");
    div.className = "msg " + role + (extraClass ? " " + extraClass : "");
    div.textContent = content;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    return div;
  }

  function endpointUrl(base) {
    const trimmed = base.replace(/\/$/, "");
    return trimmed.endsWith("/v1/chat/completions")
      ? trimmed
      : trimmed + "/v1/chat/completions";
  }

  async function chatViaProxy(base, body) {
    const res = await fetch(endpointUrl(base), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + guestToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function chatWithProxyFallback(body) {
    if (!proxyEndpoints.length) {
      throw new Error("PROXY_UNAVAILABLE");
    }
    let lastError = "All proxy endpoints failed";
    for (let i = 0; i < proxyEndpoints.length; i++) {
      const base = proxyEndpoints[i];
      setStatus("proxy: " + base + " …");
      try {
        const res = await chatViaProxy(base, body);
        if (res.ok) {
          return { data: await res.json(), route: "proxy/" + base };
        }
        const errText = await res.text();
        lastError = base + ": HTTP " + res.status + " — " + errText.slice(0, 160);
        if (!RETRYABLE.has(res.status)) {
          throw new Error(lastError);
        }
      } catch (err) {
        lastError = base + ": " + (err.message || String(err));
      }
    }
    throw new Error(lastError);
  }

  async function chatWithBrowserFallback(body) {
    return client.chatWithBrowserFallback({
      model: body.model,
      messages: body.messages,
      maxTokens: body.max_tokens,
      catalog: catalog,
      providerUrls: providerUrls,
      keys: client.loadKeys(),
      onStatus: setStatus,
    });
  }

  async function chatWithFallback(body) {
    const userKeys = client.loadKeys();
    const model = body.model || defaultModel;
    const canBrowser =
      client.hasAnyKey(userKeys) &&
      (model !== "free" ? client.hasKeyForModel(model, userKeys) : client.buildFreeChain(catalog, userKeys).length > 0);

    if (canBrowser) {
      try {
        return await chatWithBrowserFallback(body);
      } catch (browserErr) {
        const msg = browserErr.message || String(browserErr);
        if (msg === "BROWSER_UNAVAILABLE" && proxyEndpoints.length) {
          setStatus("optional browser route unavailable — using cloud proxy …");
        } else if (proxyEndpoints.length) {
          setStatus("browser failed — trying cloud proxy …");
        } else {
          throw browserErr;
        }
      }
    }

    if (proxyEndpoints.length) {
      return await chatWithProxyFallback(body);
    }

    throw new Error(
      "No chat routes are available yet. The demo proxy is still deploying — refresh in a minute."
    );
  }

  async function loadChatProxy() {
    const chatProxyUrl = cfg.chatProxyUrl;
    if (!chatProxyUrl) return;
    try {
      const res = await fetch(chatProxyUrl);
      if (!res.ok) return;
      const proxyCfg = await res.json();
      const merged = normalizeEndpoints([].concat(proxyEndpoints, proxyCfg.endpoints || []));
      proxyEndpoints = merged.filter(function (v, i, a) {
        return a.indexOf(v) === i;
      });
      if (proxyCfg.guestToken) {
        guestToken = proxyCfg.guestToken;
      }
    } catch (_err) {
      /* optional artifact */
    }
  }

  async function loadArtifacts() {
    const catalogUrl = cfg.catalogUrl;
    const providerUrlsUrl = cfg.providerUrlsUrl;
    if (!catalogUrl) {
      setStatus("No catalog URL configured");
      return;
    }
    try {
      await loadChatProxy();
      const [catRes, puRes] = await Promise.all([
        fetch(catalogUrl),
        providerUrlsUrl ? fetch(providerUrlsUrl) : Promise.resolve(null),
      ]);
      if (!catRes.ok) throw new Error("catalog HTTP " + catRes.status);
      catalog = await catRes.json();
      if (puRes && puRes.ok) {
        providerUrls = await puRes.json();
      }

      const chatModels = catalog.filter(function (m) {
        return m.mode === "chat" || m.mode === "" || m.mode === "responses";
      });
      while (modelSelect.options.length > 1) {
        modelSelect.remove(1);
      }
      chatModels.slice(0, 40).forEach(function (m) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.id + " (q=" + (m.quality_score || "?") + ")";
        modelSelect.appendChild(opt);
      });

      const proxyHint = proxyEndpoints.length ? proxyEndpoints.length + " cloud route" : "proxy pending";
      const keyHint = client.hasAnyKey(client.loadKeys()) ? "optional keys set" : "no keys required";
      setStatus("zero-config · " + proxyHint + " · " + keyHint + " · " + chatModels.length + " models");
    } catch (err) {
      setStatus("Catalog load failed: " + err.message);
    }
  }

  function openSettings() {
    const keys = client.loadKeys();
    document.getElementById("key-openrouter").value = keys.openrouter || "";
    document.getElementById("key-groq").value = keys.groq || "";
    settingsPanel.hidden = false;
  }

  function closeSettings() {
    settingsPanel.hidden = true;
  }

  settingsBtn.addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);

  keysForm.addEventListener("submit", function (e) {
    e.preventDefault();
    client.saveKeys({
      openrouter: document.getElementById("key-openrouter").value.trim(),
      groq: document.getElementById("key-groq").value.trim(),
    });
    closeSettings();
    appendMessage("system", "Optional API keys saved locally in this browser.");
    loadArtifacts();
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    sendBtn.disabled = true;
    messages.push({ role: "user", content: text });
    appendMessage("user", text);

    const assistantEl = appendMessage("assistant", "…");

    try {
      const { data, route } = await chatWithFallback({
        model: modelSelect.value || defaultModel,
        messages: messages.map(function (m) {
          return { role: m.role, content: m.content };
        }),
        max_tokens: maxTokens,
      });
      const reply =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;
      if (!reply) {
        throw new Error("Empty response");
      }
      messages.push({ role: "assistant", content: reply });
      assistantEl.textContent = reply;
      setStatus("ok · " + route);
    } catch (err) {
      assistantEl.textContent = err.message || String(err);
      assistantEl.classList.add("error");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  clearBtn.addEventListener("click", function () {
    messages.length = 0;
    chatEl.innerHTML = "";
    appendMessage("system", "Chat cleared.");
  });

  modelSelect.value = defaultModel;
  loadArtifacts();
})();
