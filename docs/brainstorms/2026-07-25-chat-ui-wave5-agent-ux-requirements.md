---
title: Chat UI Wave 5 — agent UX trust layer
date: 2026-07-25
status: confirmed
priority_wave: wave5-agent-ux
origin: docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md
prior_waves: [wave1, wave2, wave3, wave4, wave4b]
strategy: STRATEGY.md
---

# Chat UI Wave 5 — agent UX trust layer

## Summary

After Wave 4B (vision, compare, omnifail tiers), close the remaining **2026 agent UX gap** on the static demo: **collapsible reasoning blocks**, **tool-call lifecycle cards**, and **composer voice input** on supported browsers. Optional follow-on slice adds **PWA installability** and offline read of local sessions. Stays static-first; no MCP marketplace, tool execution loop, or backend accounts.

## Problem Frame

Waves 1–4 delivered table-stakes chat (model picker, routing chip, export/import, streaming polish). Wave 4B addresses multimodal and compare. Visitors comparing to ChatGPT and Claude still see a **2023-class agent surface**: murm-ui already receives `reasoning_delta` and `tool_call_*` stream events, but the bundled renderer **skips reasoning** (`continue`) and shows tool calls as a one-line emoji placeholder. ResearchWizard **voice chrome exists but stays hidden** (Wave 1 R18) — which now reads as unfinished rather than intentionally unsupported.

Demand is **speculative** (no observed visitor workaround). Success is measured by demo parity with reasoning-model and agentic-chat expectations, not traffic proof. STRATEGY still anchors static Pages + edge proxies — Wave 5 is client-side trust polish, not a pivot to Open WebUI.

## Requirements

### Reasoning / thinking blocks

| ID | Requirement |
|----|-------------|
| R44 | When the active route streams **reasoning content**, assistant messages show a **collapsed thinking header** (e.g. “Thinking…” while streaming, “Thought for Ns” when complete) with expand/collapse for the full trace. |
| R45 | When the provider **does not** expose a reasoning channel, the UI shows **nothing** — no empty placeholders or fake thinking states. |
| R46 | The **final answer text** remains visually primary; reasoning uses muted styling and sits above or beside the answer without displacing it. |

### Tool-call display (read-only v1)

| ID | Requirement |
|----|-------------|
| R47 | Streamed tool invocations render as **lifecycle cards** with states `pending → running → success | error | cancelled`, replacing the default emoji one-liner. |
| R48 | Wave 5 is **display-only** — the public demo does not execute tools client-side or round-trip tool results unless a later wave explicitly adds it. |
| R49 | Each card shows **tool name**, **status**, and an **expandable args summary**; raw JSON is available on expand, not the default view. |

### Voice input

| ID | Requirement |
|----|-------------|
| R50 | A **mic control** in the composer uses the **Web Speech API** to dictate into the text field on supported browsers (Chromium-first). |
| R51 | Unsupported browsers show a **disabled mic** with tooltip copy explaining the limitation — not a hidden or broken button. |
| R52 | Voice **fills the composer only**; the user reviews and sends manually (no auto-send on end-of-speech in v1). |

### PWA shell (optional Wave 5B slice)

| ID | Requirement |
|----|-------------|
| R53 | A **service worker** caches the app shell, static assets, and `free_models.json` for repeat visits. |
| R54 | When offline, users can **read prior sessions** from IndexedDB; **chat send is disabled** with a clear “offline” message — not a silent failure. |
| R55 | Service worker updates prompt the user to **reload** before applying, avoiding mid-stream breakage during active chat. |

### Trust and demo constraints

| ID | Requirement |
|----|-------------|
| R56 | Reasoning and tool UI **degrade gracefully** on routes that emit text-only SSE — zero-config proxy chat behavior is unchanged. |
| R57 | Voice and PWA features include **no new server endpoints** on the public Worker; optional BYOK routes behave the same as today. |

## Approaches considered

### A. Agent UX trust layer (recommended)

Ship R44–R52 in one wave: murm-ui plugins + SSE mapping extensions so reasoning and tool events reach the renderer; unhide and wire `#voiceInputBtn`. **Pros:** Highest perception ROI vs carrying cost; reuses existing stream plumbing and shell CSS. **Cons:** Provider-dependent reasoning visibility on free routes.

### B. PWA-first

Prioritize R53–R55 before reasoning/tools/voice. **Pros:** Repeat-visitor retention, installable icon. **Cons:** Does not fix the “feels like 2023 agent chat” comparison; SW build pipeline adds CI surface before visible UX win.

### C. MCP client panel first

