---
title: Chat UI Wave 5 — agent UX trust layer
date: 2026-07-25
status: confirmed
priority_wave: wave5-agent-ux
refreshed: 2026-07-25
origin: docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md
prior_waves: [wave1, wave2, wave3, wave4, wave4b]
blocked_by: wave6a
strategy: STRATEGY.md
---

# Chat UI Wave 5 — agent UX trust layer

## Delta (2026-07-25 refresh)

Wave 4B merged. Post-ship pressure test + best-practice scan: **ranked free failover legibility (Wave 6A) is higher leverage than agent chrome.** Sequencing flip: implement **Wave 6A before Wave 5**. Wave **5A** slimmed to **reasoning + tool-call display** only; **voice moves to optional 5B** with PWA. Product requirements for reasoning/tools unchanged — only order and 5A/5B split.

## Summary

After Wave **6A** (usage badge + failover timeline), close the remaining **2026 agent UX gap** on the static demo: **collapsible reasoning blocks** and **tool-call lifecycle cards**. Optional **5B** adds **composer voice input**, **PWA installability**, and offline read of local sessions. Stays static-first; no MCP marketplace, tool execution loop, or backend accounts.

## Problem Frame

Waves 1–4B delivered table-stakes chat plus vision, compare, and omnifail tiers. Visitors comparing to ChatGPT and Claude can still see a **2023-class agent surface**: murm-ui already receives `reasoning_delta` and `tool_call_*` stream events, but without plugins the renderer **skips reasoning** and shows tool calls as a one-line emoji placeholder. ResearchWizard **voice chrome exists but stays hidden** (Wave 1 R18).

Demand is **speculative** (no observed visitor workaround). Success is measured by demo parity with reasoning-model and agentic-chat expectations, not traffic proof. STRATEGY still anchors static Pages + edge proxies — Wave 5 is client-side trust polish, not a pivot to Open WebUI. Free proxy routes often omit reasoning/tool channels; **BYOK or mocked streams** are the primary validation path.

## Requirements

### Reasoning / thinking blocks (5A)

| ID | Requirement |
|----|-------------|
| R44 | When the active route streams **reasoning content**, assistant messages show a **collapsed thinking header** (e.g. “Thinking…” while streaming, “Thought for Ns” / “Thought Process” when complete) with expand/collapse for the full trace. |
| R45 | When the provider **does not** expose a reasoning channel, the UI shows **nothing** — no empty placeholders or fake thinking states. |
| R46 | The **final answer text** remains visually primary; reasoning uses muted styling and sits above or beside the answer without displacing it. |

### Tool-call display (read-only, 5A)

| ID | Requirement |
|----|-------------|
| R47 | Streamed tool invocations render as **lifecycle cards** with states `pending → running → success | error | cancelled`, replacing the default emoji one-liner. |
| R48 | Wave 5 is **display-only** — the public demo does not execute tools client-side or round-trip tool results unless a later wave explicitly adds it. |
| R49 | Each card shows **tool name**, **status**, and an **expandable args summary**; raw JSON is available on expand, not the default view. |

### Voice input (optional 5B — with PWA)

| ID | Requirement |
|----|-------------|
| R50 | A **mic control** in the composer uses the **Web Speech API** to dictate into the text field on supported browsers (Chromium-first). |
| R51 | Unsupported browsers show a **disabled mic** with tooltip copy explaining the limitation — not a hidden or broken button. |
| R52 | Voice **fills the composer only**; the user reviews and sends manually (no auto-send on end-of-speech in v1). |

### PWA shell (optional 5B)

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

### A. Agent UX after failover education (recommended)

Ship Wave **6A** first, then **5A** (R44–R49, R56): wire murm-ui `ThinkingPlugin` / `ToolsPlugin` and extend SSE mapping so reasoning and tool events reach the renderer. **Pros:** Identity bet (ranked failover) lands before parity chrome; reuses existing stream plumbing. **Cons:** Agent-surface parity waits one wave.

### B. Keep 5A before 6A (superseded)

Ship reasoning/tools/voice before transparency. **Pros:** Faster ChatGPT-class surface. **Cons:** Does not teach why this gateway exists; voice hygiene dilutes the slice.

### C. MCP client panel first

Ship external MCP connect + tool list before display polish. **Pros:** Power-user agent gateway story. **Cons:** Conflicts with STRATEGY “display/routing-first”; high trust surface.

