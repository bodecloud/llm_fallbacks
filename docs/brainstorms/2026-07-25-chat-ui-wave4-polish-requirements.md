---
title: Chat UI Wave 4 — streaming polish & UX micro
date: 2026-07-25
status: confirmed
priority_wave: wave4-polish
origin: docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md
prior_waves: [wave1, wave2, wave3]
strategy: STRATEGY.md
---

# Chat UI Wave 4 — streaming polish & UX micro

## Summary

Close the remaining “feels basic” gaps **without** multimodal upload or model compare. Prioritize the original **R5** streaming-markdown polish, then low-cost UX micro: **import conversation**, clearer **empty state**, and a **keyboard-shortcuts** affordance. Stays static-first and murm-ui–compatible.

## Problem

Waves 1–3 (R1–R4, R6–R18, R10–R14) shipped table-stakes chat UX. Visitors still perceive jank during long SSE replies because assistant markdown re-renders the full block on each throttle tick. Export exists but import does not — sessions feel trapped. First-run empty state and shortcuts are easy to miss on the embedded shell.

## Requirements

### Streaming & rendering (R5 carryover)

| ID | Requirement |
|----|-------------|
| R19 | Assistant **streaming text** renders without visible full-message flicker or layout jump during active SSE — completed blocks stay stable while only the tail updates. |
| R20 | Code blocks and tables **do not re-highlight or re-layout** on every token once their fence/table row is closed. |
| R21 | Streaming remains **accessible**: `aria-live="polite"` on the feed; completion announced without re-reading the entire message. |

### Session portability (symmetry with R13)

| ID | Requirement |
|----|-------------|
| R22 | Users **import** a previously exported Markdown or JSON transcript into a **new** IndexedDB session (file picker; no server upload). |
| R23 | Import preserves **user/assistant turn order** and plain text; malformed files show a clear error without corrupting existing sessions. |
| R24 | Sidebar offers **Copy session link** when hash routing is enabled (`#/chat/{id}`), with tooltip that the link is same-browser only (see `docs/CAVEATS.md`). |

### UX micro

| ID | Requirement |
|----|-------------|
| R25 | **Empty state** names the ranked-`free` value prop and one primary action (“Send a message” / “Pick a model”) without ResearchWizard dead chrome. |
| R26 | **Keyboard shortcuts** sheet (e.g. `?` or footer link): Enter send, Shift+Enter newline, Escape stop generation, `/` focus composer — matches murm-ui behavior where applicable. |
| R27 | Optional **compact shortcut hints** on first visit (dismissible, `localStorage` flag); no modal blocking send. |

## Approaches considered

### A. Throttle + tail-only DOM (recommended)

Reduce perceived flicker by ensuring only the **active streaming block** mutates DOM; rely on murm-ui throttle where present and add a first-party plugin only if tail isolation is insufficient. **Pros:** Smallest diff; no markdown library swap. **Cons:** May require murm-ui patch or version bump if root cause is full `syncDOMChildren` replace.

### B. Incremental markdown renderer swap

Adopt an incremental block parser (industry pattern: parse deltas, memoize closed blocks) via murm-ui extension or fork. **Pros:** Best long-term perf. **Cons:** Higher carrying cost; couples us to renderer maintenance.

### C. UX-only (skip R5)

Ship R22–R27 only. **Pros:** Fast. **Cons:** Leaves the most visible “cheap chat UI” signal unfixed.

**Recommendation:** **A first**, spike B only if A cannot meet R19–R20 in one wave. Ship R22–R27 in the same PR for cohesive “polish” release.

## Scope boundaries

**In scope:** `webui/`, Playwright e2e, `docs/CAVEATS.md`, `docs/chat-ui-plugins.md`.

**Out of scope (unchanged from July 24 brainstorm):**

- Vision/file upload, side-by-side model compare, tool-call/reasoning UI, PWA offline shell
- Cloud session sync, user accounts, Open WebUI embedding
- Full TypeScript port of Python discovery

**Explicitly deferred:**

- Conversation **merge** (import into existing session with dedupe)
- Custom themes beyond existing dark shell
- Voice input, MCP panels (remain hidden)

## Success criteria

- Side-by-side manual test: 500+ token streamed reply shows no full-body flash; code fence stable after closing backticks.
- Import round-trip: export MD → import → messages visible and sendable in new session.
- Playwright: import happy path + hash link copy smoke (where testable).
- First-time visitor reads empty-state copy and finds `?` shortcuts without opening Failover settings.

## Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K1 | Wave 4A before multimodal/compare | User priority; lowest risk vs STRATEGY static budget |
| K2 | Import creates **new** session | Avoids IndexedDB merge bugs; matches export as portable artifact |
| K3 | R5 fix prefers murm-ui-compatible path | Forking murm-ui is last resort |
| K4 | Copy link complements R14 | Makes hash routing discoverable without implying cloud share |

## Dependencies & assumptions

- Waves 1–3 merged and deployed (PRs #13, #14) before Wave 4 ships to `main`.
- murm-ui `MessageNode` uses throttled full-block markdown today; R19–R20 may need upstream coordination or pinned version bump.
- Export JSON schema from Wave 3 is the import contract.

## Outstanding questions

| ID | Question | Default |
|----|----------|---------|
| Q1 | Patch murm-ui in-repo vs npm bump? | Try npm bump / plugin first; patch only if blocked |
| Q2 | Import MD: strict format only vs best-effort `## User`/`## Assistant`? | Best-effort parser with strict JSON path |
| Q3 | Shortcuts sheet modal vs slide panel? | Small modal overlay (shell pattern) |

## Research references

- [Jason Laster — Chat UI best practices (2026)](https://www.jasonlaster.com/posts/2026-04-25-chat-ui)
- [Performant AI markdown renderer](https://tigerabrodi.blog/how-to-build-a-performant-ai-markdown-renderer)
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md` (R5, deferred list)
