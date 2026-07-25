---
title: Chat UI Wave 6 — transparency, branching, and discovery
date: 2026-07-25
status: confirmed
priority_wave: wave6-transparency-discovery
next_slice: wave6a
refreshed: 2026-07-25
origin: user brainstorm — what to improve after Waves 1–4B
prior_waves: [wave1, wave2, wave3, wave4, wave4b]
strategy: STRATEGY.md
---

# Chat UI Wave 6 — transparency, branching, and discovery

## Delta (2026-07-25 refresh)

Wave 4B merged. Sequencing flip vs original “after Wave 5” framing: **Wave 6A (usage + failover timeline) is the next implementation slice**, before Wave 5 agent UX. Full Wave 6 still covers branching, templates, share/embed, and optional analytics/artifacts — but **6A alone** is the identity bet and unblocks Wave 5.

## Summary

Make the static demo **teach and retain** — not just chat. **Wave 6A** (next) adds **per-reply usage and latency** and a **failover timeline** that explains ranked routing using Wave 4B tier metadata. Later slices add **conversation branching**, a **prompt template library**, and **read-only share/embed**. Optional **6C** adds a **session analytics drawer** and **read-only artifact pane**. Stays static-first; no accounts, MCP execution, or cloud session sync.

## Problem Frame

Waves 1–4B closed multimodal and omnifail routing. Visitors still leave without understanding **why this project exists** — the ranked `free` alias, fallback hops, and quality scoring are buried in README copy. Meanwhile 2026 chat products treat **usage transparency** and **explainable routing** as table stakes. Agent chrome (reasoning/tool cards) matters for parity but does not own this product’s wedge.

Demand remains **speculative** (no visitor evidence). Success is measured by demo differentiation (failover story visible in-product) and power-user depth, not traffic proof. STRATEGY still anchors Python artifacts + edge proxies — Wave 6 is client-side education and local-session depth, not a pivot to Open WebUI.

## Requirements

### Usage and latency transparency (6A)

| ID | Requirement |
|----|-------------|
| R58 | Each assistant reply shows a compact **usage badge**: input/output token counts when the route exposes them, plus **time-to-first-token** and total duration. |
| R59 | When token counts are unavailable, the badge shows **latency only** — no fabricated token estimates. |
| R60 | A **session totals row** (footer or drawer header) aggregates tokens and wall time for the active session. |

### Failover timeline and routing education (6A)

| ID | Requirement |
|----|-------------|
| R61 | The routing chip expands into a **failover timeline**: ordered attempts with endpoint, resolved model, outcome (success / skip / error class), and hop index. |
| R62 | Timeline copy distinguishes **`free` ranked alias** from **`openrouter/free`** meta-router in one sentence accessible from the expanded view. |
| R63 | When omnifail tiers (Wave 4B) are active, the timeline includes **tier name** and skip reason for disabled or exhausted tiers. |
| R64 | Timeline data comes from **response metadata already available** to the client; Wave 6 does not add new proxy logging backends. |

### Conversation branching (6B)

| ID | Requirement |
|----|-------------|
| R65 | Users **branch from any user message**: edit-and-resubmit creates a sibling thread without deleting the original path. |
| R66 | The sidebar shows a **branch indicator** on sessions with forks; users can switch active branch within a session. |
| R67 | Export/import (Wave 3) includes branch structure or exports the **active branch only** with clear labeling — planning picks one behavior and documents it. |
| R68 | Branching is **IndexedDB-only**; no server merge or cross-device sync. |

### Prompt template library (6B or late 6A)

| ID | Requirement |
|----|-------------|
| R69 | A **template picker** (slash command or composer menu) offers bundled prompts: compare two models, summarize, debug code, explain ranking — sourced from static repo artifacts. |
| R70 | Templates support **`{{variable}}` placeholders**; the UI prompts for values before inserting into the composer. |
| R71 | Users can **save custom templates** to local storage; bundled templates are read-only. |
| R72 | Templates respect the active model and route capabilities (e.g., vision template disabled when route lacks vision). |

### Share and embed (static-safe) (6B)

