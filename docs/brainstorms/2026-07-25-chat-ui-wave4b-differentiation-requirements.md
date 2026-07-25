---
title: Chat UI Wave 4B — vision, compare, and omnifail provider tiers
date: 2026-07-25
status: confirmed
priority_wave: wave4b-differentiation
origin: docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md
prior_waves: [wave1, wave2, wave3, wave4]
strategy: STRATEGY.md
---

# Chat UI Wave 4B — vision, compare, and omnifail provider tiers

## Summary

Extend the static chat demo with **vision attachments**, **two-column model compare**, and a **user-configurable provider tier stack** that prioritizes the highest-quality free paths first, then optional headless web-UI automation, then existing proxy/BYOK failover. When configured tiers exhaust, **SearXNG discovery** proposes new free web chat targets before giving up — aligned with the repo goal that a response should almost never fail for lack of a route.

## Problem Frame

Waves 1–4 delivered table-stakes UX (picker, routing chip, export/import, streaming polish). The homepage still loses to ChatGPT-class tools on **multimodal** and **model shopping** — visitors cannot attach images or ask the same prompt of two models side-by-side. Separately, the product thesis is **omnifail routing**: quality-first, exhaustive fallback. Today `FailoverProvider` covers proxy → BYOK HTTP only; it does not orchestrate headless free web UIs or discover new targets when the chain is exhausted.

Demand for Wave 4B is **speculative** (no observed visitor workaround yet); success is measured by demo parity with multimodal/compare expectations and by depth of configurable failover, not traffic proof.

## Requirements

### Multimodal (vision)

| ID | Requirement |
|----|-------------|
| R28 | Users **attach one or more images** (paste, file picker, or drag) in the composer when the selected route supports vision; thumbnails preview before send. |
| R29 | Non-vision routes **block send or warn clearly** when images are attached — images are never silently dropped. |
| R30 | Vision-capable catalog models (already badged in explorer/picker) are **preferred or filtered** when attachments are present. |
| R31 | Image payloads respect a **published size cap** (client-side); oversize files show a clear error without corrupting the session. |

### Compare mode

| ID | Requirement |
|----|-------------|
| R32 | Users enter **compare mode**: same user prompt (including attachments when supported) sent to **two independently configured sources** shown in a two-column layout. |
| R33 | Each column shows **model/source label**, streaming reply, and routing metadata consistent with the routing chip pattern. |
| R34 | Compare mode **surfaces rate-limit and Turnstile cost** (two requests) before send when both columns use metered routes. |
| R35 | Users can **exit compare mode** back to single-column chat without losing session history. |

### Provider tiers (omnifail stack)

| ID | Requirement |
|----|-------------|
| R36 | Users configure an **ordered provider tier list** persisted in browser storage; default order ships sensible for zero-config demo (quality API routes before exotic tiers). |
| R37 | **Tier: quality API** — existing proxy SSE and BYOK HTTP OpenAI-compatible calls, ranked by user order and catalog quality score where applicable. |
| R38 | **Tier: headless web UI** (optional, off by default) — user-supplied runner (local or self-hosted) automates free web chat UIs via headless browser; public Pages demo does not require this tier to function. |
| R39 | **Tier: SearXNG discovery** — when higher tiers fail or are disabled, query a user-configurable SearXNG instance to find candidate **free web chat URLs**; discovered targets feed the web-UI tier or present as suggested links — not silent auto-login to third-party accounts. |
| R40 | Failover walks the tier list until a response succeeds or all tiers exhaust; final failure shows **actionable diagnostics** (which tiers were tried, last error class). |
| R41 | Local/self-hosted runner mode is **explicitly opt-in** and documented as lower rate-limit pressure than the public Worker demo. |

### Trust, ops, and demo constraints

| ID | Requirement |
|----|-------------|
| R42 | Web-UI and SearXNG tiers include **CAVEATS copy**: user responsibility for target site terms, no credential harvesting, no default enablement on the public homepage without operator config. |
| R43 | Wave 4B features degrade gracefully when optional backends are absent — zero-config text chat via proxy remains unchanged. |

