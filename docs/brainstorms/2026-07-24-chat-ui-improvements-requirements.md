---
title: GitHub Pages chat UI improvements
date: 2026-07-24
status: confirmed
priority_wave: wave1-chat-ux-essentials
plan: docs/plans/2026-07-24-004-feat-chat-ui-wave1-ux-plan.md
origin: user brainstorm — demo feels overly simplistic
strategy: STRATEGY.md
---

# GitHub Pages chat UI improvements

## Summary

Make the public chat demo feel like a real product in 2026 — without abandoning the static-site + edge-proxy design. Keep daily ranked free models, honest failover, and no repo-owned keys in the browser. Focus on streaming UX, model selection, routing transparency, and clear errors — not on becoming Open WebUI.

## Problem

Visitors compare the homepage to ChatGPT, Open WebUI, and LibreChat. Today the demo has sessions, streaming, markdown, and settings panels, but it **feels basic** because:

- Model choice is a text field in settings, not part of the chat flow; the explorer does not select models.
- Failover and ranking intelligence are invisible — users cannot see which endpoint or model actually served a reply.
- Table-stakes controls (regenerate, edit-resubmit, structured errors) are missing or weak.
- ResearchWizard shell CSS suggests voice, MCP, and research features that are unwired — the UI reads as unfinished.

STRATEGY explicitly defers Open WebUI and full backend stacks. This brainstorm scopes **incremental, static-compatible** upgrades that compound the existing brain (Python artifacts + Worker/LiteLLM proxies).

## Requirements

### Chat UX — composer & messages

| ID | Requirement |
|----|-------------|
| R1 | Users pick the active chat model from a **composer-adjacent model selector** populated from `free_models.json`, with **`free`** as the default ranked alias. |
| R2 | Selecting a model in the **Model Explorer** applies it to the current session (or next message) without opening Failover settings. |
| R3 | Each assistant message exposes **Regenerate** and **Copy**; **Stop** aborts in-flight generation and preserves partial output. |
| R4 | Users can **edit a prior user message** and resubmit, replacing subsequent turns in that session. |
| R5 | Streaming render avoids full-document markdown flicker during SSE (incremental / block-memoized rendering). |

### Routing transparency & trust

| ID | Requirement |
|----|-------------|
| R6 | Each assistant reply shows a compact **routing chip**: endpoint used, resolved model id (when available), and fallback hop count when >0. |
| R7 | Proxy responses surface LiteLLM/Worker metadata when present (`x-litellm-model-name`, `x-litellm-attempted-failbacks`, duration) without exposing secrets. |
| R8 | Error states distinguish **rate limit**, **quota exhausted**, **proxy cold start**, and **auth failure** with actionable copy (not generic “Error”). |
| R9 | Failover settings show **live endpoint status** (reachable / degraded / unreachable) from lightweight health checks before chat. |

### Catalog differentiation

| ID | Requirement |
|----|-------------|
| R10 | Model list entries show **quality score**, context window, and key capabilities (vision, tools) from artifact fields. |
| R11 | UI explains why **`free`** differs from **`openrouter/free`** in one sentence accessible from the model selector. |
| R12 | Optional **“why this rank?”** tooltip links to README quality scoring — no full TS port of Python discovery. |

### Sessions & sharing (static-safe)

| ID | Requirement |
|----|-------------|
| R13 | **Export conversation** as Markdown or JSON download from the current IndexedDB session. |
| R14 | Optional **hash routing** for shareable session links (`#/chat/{id}`) when murm-ui routing is enabled — no server-side sync. |

### Abuse & sustainability (edge)

| ID | Requirement |
|----|-------------|
| R15 | Public demo evaluates **Turnstile → short-lived session** at the Worker before guest-token chat (fail-open in local dev). |
| R16 | Existing KV rate limits remain; UI communicates **429** with retry guidance. |

### Accessibility & polish

| ID | Requirement |
|----|-------------|
| R17 | Chat obeys baseline a11y: keyboard send (Enter / Shift+Enter), focus management, `aria-live` for streaming completion. |
| R18 | Remove or hide **dead shell affordances** (voice, MCP, research) until implemented — no misleading chrome. |

