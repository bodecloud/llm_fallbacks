# CONCEPTS.md

Shared vocabulary for the llm-fallbacks static chat gateway and Python library.

## Static chat gateway

| Term | Meaning |
|------|---------|
| **Shell** | ResearchWizard-derived chrome in `webui/shell/` (top bar, slide panels) |
| **chatMount** | DOM node (`#chatMount`) where murm-ui `ChatUI` embeds |
| **FailoverProvider** | Browser SSE client: proxy-first, optional BYOK via `browser-router` |
| **Zero-config** | Visitor chats without API keys; uses `configs/chat_proxy.json` Worker URL |
| **Guest token** | Public bearer (`llm-fallbacks-public`) for edge proxy auth |

## Edge proxy (`edge/`)

| Term | Meaning |
|------|---------|
| **MODEL_CHAIN** | Comma-separated LiteLLM model ids tried when client sends `model=free` |
| **Workers AI fallback** | `env.AI.run()` when upstream OpenRouter/Groq fail or rate-limit |
| **chat_proxy.json** | Published artifact with Worker URL for Pages bootstrap |

## Build & deploy

| Term | Meaning |
|------|---------|
| **webui build** | `cd webui && npm run build` → `docs/assets/` + `docs/index.html` |
| **Deploy Pages** | GitHub Actions workflow: build webui, upload `docs/`, run Playwright |
| **Deploy Proxies** | GitHub Actions workflow: `wrangler deploy` + optional config commits |

## Learnings index

Structured session notes live in `docs/solutions/` (searchable YAML frontmatter). Start there for Workers AI fallback, murm-ui theming, and CI/secrets workflows. Time-windowed product health recaps live in `docs/pulse-reports/` (see `ci-based-product-pulse-without-analytics` runbook when analytics is not wired).
