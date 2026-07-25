---
title: Chat UI error handling and recovery UX
date: 2026-07-26
topic: chat-ui-error-handling
---

# Chat UI Error Handling and Recovery UX

## Summary

Add persistent error display, retry affordance, and per-message copy to the Chat UI so that failures are visible, actionable, and don't silently vanish after 3.5 seconds. This extends the Wave 5A agent UX surface (reasoning + tool cards) with the reliability layer that makes it trustworthy in production.

---

## Problem Frame

The Chat UI currently has three related reliability gaps that degrade the user experience on the public demo and in BYOK deployments:

1. **Errors vanish silently.** When a request fails (rate limit, timeout, auth error, proxy unavailable), the UI shows a transient status bar message (`showStatusMessage`) that auto-clears after 3500 ms. Users have no way to see what went wrong or recover without re-sending the prompt manually.

2. **No retry affordance.** There is no retry button, no suggested fix (e.g., "Try a different model"), and no error detail expansion. Failed requests require the user to reconstruct context and re-send.

3. **No per-message interaction.** Users can copy a session link but cannot copy individual assistant responses. There is no feedback mechanism (thumbs up/down) to signal response quality, and the empty state has no onboarding hints or suggested prompts.

These gaps are documented in multiple runbooks (`docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md`, `docs/solutions/integration-issues/workers-ai-proxy-fallback-and-model-chain.md`) and recurring pulse reports. They affect the same users who interact with the Chat UI daily — the public demo visitors and BYOK proxy users.

Error handling is a natural extension of the Wave 5A work: we added reasoning blocks and tool cards on top of the existing SSE stream; error handling adds the reliability layer below it.

---

## Requirements

**Error visibility**

- R1. When a request fails, the UI shows a **persistent error banner** above the message list (not a transient toast) with the error type and a brief human-readable message. The banner remains visible until dismissed or until the next successful request.
- R2. The error banner includes an **expandable detail** that reveals the full error object (status code, provider, timestamp) when the user clicks "Details."
- R3. On bootstrap failure (e.g., `#chatMount` render error), the UI shows a **recoverable error state** with a "Reload" button instead of replacing the mount point with a bare `<p>` tag.

**Retry and recovery**

- R4. Each failed message gets a **Retry** button that re-sends the same prompt to the same model/provider without requiring the user to retype.
- R5. When a retry succeeds, the error banner is dismissed and the new response replaces the failed one.
- R6. When a retry exhausts the retry budget (3 attempts), the banner suggests switching to a different model or proxy rather than offering a fourth identical retry.

**Per-message copy**

- R7. Each assistant message includes a **Copy** button that copies the full response text to the clipboard, independent of the session-link copy.

**Scope boundaries**

- **In scope:** Error banner component, retry logic, per-message copy, bootstrap error recovery — all in `webui/src/` under the existing plugin/shell architecture.
- **Deferred:** Feedback ratings (thumbs up/down), message search, session rename/delete, font size controls, theme toggle. These are independent UX features that don't depend on error handling.
- **Outside this product's identity:** Persistent error logging to an analytics backend (requires server-side instrumentation — out of scope for a static-first Chat UI).

---

## Success Criteria

- After implementation: when a stream fails mid-way or a request errors, users see a persistent banner with the error type, not a toast that vanishes in 3.5 seconds.
- Retry button re-sends the failed prompt and displays the new response inline.
- Per-message copy works independently of session-link copy.
- Bootstrap failure shows a reload button, not a dead `<p>` tag.
- All new behavior degrades gracefully on text-only routes (no assumptions about reasoning/tool event channels).

---

## Key Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| K15 | Errors are **persistent banners**, not toasts | Transient toasts were documented as a UX gap in multiple runbooks; persistence ensures users can act on errors |
| K16 | Retry reuses the same prompt/model context | Users should not have to reconstruct context; the failed message's prompt is available in the message history |
| K17 | Copy targets response text only, not reasoning blocks | Reasoning blocks are intermediate model state; the final answer is what users want to reuse |
| K18 | Bootstrap error uses a reload button, not a full-page replacement | A reload button preserves the app shell and gives a recovery path instead of a dead screen |

---

## Dependencies / Assumptions

- The Chat UI state management in `webui/src/main.ts` already tracks message history in a mutable list — retry can re-use the last user message from that list.
- The SSE provider (`webui/src/providers/sse.ts`) already emits error events that are currently only surfaced as toasts; the retry logic needs to re-invoke the same SSE stream with the same parameters.
- Error taxonomy exists in `webui/src/providers/errors.ts` (`ChatRouteError` with `RateLimitError`, `QuotaError`, `ColdStartError`, `AuthError`, `ProxyUnavailableError`) — the banner can surface these types directly.
- The `#chatMount` DOM element already exists; replacing it entirely on error (current behavior) is a known anti-pattern documented in `docs/CAVEATS.md`.

---

## Outstanding Questions

| ID | Question | Default for planning |
|----|----------|---------------------|
| Q1 | Should the error banner auto-dismiss after a successful subsequent request, or stay until explicitly dismissed? | Auto-dismiss on success — less visual noise for users who recover quickly |
| Q2 | How many retry attempts before suggesting a different model? | 3 attempts, then suggest model/proxy switch |
| Q3 | Should the retry button appear inline on the failed message or as a global action in the error banner? | Inline on the failed message — context is clear and matches the pattern of "fix this specific thing" |

---

## Research references

- Prior: `docs/brainstorms/2026-07-25-chat-ui-wave5-agent-ux-requirements.md` — Wave 5A (reasoning + tool cards)
- Prior: `docs/brainstorms/2026-07-24-chat-ui-improvements-requirements.md` — Base chat UI improvements brainstorm
- Repo: `webui/src/providers/errors.ts` — existing error taxonomy
- Repo: `webui/src/main.ts` — current toast-only error surfacing (lines 277–283 bootstrap error handling)
- Repo: `webui/src/providers/sse.ts` — SSE stream with error emission
- Runbook: `docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md` — deploy-related error patterns
- Runbook: `docs/solutions/integration-issues/workers-ai-proxy-fallback-and-model-chain.md` — 502 fallback patterns