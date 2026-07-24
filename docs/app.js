/**
 * Static chat client for llm-fallbacks GitHub Pages demo.
 * Routes through configured OpenAI-compatible proxies with endpoint failover.
 */

(function () {
  const cfg = window.LLM_FALLBACKS_CONFIG || {};
  const chatEl = document.getElementById("chat");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const modelSelect = document.getElementById("model");
  const statusEl = document.getElementById("status");
  const clearBtn = document.getElementById("clear");

  const messages = [];
  const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
  const endpoints = Array.isArray(cfg.endpoints) ? cfg.endpoints.filter(Boolean) : [];
  const guestToken = cfg.guestToken || "";
  const defaultModel = cfg.defaultModel || "free";
  const maxTokens = cfg.maxTokens || 512;

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

  async function chatOnce(base, body) {
    const res = await fetch(endpointUrl(base), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + guestToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { res, base };
  }

  async function chatWithFallback(body) {
    if (!endpoints.length) {
      throw new Error("No API endpoints configured in config.js");
    }
    let lastError = "All endpoints failed";
    for (let i = 0; i < endpoints.length; i++) {
      const base = endpoints[i];
      setStatus("Trying " + base + " …");
      try {
        const { res } = await chatOnce(base, body);
        if (res.ok) {
          setStatus("Via " + base);
          return res.json();
        }
        const errText = await res.text();
        lastError = base + ": HTTP " + res.status + " — " + errText.slice(0, 200);
        if (!RETRYABLE.has(res.status)) {
          throw new Error(lastError);
        }
      } catch (err) {
        lastError = base + ": " + (err.message || String(err));
        if (i === endpoints.length - 1) break;
      }
    }
    throw new Error(lastError);
  }

  async function loadCatalog() {
    const url = cfg.catalogUrl;
    if (!url) {
      setStatus("No catalog URL");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const models = await res.json();
      const chatModels = models.filter(function (m) {
        return m.mode === "chat" || m.mode === "" || m.mode === "responses";
      });
      chatModels.slice(0, 40).forEach(function (m) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.id + " (q=" + (m.quality_score || "?") + ")";
        modelSelect.appendChild(opt);
      });
      setStatus(
        endpoints.length +
          " endpoint(s) · " +
          chatModels.length +
          " chat models in catalog"
      );
    } catch (err) {
      setStatus("Catalog load failed: " + err.message);
    }
  }

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
      const data = await chatWithFallback({
        model: modelSelect.value || defaultModel,
        messages: messages,
        max_tokens: maxTokens,
        stream: false,
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
  loadCatalog();
})();