## Approaches considered

### A. Client-only (vision + compare on existing proxy)

Ship R28–R35 using today’s `FailoverProvider` only. **Pros:** smallest diff, static Pages only. **Cons:** ignores omnifail tier vision and SearXNG.

### B. Differentiation + tier stack (recommended)

Ship R28–R35 plus R36–R43: UI features on static Pages; tier orchestration in browser with optional local/edge runners for web-UI and SearXNG. **Pros:** matches user priority (Playwright web UIs → BYOK → proxy) while keeping demo static-first. **Cons:** web tier and discovery need follow-on implementation units and operator docs.

### C. Omnifail platform first

Build tier engine and SearXNG discovery before compare/vision UI. **Pros:** routing depth first. **Cons:** visitors see no multimodal/compare win until late; higher risk of over-engineering backend.

**Recommendation:** **B** — thin vision/compare UX plus tier framework in one wave; SearXNG discovery included as specified by product owner (not deferred).

## Scope boundaries

**In scope:** `webui/`, optional `edge/` or companion runner docs, operator settings UI, Playwright e2e for vision/compare happy paths (mocked), `docs/CAVEATS.md`, `CONCEPTS.md`.

**Out of scope (this wave):**

- Tool-call / reasoning UI, PWA offline shell, cloud session sync
- Repo-owned credentials for third-party web UIs
- Mandatory Playwright on Cloudflare Worker without user opt-in
- Full TypeScript port of Python model discovery

**Deferred to follow-up work:**

- Automatic account creation on discovered web UIs
- More than two compare columns
- Vision through web-UI tier if first ship is text-only for that tier (must fail clearly per R29)

## Success criteria

- User attaches a PNG, picks a vision-capable model, receives a relevant description via proxy or BYOK.
- Compare mode: same prompt produces two visible streaming columns with distinct source labels.
- User reorders tiers in settings; next chat respects new order; failure diagnostics list attempted tiers.
- With SearXNG configured, exhausted API tiers yield at least one discovered candidate URL or an explicit “discovery empty” message — not a generic network error.
- Public zero-config demo works with tiers 37-only (API/proxy) when web and SearXNG tiers are disabled.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K5 | Include SearXNG discovery in Wave 4B | Product owner expand confirm; aligns with omnifail thesis |
| K6 | Web-UI automation tier is opt-in / user-run | Static Pages cannot host Playwright; ToS and abuse risk |
| K7 | Compare binds per-column tier or model | Supports “ChatGPT web vs our free proxy” not only “two proxy models” |
| K8 | Speculative demand recorded as assumption | No visitor evidence yet; ship for demo parity and routing depth |

## Dependencies and assumptions

- Waves 1–4 merged and deployed on `main`.
- murm-ui `AttachmentPlugin` supports local image processing; multimodal request shaping may require provider extension (planning).
- `searxng/search` exists in catalog artifacts but web-UI **discovery** is net-new behavior — assumes user provides SearXNG base URL (self-hosted or public instance).
- Headless web-UI tier assumes a companion process the user runs locally or on Render — not verified on Worker today.

## Outstanding questions

| ID | Question | Default for planning |
|----|----------|---------------------|
| Q4 | Compare layout: split-pane in `#chatMount` vs full-width overlay? | Split-pane in main chat area |
| Q5 | SearXNG discovery: auto-queue top URL to web tier vs show pick list? | Show pick list; user confirms before automation |
| Q6 | Max images per message | 1 image for thin slice; raise in follow-up if trivial |

## Research references

- [DEV — image upload in chat (2025)](https://dev.to/newbe36524/implementing-image-upload-and-ai-recognition-in-chat-a-complete-solution-from-design-to-4le0) — attachment bar, preview-before-send, multimodal fallback
- [AI Chat UI best practices (2026)](https://thefrontkit.com/blogs/ai-chat-ui-best-practices) — document/image previews, streaming stability
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md` (Wave C deferred list)
