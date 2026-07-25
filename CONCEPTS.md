# CONCEPTS.md

Shared vocabulary for the static chat gateway and Python library.

## Static chat gateway

| Term | Meaning |
|------|---------|
| **Shell** | Top bar and slide panels from ResearchWizard (`webui/shell/`) |
| **chatMount** | DOM node (`#chatMount`) where murm-ui `ChatUI` renders |
| **FailoverProvider** | Browser SSE client: proxy first, optional BYOK via `browser-router` |
| **Zero-config** | Chat works without API keys; bootstrap merges `docs/config.js`, runtime `chatProxyUrl`, and `configs/chat_proxy.json` |
| **Guest token** | Public bearer (`llm-fallbacks-public`) for edge proxy auth — not user login |

## Edge proxy (`edge/`)

| Term | Meaning |
|------|---------|
| **MODEL_CHAIN** | Comma-separated LiteLLM model IDs tried when the client sends `model=free` |
| **Workers AI fallback** | `env.AI.run()` when upstream OpenRouter/Groq fail or rate-limit |
| **chat_proxy.json** | Committed artifact with dual proxy URLs; merged at runtime via `loadRuntimeConfig()` |

## Build and deploy

| Term | Meaning |
|------|---------|
| **webui build** | `cd webui && npm run build` → `docs/assets/` + `docs/index.html` |
| **Deploy Pages** | GitHub Actions: build webui, upload `docs/`, run Playwright |
| **Deploy Proxies** | GitHub Actions: `wrangler deploy` + optional config commits |

## Cloud secondary (Render)

| Term | Meaning |
|------|---------|
| **Render secondary** | LiteLLM on Render (`llm-fallbacks-gateway.onrender.com` pattern) |
| **loadRuntimeConfig** | `readRuntimeConfig()` + `mergeChatProxyArtifact()` — single bootstrap path for `FailoverProvider` |
| **Routing chip** | Per-reply UI showing endpoint, resolved model, and fallback hops (planned) |
| **Model selector** | Composer picker over `free_models.json`; separate from Failover endpoint settings |

## Learnings index

Session notes with YAML frontmatter: `docs/solutions/`. Product health recaps: `docs/pulse-reports/`. See the `ci-based-product-pulse-without-analytics` runbook when analytics is not wired.
