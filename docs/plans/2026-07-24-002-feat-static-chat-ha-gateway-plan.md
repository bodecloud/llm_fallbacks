---
title: "feat: Static chat UI + free-tier HA proxy mesh"
status: active
date: 2026-07-24
type: feat
origin: STRATEGY.md, user-request (GitHub Pages chat + CF Worker + free PaaS HA)
depth: standard
strategy: STRATEGY.md
---

# feat: Static chat UI + free-tier HA proxy mesh

## Summary

Ship a **static chat homepage** on GitHub Pages (repo default site) plus **GitHub Actions–driven deploys** to a **Cloudflare Worker** primary proxy and a **Render/Koyeb LiteLLM** secondary backend. Chat uses the existing `free` alias and daily `configs/` artifacts from llm-fallbacks—**not** a full TypeScript port of Python discovery. Best-effort HA via client + Worker endpoint failover; not paid-grade uptime.

## Problem Frame

The repo already generates ranked free-model configs and a local Docker gateway (`deploy/`), but there is no public demo surface and no multi-surface free hosting story. The user wants Open WebUI-like chat as the default homepage, routed through llm-fallbacks ranking, with HA across free SaaS/PaaS—and preferably no backend.

Research conclusion (see Sources): **pure browser-only provider routing with hidden keys is infeasible**. A **thin edge proxy + optional container LiteLLM** is the minimal secure architecture. **Full llm-fallbacks in TypeScript is unnecessary**; consume `free_models.json` and `litellm_config_free.yaml`. **True HA on $0** is not achievable (cold starts, Fly.io no free tier, quota limits); **best-effort failover** is the honest target.

---

## Requirements

- R1. GitHub Pages serves a static chat UI at the repo default homepage (`https://bolabaden.github.io/llm_fallbacks/`).
- R2. UI loads model catalog from llm-fallbacks artifacts (`free_models.json`); default chat model is `free`.
- R3. Chat requests never embed provider API keys in static assets; keys live only in Worker secrets or PaaS env vars.
- R4. Primary OpenAI-compatible API: Cloudflare Worker with CORS allowlist, guest token auth, rate limits, model allowlist from `free_models_ids.txt`.
- R5. Secondary API: LiteLLM on one free PaaS (Render **or** Koyeb) using `generate_configs --deploy` output and existing `free` alias chain.
- R6. Client-side and/or Worker-side **endpoint failover** between primary Worker URL and secondary LiteLLM URL on 429/5xx/timeout.
- R7. GitHub Actions deploy UI on `docs/**` changes; deploy/update proxies when configs or proxy code change; daily config refresh continues via existing workflow.
- R8. No full TypeScript port of Python discovery; optional small TS module for `heuristic_v1` display only.
- R9. Document cold-start behavior, security model, and `$0` HA limits in user-facing docs.

---

## Key Technical Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| KTD1 | **Static UI in `docs/`** + `deploy-pages.yml` | Native GitHub Pages path; no build toolchain required for MVP (vanilla JS or Vite → `docs/`) |
| KTD2 | **Worker holds provider secrets** | Only layer that can safely call OpenRouter/Groq from a public site |
| KTD3 | **LiteLLM on Render/Koyeb, not Vercel/Fly** | LiteLLM needs long-running Python; Fly has no free tier for new users; Vercel cannot host LiteLLM container |
| KTD4 | **Consume artifacts, don't port `config.py`** | Daily CI already publishes `free_models.json`; Worker caches top-N IDs in KV at deploy |
| KTD5 | **Worker fallback chain (short) + LiteLLM `free` chain (full)** | Worker 10ms CPU / streaming limits favor thin routing; full chain on secondary |
| KTD6 | **Guest proxy token, not provider keys in browser** | `PROXY_GUEST_TOKEN` validated at Worker/LiteLLM; rotatable independently |
| KTD7 | **Client endpoint list for HA** | Free tier lacks DNS load balancing; UI tries `[workerURL, renderURL]` with health pre-check |
| KTD8 | **Defer Open WebUI** | Resource-heavy Python app incompatible with Pages + 512MB free PaaS |
| KTD9 | **Optional `provider_urls.json` artifact** | Replace hardcoded provider base URLs in UI; generated alongside `free_models.json` |

---

## High-Level Technical Design