Ship external MCP connect + tool list before display polish. **Pros:** Power-user agent gateway story. **Cons:** CORS/auth complexity, conflicts with “ranked free model demo” positioning; high trust surface for a speculative need.

**Recommendation:** **A**, then **B** as a separate PR-sized slice (5B). Defer **C** until product explicitly pivots toward agent gateway. **Extend** existing murm-ui block rendering and `FailoverProvider` SSE mapping — net-new plugins, not a fork.

## Scope boundaries

**In scope:** `webui/`, murm-ui plugin(s), SSE event forwarding, shell voice wiring, optional SW in build pipeline, Playwright e2e with mocks, `docs/chat-ui-plugins.md`, `CONCEPTS.md`.

**Deferred for later:**

- Client-side or Worker-side **tool execution loop**
- MCP client settings panel and remote tool invocation
- TTS / read-aloud replies, wake word, MediaRecorder + paid STT
- Generative UI / iframe widget runtime for tool results
- More than two compare columns (Wave 4B scope)
- Vision through web-UI tier (Wave 4B deferral)

**Outside this product's identity (STRATEGY):**

- Open WebUI / LibreChat embedding, user accounts, cloud session sync
- MCP marketplace, RAG pipelines, org-wide tool registries
- Full offline AI (local inference without network)

## Success criteria

- On a BYOK or proxy route that streams reasoning deltas, user sees collapsed thinking with working expand/collapse and a visible final answer.
- On a mocked tool-call stream, user sees lifecycle cards with status transitions — not the emoji placeholder.
- On Chrome, mic dictation fills `#chatinput`; on Safari/Firefox, mic is disabled with explanatory tooltip.
- Zero-config text-only chat on the public homepage is unchanged when no reasoning/tools/voice features activate.
- (5B) With SW registered, repeat visit loads from cache; offline mode shows history read-only and blocks send with clear copy.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K9 | **Display-only tool cards in v1** | Agentic credibility without Worker tool execution or abuse surface |
| K10 | **Reasoning is provider-gated** | Matches 2026 norm; avoids fake thinking on models without a channel |
| K11 | **Voice = composer dictation, no TTS** | Reuses hidden shell affordance; legacy `docs/legacy/chatgpt-web/` patterns inform UX, not wholesale port |
| K12 | **PWA as optional 5B slice** | Installability is medium value; agent UX polish is higher leverage for “not simplistic” perception |
| K13 | **MCP deferred** | Speculative power-user need; CORS and auth cost disproportionate to demo thesis |
| K14 | **Speculative demand recorded** | No visitor evidence yet; ship for ChatGPT-class parity after Wave 4B lands |

## Dependencies and assumptions

- **Wave 4B merged** before Wave 5 **implementation** starts — avoids parallel large diffs on `FailoverProvider` and composer. (Planning for Wave 5 may proceed earlier.)
- murm-ui stream event types for `reasoning_delta` and `tool_call_*` already exist in the bundled renderer; `webui/src/providers/sse.ts` currently forwards **text only** — planning must extend mapping (verified in repo).
- Free proxy routes may not emit reasoning or tool streams today; BYOK paths are the primary validation target for R44–R49.
- Web Speech API availability is Chromium-skewed; graceful degrade is mandatory.
- `docs/manifest.json` exists; no service worker today (verified).

## Outstanding questions

| ID | Question | Default for planning |
|----|----------|---------------------|
| Q7 | Reasoning default: collapsed always vs remember user expand preference? | Collapsed always; session-persist expand is follow-up |
| Q8 | Tool card placement: inline in message vs grouped timeline? | Inline above answer text, matching reasoning block |
| Q9 | PWA: ship in same release as 5A or separate 5B PR? | Separate 5B PR after 5A merges |

## Research references

- [UI Potion — AI response rendering patterns](https://uipotion.com/potions/patterns/ai-response-rendering) — reasoning gating, tool lifecycle cards
- [TanStack AI — thinking content](https://tanstack.com/ai/latest/docs/chat/thinking-content) — UI-only reasoning, progressive disclosure
- [UX/UI Principles — tool-use UX](https://uxuiprinciples.com/en/principles/tool-use-function-calling-ux) — show activity, human-in-the-loop norms
- [MDN — PWA offline operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) — SW + IndexedDB patterns
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md` (deferred tool/reasoning, PWA)
- Prior: `docs/brainstorms/2026-07-25-chat-ui-wave4b-differentiation-requirements.md` (Wave 4B out-of-scope list)
- Repo: `docs/assets/chat.js` (murm-ui reasoning/tool render hooks), `docs/legacy/chatgpt-web/` (prior voice UX), `webui/shell/styles.css` (`#voiceInputBtn` styles)
