# CONCEPTS.md

Shared vocabulary for the llm-fallbacks static chat gateway and Python library.

## Static chat gateway

| Term | Meaning |
|------|---------|
| **Shell** | ResearchWizard-derived chrome in `webui/shell/` (top bar, slide panels) |
| **chatMount** | DOM node (`#chatMount`) where murm-ui `ChatUI` embeds |
| **FailoverProvider** | Browser SSE client: proxy-first, optional BYOK via `browser-router` |
| **Zero-config** | Visitor chats without API keys; bootstrap merges `docs/config.js`, runtime `chatProxyUrl` fetch, and `configs/chat_proxy.json` |
| **Guest token** | Public bearer (`llm-fallbacks-public`) for edge proxy auth; not user authentication |

## Edge proxy (`edge/`)

| Term | Meaning |
|------|---------|
| **MODEL_CHAIN** | Comma-separated LiteLLM model ids tried when client sends `model=free` |
| **Workers AI fallback** | `env.AI.run()` when upstream OpenRouter/Groq fail or rate-limit |
| **chat_proxy.json** | Committed artifact with dual proxy URLs (Worker primary + Render secondary); merged at runtime via `loadRuntimeConfig()` |

## Build & deploy

| Term | Meaning |
|------|---------|
| **webui build** | `cd webui && npm run build` → `docs/assets/` + `docs/index.html` |
| **Deploy Pages** | GitHub Actions workflow: build webui, upload `docs/`, run Playwright |
| **Deploy Proxies** | GitHub Actions workflow: `wrangler deploy` + optional config commits |

## Cloud secondary (Render)

| Term | Meaning |
|------|---------|
| **Render secondary** | LiteLLM on Render (`llm-fallbacks-gateway.onrender.com` pattern); redeploy via `RENDER_API_KEY` + `RENDER_SERVICE_ID` |
| **loadRuntimeConfig** | `readRuntimeConfig()` + `mergeChatProxyArtifact()` — single bootstrap path for `FailoverProvider` |

## Learnings index

Structured session notes live in `docs/solutions/` (searchable YAML frontmatter). Start there for Workers AI fallback, murm-ui theming, and CI/secrets workflows. Time-windowed product health recaps live in `docs/pulse-reports/` (see `ci-based-product-pulse-without-analytics` runbook when analytics is not wired).
