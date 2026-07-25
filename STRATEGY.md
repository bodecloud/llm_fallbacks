---
name: llm-fallbacks
last_updated: 2026-07-24
---

# Strategy

## Problem

Developers want free LLM chat without manually tracking which models exist, which providers are up, or wiring fallbacks. The hard part is not the chat UI — it is keeping a ranked, routable free-model surface fresh while never putting API keys in a public static site.

## Approach

**Python ranks models and writes daily artifacts.** **Thin edge/container proxies hold secrets and do failover.** The public homepage is a static chat on GitHub Pages that calls OpenAI-compatible proxies — not provider APIs with embedded keys.

Endpoint bootstrap is three-layer: Pages CI writes `docs/config.js`, the browser fetches `chat_proxy.json` at runtime, and the committed artifact lists dual proxy URLs for failover.

High availability on free tiers means **best-effort failover with cold-start penalties**, not paid uptime. We say that plainly.

## Who it's for

Open-source builders and power users who want a demo-quality free LLM gateway tied to this repo — ranked `free` alias routing without running a full Open WebUI stack.

## Metrics

- **Gateway success rate** — chat requests that succeed after at least one fallback hop; proxy logs / Worker analytics
- **Config freshness lag** — hours between daily `free_models.json` update and deployed proxies serving aligned config; CI timestamps and `.last_updated` stamps
- **Homepage engagement** — sessions with first successful completion; lightweight client events (optional, privacy-preserving)
- **Free-tier cost** — target $0 recurring; track when quotas force paid tier or key spend
- **Doc-runtime parity** — operator docs and bootstrap artifacts match as-built endpoints, secrets, and deploy paths before calling the demo production-ready

## Tracks

### Static public chat (GitHub Pages)

Minimal chat SPA as the repo homepage. Uses `free_models.json` for the model browser. Calls proxies only.

_Keeps secrets off the static surface and makes the project tangible to visitors._

### Edge + container proxy HA

Cloudflare Worker primary (CORS, guest auth, rate limits, short fallback chain) plus **Render LiteLLM** as v1 secondary. Both driven by generated configs. Secondary redeploy via Render API when deploy hooks are unavailable; `chat_proxy.json` preserves dual endpoints across Worker-only CI runs.

_Runtime routing and keys cannot live in the browser; reuses `litellm_config_free.yaml` and `free` alias work._

### Artifact pipeline

Daily CI regenerates and commits configs. Deploy workflows refresh proxies when artifacts change.

_One authoritative catalog in Python — no TypeScript port of discovery._

### Documentation and institutional memory

Solutions runbooks (`docs/solutions/`), caveat register (`docs/CAVEATS.md`), plan post-ship addenda, KB audit remediation. Target ≥80% on freshness and runtime-parity dimensions.

_Without a living remediation track, operator runbooks drift from production._

## Not working on

- Open WebUI or other backend-heavy chat stacks on free hosting
- Full TypeScript port of llm-fallbacks discovery
- True multi-region DNS HA on $0
- Browser-direct provider calls with repo-owned keys on the public homepage

## Messaging

**One-liner:** Free LLM fallbacks that stay fresh — ranked models, a browser demo, edge-proxied routing without running your own registry.

**Key message:** The library generates the brain; GitHub Pages shows the demo; Workers and LiteLLM hold the keys and walk the fallback chain. `free` is our ranked alias; `openrouter/free` is OpenRouter's meta-router.