| ID | Requirement |
|----|-------------|
| R73 | **Share snapshot** produces a read-only view of the current session (active branch) via **client-encoded URL** or downloadable HTML — no account required. |
| R74 | Shared views are **read-only**; recipients cannot send messages or see API keys. |
| R75 | **`?embed=1`** (or equivalent) renders chromeless chat suitable for iframe embed in README/docs; Turnstile and rate-limit warnings still apply when sending. |
| R76 | Share payloads **strip secrets** (BYOK keys, guest token values, runner URLs with credentials). |

### Session analytics drawer (optional Wave 6C)

| ID | Requirement |
|----|-------------|
| R77 | A slide-out **session analytics** panel shows per-turn model used, fallback rate, error mix, and cumulative latency for the active session. |
| R78 | Analytics are computed **client-side** from stored messages and routing metadata; no new analytics backend. |
| R79 | Drawer is **informational** — it does not gate chat or require opt-in beyond opening it. |

### Read-only artifact pane (optional Wave 6C)

| ID | Requirement |
|----|-------------|
| R80 | When an assistant message contains a fenced **HTML, SVG, or Mermaid** block, users can open a **sandboxed preview pane** beside the thread. |
| R81 | Preview is **display-only** — no script execution beyond sandboxed iframe rules; no tool round-trip. |
| R82 | Artifact pane degrades to **code view only** when content type is unsupported or sandbox blocks render. |

### Mobile shell polish (after 6A core)

| ID | Requirement |
|----|-------------|
| R83 | Chat layout uses a **mobile-first bottom sheet** for model picker, settings, and analytics on narrow viewports. |
| R84 | Composer controls (attach, mic, send) sit in the **thumb zone** with minimum 44px touch targets. |
| R85 | Streaming messages do not trap scroll; **sticky composer** remains visible without obscuring the last reply. |

### Streaming accessibility (6A for timeline/badge; rest with polish)

| ID | Requirement |
|----|-------------|
| R86 | **`aria-live` announces lifecycle events** (generation started, completed, error) — not per-token updates. |
| R87 | Keyboard shortcut **re-reads the last assistant message** for screen-reader users. |
| R88 | Expanded failover timeline and usage badges are **keyboard reachable** with visible focus rings. |

## Approaches considered

### A. Transparency-first 6A, then depth (recommended)

Ship **R58–R64 + R88** as Wave **6A** immediately after Wave 4B — make failover and usage visible before Wave 5 agent chrome. Then Wave 5A, then **6B** (branching + share + templates) and optional **6C**. **Pros:** Highest STRATEGY alignment; compounds routing chip; low server cost. **Cons:** Branching/share wait longer.

### B. Branching and share-first

Prioritize R65–R76 before usage timeline. **Pros:** Viral/demo growth angle. **Cons:** Does not explain *why* this gateway exists.

### C. Analytics and artifacts panel

Prioritize R77–R82 before branching. **Pros:** Power-user delight. **Cons:** Less differentiated than failover education.

**Recommendation:** **A**. **6A** is the next ship slice. Templates (R69–R72) may ride with 6B unless planning finds them trivial to attach to 6A. Mobile polish (R83–R85) and remaining a11y (R86–R87) attach to whichever UI slice touches those surfaces.

## Scope boundaries

**In scope (6A):** usage badge, failover timeline expansion of routing chip, client metadata plumbing, keyboard reachability for badge/timeline, Playwright mocks, `CONCEPTS.md`, `docs/chat-ui-plugins.md`.

**In scope (6B+):** branching IndexedDB, templates, share/embed, mobile bottom sheets, session analytics, artifact pane.

**Deferred for later:**

- MCP client panel and **tool execution loop** (Wave 5 display-only remains the ceiling until product pivot)
- TTS, wake word, MediaRecorder + paid STT
- Full **generative UI widget runtime**
- **Cloud-hosted share** with KV persistence and TTL
- Text/PDF document attach beyond images
- Session folders/tags across devices
- More than two compare columns

**Outside this product's identity (STRATEGY):**