## Approaches considered

### A. UX-first wave (recommended default)

Ship R1–R8 and R17–R18 first: model picker, explorer wiring, message controls, routing chip, error taxonomy, shell cleanup. **Pros:** Biggest jump in “not simplistic” perception; mostly client-side. **Cons:** Does not solve abuse alone.

### B. Trust & ops wave

Prioritize R9, R15–R16 plus a minimal **status strip** fed by `/v1/metrics` and `/health`. **Pros:** Sustainability for public demo. **Cons:** Less visible to casual visitors.

### C. Differentiation wave

Prioritize R10–R12 and optional R14 (compare two models side-by-side — deferred detail to planning). **Pros:** Unique vs generic gateways. **Cons:** Higher design surface; compare mode may exceed static budget.

**Recommendation:** **A → B → C** in three PR-sized waves. Wave A delivers the ChatGPT-class baseline; Wave B protects the free tier; Wave C doubles down on ranked-catalog positioning.

## Scope boundaries

**In scope:** `webui/`, `edge/` header passthrough, `docs/config.js` UX copy, Playwright e2e for new flows, `CONCEPTS.md` vocabulary updates.

**Out of scope (unchanged from STRATEGY):**

- Open WebUI / LibreChat embedding or backend user accounts
- Full TypeScript port of Python discovery
- RAG, MCP marketplace, multi-user orgs, cloud sync
- Paid HA, third backup region, virtual-key automation (tracked separately as SG-01 v1.1)

**Deferred to planning:**

- Side-by-side model compare (two concurrent streams)
- File/image upload for vision models
- Tool-call / reasoning block UI (provider-dependent)
- PWA offline shell beyond manifest stub

## Success criteria

- A first-time visitor completes chat, **changes model from the composer**, and sees **which backend served the reply** — without opening Failover settings.
- Playwright covers model selection + mocked routing chip + regenerate/stop paths.
- STRATEGY “homepage engagement” metric proxy: increase in sessions with `chat_completion_success` events where `route` metadata is non-empty.
- Doc-runtime parity: `configs/README.md` no longer claims a “model picker” that does not exist.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K1 | Stay static-first; secrets remain on Worker/Render | STRATEGY anchor; no scope creep to backend |
| K2 | Routing transparency is a **product feature**, not debug-only | Failover is the story; hiding it feels broken |
| K3 | Model explorer must **drive chat**, not only browse | Current explorer is the main “simplistic” gap |
| K4 | Phased waves A→B→C | YAGNI on compare/RAG; table stakes first |
| K5 | Turnstile is Wave B, not Wave A | UX wave ships faster; abuse hardening follows |

## Dependencies & assumptions

- `free_models.json` remains daily authoritative catalog (no live registry fetch in browser).
- Worker/LiteLLM can pass or already pass response headers needed for R7 (verify in planning).
- murm-ui supports or can be extended for regenerate/stop/edit without fork.
- Render secondary may still 401 for browser guest token until virtual key (documented in `docs/CAVEATS.md`); routing chip must show auth failures clearly.

## Outstanding questions

| ID | Question | Default if unresolved |
|----|----------|------------------------|
| Q1 | Per-session vs global default when user picks a model? | Per-session override, global default unchanged |
| Q2 | Enable hash routing (R14) in Wave A or defer to Wave C? | Defer to Wave C |
| Q3 | Turnstile fail-open vs fail-closed in production? | Fail-open in dev; fail-closed in prod after soak |

## Research references

- [TheFrontKit — AI chat UI best practices (2026)](https://thefrontkit.com/blogs/ai-chat-ui-best-practices)
- [LiteLLM response headers](https://docs.litellm.ai/docs/proxy/response_headers)
- [LiteLLM health checks](https://docs.litellm.ai/docs/proxy/health)
- [Chris House — Turnstile + edge proxy pattern](https://blog.chrishouse.io/cloudflare-ai-gateway-turnstile/)
- [Open WebUI vs LibreChat](https://docs.openwebui.com/alternatives/librechat/)
- Internal: `docs/plans/2026-07-24-002-post-ship-addendum.md`, `docs/CAVEATS.md`, codebase explorer summary (July 2026)