**Recommendation:** **A**. Optional **5B** (voice R50–R52 + PWA R53–R55) after 5A. Defer **C** until product explicitly pivots toward agent gateway.

## Scope boundaries

**In scope (5A):** `webui/` murm-ui thinking/tools plugins, SSE event forwarding, dark-shell CSS overrides, Playwright e2e with mocked reasoning/tool streams, `docs/chat-ui-plugins.md`, `CONCEPTS.md`.

**In scope (5B, optional):** shell voice wiring, service worker in build pipeline.

**Deferred for later:**

- Client-side or Worker-side **tool execution loop**
- MCP client settings panel and remote tool invocation
- TTS / read-aloud replies, wake word, MediaRecorder + paid STT
- Generative UI / iframe widget runtime for tool results
- More than two compare columns
- Vision through web-UI tier

**Outside this product's identity (STRATEGY):**

- Open WebUI / LibreChat embedding, user accounts, cloud session sync
- MCP marketplace, RAG pipelines, org-wide tool registries
- Full offline AI (local inference without network)

## Success criteria

- After 6A ships: on a BYOK or mocked route that streams reasoning deltas, user sees collapsed thinking with working expand/collapse and a visible final answer.
- On a mocked tool-call stream, user sees lifecycle cards with status transitions — not the emoji placeholder.
- Zero-config text-only chat on the public homepage is unchanged when no reasoning/tools features activate.
- (5B) On Chrome, mic dictation fills the composer; on unsupported browsers, mic is disabled with tooltip. With SW registered, offline mode shows history read-only and blocks send with clear copy.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K9 | **Display-only tool cards in v1** | Agentic credibility without Worker tool execution or abuse surface |
| K10 | **Reasoning is provider-gated** | Matches 2026 norm; avoids fake thinking on models without a channel |
| K11 | **Voice deferred to 5B with PWA** | Hygiene vs identity; unhide shell mic after failover story ships |
| K12 | **PWA remains optional 5B** | Installability is medium value; agent display is higher leverage than SW |
| K13 | **MCP deferred** | Speculative power-user need; conflicts with display/routing-first |
| K14 | **Speculative demand recorded** | No visitor evidence; ship for ChatGPT-class parity after transparency |
| K22 | **Wave 6A before Wave 5** | STRATEGY: make ranked free failover tangible before agent chrome |

## Dependencies and assumptions

- **Wave 6A merged** before Wave 5 **implementation** starts (Wave 4B already on `main`).
- murm-ui ships `ThinkingPlugin` and `ToolsPlugin`; default renderer skips reasoning without them. `webui/src/providers/sse.ts` currently forwards **text only** — planning must extend mapping (verified in repo).
- Free proxy routes may not emit reasoning or tool streams today; BYOK or mocked e2e is the primary validation target for R44–R49.
- Web Speech API availability is Chromium-skewed; graceful degrade is mandatory for 5B.
- `docs/manifest.json` exists; no service worker today (verified).

## Outstanding questions

| ID | Question | Default for planning |
|----|----------|---------------------|
| Q7 | Reasoning default: collapsed always vs remember user expand preference? | Collapsed always; session-persist expand is follow-up |
| Q8 | Tool card placement: inline in message vs grouped timeline? | Inline above answer text, matching reasoning block |
| Q9 | Voice+PWA: same 5B PR or split? | Same 5B PR after 5A merges |

## Research references

- [UI Potion — AI response rendering patterns](https://uipotion.com/potions/patterns/ai-response-rendering) — reasoning gating, tool lifecycle cards
- [TanStack AI — thinking content](https://tanstack.com/ai/latest/docs/chat/thinking-content) — UI-only reasoning, progressive disclosure
- [UX/UI Principles — tool-use UX](https://uxuiprinciples.com/en/principles/tool-use-function-calling-ux) — show activity, human-in-the-loop norms
- [MDN — PWA offline operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) — SW + IndexedDB patterns
- [Digestible UX — reasoning UX comparison](https://www.digestibleux.com/p/how-ai-models-show-their-reasoning) — collapse by default
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md`
- Prior: `docs/brainstorms/2026-07-25-chat-ui-wave4b-differentiation-requirements.md`
- Prior: `docs/brainstorms/2026-07-25-chat-ui-wave6-transparency-discovery-requirements.md` (ships before this wave)
- Repo: murm-ui `ThinkingPlugin` / `ToolsPlugin`, `webui/src/providers/sse.ts`, `webui/shell/styles.css` (`#voiceInputBtn`)