- User accounts, org workspaces, cloud session sync
- Full TypeScript port of Python discovery or live scoring in the browser
- Open WebUI / LibreChat embedding
- Paid analytics backends or third-party product analytics SDKs

## Success criteria

### 6A (next)

- A first-time visitor expands a reply and sees **which models/endpoints were tried**, why fallback or tier skip occurred, and how `free` differs from `openrouter/free`.
- Usage badge shows real token counts on at least one BYOK/proxy route; latency-only degrade on routes without usage metadata.
- Timeline and badge are keyboard reachable.

### Later slices

- User branches from a mid-conversation message, switches branch in sidebar, and exports without data loss on the chosen export semantics.
- Template picker inserts a compare-models prompt with variables filled; custom template persists across reload.
- Share link or HTML snapshot opens read-only with secrets stripped; `?embed=1` loads in an iframe without layout breakage.
- Mobile viewport: model picker opens as bottom sheet; composer remains usable one-handed.
- Screen reader hears start/complete announcements.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K15 | **Transparency before branching** | Product thesis is ranked failover — teach it in-product before parity features |
| K16 | **No fabricated usage data** | Trust beats impressiveness; matches Wave 5 reasoning-gating pattern |
| K17 | **Share v1 is client-encoded or download** | Avoids KV/auth surface on public Worker; fits static-first |
| K18 | **Templates from static artifacts** | Preserves Python-as-brain; no live template CMS |
| K19 | **Artifact pane is sandboxed preview only** | Agentic feel without deferred tool execution |
| K20 | **6B/6C are splittable** | Keeps 6A shippable if branch graph or analytics overrun estimate |
| K21 | **6A before Wave 5** | Identity wedge before agent chrome; Wave 4B metadata already available |
| K23 | **Speculative demand recorded** | No visitor evidence; ship for differentiation |

## Dependencies and assumptions

- **Wave 4B merged** — orchestrator attempts and routing metadata supply timeline inputs (R63). Do not block 6A on web/SearXNG tiers being configured.
- **Wave 5 does not block 6A.** Wave 5 implementation waits on 6A.
- Token usage requires provider/proxy to expose counts in response or stream trailers; not all free routes will qualify (R59 degrade path).
- Branching may require murm-ui session graph support or a thin wrapper — planning verifies without prescribing architecture here.
- Share URL length limits may cap very large sessions; planning defines max snapshot size or falls back to download-only.

## Outstanding questions

| ID | Question | Default for planning |
|----|----------|---------------------|
| Q10 | Branch export: full tree vs active branch only? | Active branch only in v1; tree export follow-up |
| Q11 | Share: compressed hash URL vs downloadable HTML file? | Hash URL under size cap; HTML download fallback |
| Q12 | Session analytics in 6A or 6C? | 6C optional slice after 6A |
| Q13 | Mobile bottom sheet: replace all slide panels or chat-specific only? | Chat-adjacent panels first (model picker, analytics) |
| Q14 | Templates with 6A or 6B? | 6B unless planning finds them trivial |

## Research references

- [UX/UI Principles — AI cost transparency](https://uxuiprinciples.com/en/principles/ai-cost-transparency) — usage-at-action-time norms
- [OpenRouter — reliability failover](https://openrouter.ai/blog/insights/reliability-failover/) — hop transparency patterns
- [Portkey — failover routing strategies](https://portkey.ai/blog/failover-routing-strategies-for-llms-in-production) — log served model
- [UIPotion — AI response rendering](https://uipotion.com/potions/patterns/ai-response-rendering) — streaming a11y lifecycle
- [NN/G — bottom sheets](https://www.nngroup.com/articles/bottom-sheet/) — mobile overlay UX
- [Ars Technica — ChatGPT branching (Sept 2025)](https://arstechnica.com/ai/2025/09/chatgpts-new-branching-feature-is-a-good-reminder-that-ai-chatbots-arent-people/) — branch prior art
- Prior: `docs/brainstorms/2026-07-25-chat-ui-wave5-agent-ux-requirements.md` (after 6A)
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md` (R10–R12 catalog education)