```mermaid
flowchart TB
  subgraph pages [GitHub Pages]
    UI[docs/chat SPA]
  end

  subgraph ci [GitHub Actions]
    DAILY[daily-config-update]
    DEPLOY[deploy-pages + deploy-proxies]
  end

  subgraph artifacts [raw.githubusercontent.com]
    FM[free_models.json]
    PU[provider_urls.json]
    YAML[litellm_config_free.yaml]
  end

  subgraph edge [Cloudflare Worker - primary]
    W[/v1/chat/completions]
  end

  subgraph paas [Render or Koyeb - secondary]
    LM[LiteLLM model: free]
  end

  DAILY --> FM & PU & YAML
  DEPLOY --> W & LM
  UI -->|fetch catalog| FM
  UI -->|chat + failover| W
  UI -->|fallback| LM
  W -->|short chain| PR[Provider APIs]
  LM -->|full chain| PR
```

**Failover semantics:** UI (or Worker) retries only on 429, 5xx, timeout, model-not-found—not on 400. Secondary may cold-start 30–60s after spin-down.

---

## Scope Boundaries

**In scope (Tier A + partial Tier B)**

- Static chat UI, Pages workflow, repo homepage config docs
- CF Worker proxy (TypeScript)
- One LiteLLM free PaaS deploy + deploy hook workflow
- Client endpoint failover (2 URLs)
- `provider_urls.json` generator (optional U2)
- Security: CORS allowlist, rate limit, model allowlist, max_tokens cap

**Out of scope (v1)**

- Open WebUI / LibreChat
- Full `llm-fallbacks` TypeScript port
- Fly.io (no free tier), Vercel for LiteLLM hosting
- Paid DNS/load-balancer HA
- Browser-direct provider calls with repo-owned keys
- Multi-instance LiteLLM behind LB on free tier

### Deferred to Follow-Up Work

- Cloudflare AI Gateway managed fallbacks layer
- Third backup endpoint (Northflank free tier evaluation)
- Hot reload without LiteLLM restart (plan open question from gateway work)
- `packages/catalog` npm publish for external consumers
- Keep-alive cron to reduce PaaS cold starts (document ToS tradeoffs)

---

## System-Wide Impact

| Surface | Impact |
|---------|--------|
| `docs/` | New static chat UI (Pages root) |
| `worker/` or `edge/` | New CF Worker project |
| `generate_configs.py` | Optional `provider_urls.json`; ensure `free` alias in committed YAML |
| `.github/workflows/` | `deploy-pages.yml`, `deploy-proxies.yml` |
| `README.md` | Homepage demo link, architecture diagram |
| `STRATEGY.md` | Already written; aligns tracks |
| Secrets | `OPENROUTER_API_KEY`, `LITELLM_MASTER_KEY`, `PROXY_GUEST_TOKEN`, `RENDER_DEPLOY_HOOK` / Koyeb API — platform only |

---

## Risks and Dependencies

| Risk | Mitigation |
|------|------------|
| Public demo burns OpenRouter quota | Rate limit per IP; low max_tokens; optional CF Access for personal use |
| Render/Koyeb cold start | Document latency; optional health ping workflow; client timeout messaging |
| Worker 100k req/day cap | Secondary LiteLLM absorbs overflow via client failover |
| CORS misconfiguration | Test from Pages origin; allowlist exact GitHub Pages URL |
| Committed YAML missing `free` alias | Regenerate configs in CI; verify in deploy workflow |
| Abuse of guest token | Rotate token; cap requests; monitor Worker analytics |

**Dependencies:** Cloudflare account, Render or Koyeb account, GitHub Pages enabled (Actions source), existing llm-fallbacks daily CI.

---

## Implementation Units

### U1. Static chat UI on GitHub Pages

**Goal:** Minimal streaming chat SPA as repo homepage calling configured proxy endpoints.

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**

- `docs/index.html` (or `docs/chat/` + `docs/index.html` redirect)
- `.github/workflows/deploy-pages.yml`
- `docs/README.md` (optional, Pages-only notes)

**Approach:**

- Vanilla JS or lightweight Vite build output committed to `docs/` (prefer no build step for MVP if prototype suffices).
- Fetch `https://raw.githubusercontent.com/bolabaden/llm_fallbacks/main/configs/free_models.json`.
- Default model `free`; allow picking catalog entries that proxy allowlists.
- Implement `chatWithFallback(endpoints[], messages)` — try Worker URL then LiteLLM URL.
- Store only `PROXY_GUEST_TOKEN` in UI config (public env via `docs/config.js` generated at deploy—not provider keys).
- Streaming via `fetch` + SSE reader pattern.

