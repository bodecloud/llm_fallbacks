---
name: llm-fallbacks
last_updated: 2026-07-24
---

# llm-fallbacks Strategy

## Target problem

Developers and tinkerers want a reliable, zero-cost way to chat with the best available free LLMs without manually tracking which models exist, which providers are up, or wiring fallbacks themselves. The hard part is not building a chat UI—it is keeping a ranked, routable free-model surface fresh as providers change, while never exposing API keys in a public static site.

## Our approach

Treat **llm-fallbacks as the discovery and ranking brain** (Python, daily artifacts) and **thin edge/container proxies as the only place secrets and runtime failover live**. The public homepage is a static chat UI on GitHub Pages that calls OpenAI-compatible proxies—not provider APIs directly with embedded keys. High availability on free tiers means **best-effort failover with cold-start penalties**, not paid-grade uptime; we are honest about that tradeoff rather than pretending spin-down PaaS is always-on HA.

## Who it's for

**Primary:** Open-source builders and power users who want a demo-quality free LLM gateway tied to this repo—they are hiring llm-fallbacks to stay current on free models and route chat through a ranked `free` alias without operating a full Open WebUI stack.

## Key metrics

- **Gateway success rate** — share of chat requests that succeed after at least one fallback hop; measured at proxy logs / Worker analytics
- **Config freshness lag** — hours between daily `free_models.json` update and all deployed proxies serving aligned config; measured via CI timestamps and `.last_updated` stamps
- **Homepage engagement** — sessions reaching first successful completion on the GitHub Pages chat UI; measured via lightweight client events (optional, privacy-preserving)
- **Free-tier cost** — target $0 recurring; track when quotas force paid tier or provider key spend

## Tracks

### Static public chat (GitHub Pages)

A minimal Open WebUI-like SPA as the repo default homepage, consuming `free_models.json` for the model browser and calling proxies only.

_Why it serves the approach:_ Keeps secrets off the static surface while making the project tangible to visitors.

### Edge + container proxy HA

Cloudflare Worker primary proxy (CORS, guest auth, rate limits, short fallback chain) plus LiteLLM on one free PaaS (Render or Koyeb) as secondary, both driven by generated configs.

_Why it serves the approach:_ Runtime routing and keys cannot live in the browser; reuse existing `litellm_config_free.yaml` and `free` alias work.

### Artifact pipeline (existing)

Daily CI regenerates and commits configs; deploy workflows refresh proxies when artifacts change.

_Why it serves the approach:_ Avoids porting Python discovery to TypeScript; the catalog stays authoritative in one place.

## Not working on

- Open WebUI or other backend-heavy chat stacks on free hosting
- Full TypeScript port of llm-fallbacks discovery (`config.py`, LiteLLM registry fetch)
- True multi-region DNS HA on $0 (Fly.io free for new accounts, paid load balancers)
- Browser-direct provider calls with repo-owned API keys on the public homepage

## Marketing

**One-liner:** Free LLM fallbacks that stay fresh—ranked models, static chat UI, edge-proxied and container-backed routing without running your own registry.

**Key message:** The library generates the brain; GitHub Pages shows the demo; Workers and LiteLLM hold the keys and walk the fallback chain. `free` is our ranked alias; `openrouter/free` remains OpenRouter's meta-router.