**Patterns to follow:** Prototype on branch `cursor/free-models-list-generation-734a` if merged; [chit-v2](https://github.com/Fortyseven/chit-v2) Pages pattern.

**Test scenarios:**

- Happy path: mock fetch returns model list; chat UI renders.
- Failover: first endpoint returns 503, second succeeds (mock).
- Edge: empty model list shows error state.

**Verification:** Pages deploy succeeds; live site loads catalog; manual chat against staging proxy.

---

### U2. Provider URLs artifact (optional but recommended)

**Goal:** Generated map of provider → OpenAI-compatible base URL for UI metadata and Worker validation.

**Requirements:** R2, R9

**Dependencies:** None

**Files:**

- `src/llm_fallbacks/generate_configs.py`
- `tests/test_generate.py`
- `configs/provider_urls.json` (generated)

**Approach:**

- Emit `{ "openrouter": "https://openrouter.ai/api/v1", ... }` from `CUSTOM_PROVIDERS` during `generate()`.
- Document raw URL in `configs/README.md`.

**Test scenarios:**

- Happy path: JSON contains known providers from fixtures.
- Regression: existing artifacts unchanged in shape.

**Verification:** File present after `generate_configs`; UI can remove hardcoded `PROVIDER_URLS`.

---

### U3. Cloudflare Worker primary proxy

**Goal:** OpenAI-compatible edge proxy with secrets, CORS, allowlist, short fallback chain.

**Requirements:** R3, R4, R6

**Dependencies:** U2 (optional)

**Files:**

- `edge/` or `worker/` — `src/index.ts`, `wrangler.toml`, `package.json`
- `.github/workflows/deploy-proxies.yml` (Worker job)

**Approach:**

- `POST /v1/chat/completions` — validate guest token header.
- Load allowlisted model IDs from KV (populated at deploy from `free_models_ids.txt` top-N).
- On `model: free`, iterate cached chain from `free_models.json` order (cap 5–10 at edge).
- Secrets: `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `PROXY_GUEST_TOKEN`.
- CORS: `Access-Control-Allow-Origin: https://bolabaden.github.io` (and custom domain if set).
- Rate limit via KV counter per IP (simple fixed window).
- Reference: [cloudflare-llm-gateway](https://github.com/leeguooooo/cloudflare-llm-gateway), [Stackbilt llm-providers](https://github.com/Stackbilt-dev/llm-providers).

**Test scenarios:**

- Unit: model allowlist rejects unknown model.
- Unit: fallback tries next provider on 429 mock.
- Integration: `wrangler dev` + curl from allowed origin.

**Verification:** Worker deploy; curl chat completion with guest token succeeds.

---

### U4. LiteLLM secondary on free PaaS

**Goal:** Deploy existing `deploy/` stack to Render or Koyeb as secondary endpoint.

**Requirements:** R5, R7

**Dependencies:** U1 (needs secondary URL in UI config)

**Files:**

- `deploy/render.yaml` or `deploy/koyeb.toml` (platform-specific)
- `.github/workflows/deploy-proxies.yml` (PaaS job)
- `deploy/README.md` (update cloud section)

**Approach:**

- Slim profile: drop Redis if 512MB OOM; use deploy-mode YAML (`disable_spend_logs`, no observability callbacks).
- Env: `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `DATABASE_URL` empty.
- Bootstrap config: `update-config.sh --once` on start or mount raw YAML from GitHub at deploy.
- Expose HTTPS URL to UI config (public).
- Render deploy hook or Koyeb API triggered from workflow after config artifact upload.

**Test scenarios:**

- Test expectation: none — manual smoke on platform.

**Verification:** `/health/liveliness` returns OK; chat with `model: free` works with master key.

---

### U5. GitHub Actions orchestration

**Goal:** Wire Pages deploy + proxy deploy + config refresh triggers.

**Requirements:** R7

**Dependencies:** U1, U3, U4

**Files:**

- `.github/workflows/deploy-pages.yml`
- `.github/workflows/deploy-proxies.yml`

**Approach:**

- `deploy-pages`: on push to `main` paths `docs/**`, use `actions/deploy-pages@v4`.
- `deploy-proxies`: on push paths `edge/**`, `deploy/**`, `configs/litellm_config_free.yaml`, or `workflow_dispatch`; jobs: generate artifact → wrangler deploy → trigger PaaS hook.
- Reuse `OPENROUTER_API_KEY` secret from daily workflow pattern.
- Document required repo secrets in `deploy/README.md`.

**Test scenarios:**

- Workflow syntax valid (`act` or manual dispatch).

**Verification:** Push to branch triggers Pages; proxy workflow deploys without secret leakage in logs.

---

### U6. Client-side catalog module (minimal TS optional)

**Goal:** Optional small TS library for quality score display—not discovery.

**Requirements:** R8

**Dependencies:** None (parallel)

**Files:**

- `packages/catalog/` or `docs/js/quality.js` (single file port of `heuristic_v1`)

**Approach:**

- Port `compute_quality_score()` only (~80 lines math).
- Used for sorting/badge in UI if not trusting pre-sorted JSON order.
- **Do not** port `config.py`, `core.py`, or LiteLLM fetch.

**Test scenarios:**

- Parity tests against Python fixtures (export JSON test vectors from `test_quality.py`).

**Verification:** Scores match Python within epsilon for fixture specs.

---

### U7. Documentation and homepage setup

**Goal:** Make chat the default repo entry point; document HA limits honestly.

**Requirements:** R9

**Dependencies:** U1, U5

**Files:**

- `README.md`
- `AGENTS.md`
- `STRATEGY.md` (exists)
- GitHub repo About/Website field (manual step documented)

**Approach:**

- README badge/link: "Try the chat demo".
- Document: not HA in SLA sense; cold starts; guest token rotation.
- AGENTS.md: add `docs/`, `edge/` scope.

**Test scenarios:**

- Test expectation: none.

**Verification:** New contributor can follow README to run Pages locally + point at Worker dev URL.

---

## Open Questions

| Question | Status | Owner |
|----------|--------|-------|
| Render vs Koyeb for secondary | Pick one for v1 (Render deploy hooks simpler) | User/implementer |
| Vite build vs single HTML file | Default single HTML for MVP | Implementer |
| CF AI Gateway in front of Worker | Defer to follow-up | — |
| Regenerate committed YAML with `free` alias before launch | Run `generate_configs` in CI or manual commit | Implementer |

---

## Sources and Research

- `STRATEGY.md` (2026-07-24)
- `docs/plans/2026-07-24-001-feat-self-hosted-free-gateway-plan.md` (local Docker gateway — extended, not replaced)
- ce-feasibility-reviewer: Tier A/B/C analysis; browser keys infeasible; no full TS port
- ce-best-practices-researcher: Worker + Render pattern, security controls, reference repos
- ce-repo-research-analyst: Pages constraints, artifact URLs, prototype branch note
- [Cloudflare AI Gateway fallbacks](https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/)
- [LiteLLM proxy reliability](https://docs.litellm.ai/docs/proxy/reliability)

**External research load-bearing:** Yes — free-tier platform limits and static-site security model shaped KTD2–KTD7.

---

## Acceptance Examples

- AE1. Visitor opens `https://bolabaden.github.io/llm_fallbacks/`, sees chat UI, sends message with default `free`, receives streamed reply via Worker or secondary.
- AE2. Worker outage (simulated): UI fails over to LiteLLM URL within client retry logic.
- AE3. View-source on Pages site shows no `OPENROUTER_API_KEY` or provider secrets.
- AE4. Daily CI updates `free_models.json`; within 24h proxies serve aligned model lists (via redeploy or KV refresh job).

---

## Sequencing

```mermaid
flowchart LR
  U2[U2 provider_urls] --> U1[U1 Pages UI]
  U3[U3 CF Worker] --> U1
  U4[U4 LiteLLM PaaS] --> U1
  U1 --> U5[U5 GH Actions]
  U3 --> U5
  U4 --> U5
  U6[U6 optional TS quality] -.-> U1
  U5 --> U7[U7 docs]
```

**Recommended order:** U3 + U4 (proxies) → U1 (UI wired to URLs) → U5 → U7. U2 and U6 parallel when convenient.

---

## Feasibility Summary (from research)

| User ask | Verdict |
|----------|---------|
| GitHub Pages chat homepage | ✅ Feasible |
| CF Worker + free PaaS routing | ✅ Feasible (Worker + 1–2 backends) |
| HA across all free providers | ⚠️ Best-effort only, not true HA |
| No backend at all | ❌ Infeasible — thin proxy required |
| Full llm-fallbacks in TypeScript | ❌ Unnecessary — consume JSON/YAML |
| Open WebUI on free static hosting | ❌ Infeasible |
| Completely free | ✅ With stated cold-start/ quota limits |
