---
title: murm-ui streaming plaintext tail via patch-package
date: 2026-07-25
category: tooling-decisions
module: webui
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "Long SSE replies flicker or re-layout during markdown streaming in murm-ui"
  - "Considering a murm-ui bump, fork, or CSS-only fix for stream render jank"
  - "Re-evaluating webui/patches/murm-ui+0.2.0.patch after a murm-ui upgrade"
tags:
  - murm-ui
  - patch-package
  - streaming
  - sse
  - markdown
related_components:
  - documentation
---

# murm-ui streaming plaintext tail via patch-package

## Context

Wave 4 closed the remaining “feels basic” gap on long streamed replies. murm-ui’s `MessageNode` throttled then ran full `marked.parse` + `syncDOMChildren` on every tick, so closed code fences and tables re-laid out mid-stream. Upstream bump alone did not fix it; forking murm-ui would own a full chat engine; CSS containment alone could not stop full-block reparse.

## Guidance

Prefer a **bounded `patch-package` change** on murm-ui’s message renderer:

1. While a text block is still generating, render plain text into a `.mur-streaming-text` node (`textContent`) — no markdown parse per token.
2. When generation completes, clear the plain node and run `applyMarkdown` once for the final content.
3. Keep the patch under `webui/patches/` and apply it via `postinstall: patch-package` in `webui/package.json`.
4. Style `.mur-streaming-text` in `webui/shell/chat-overrides.css` so the streaming tail matches the dark shell.

Do **not** fork murm-ui for this class of fix. Revisit the patch on every murm-ui bump: try an upstream fix first; if absent, refresh the patch against the new package version.

## Why This Matters

Full markdown reparse during SSE is the dominant source of streaming flicker on the GitHub Pages demo. A local patch is cheap to maintain, survives CI `npm ci`, and avoids coupling the product to a murm-ui fork. Losing the patch on an unpatched bump silently regresses Wave 4 acceptance (R19–R20).

## When to Apply

- Long assistant streams show full-message flash or re-highlight closed fences mid-stream.
- Evaluating murm-ui upgrades after Wave 4 shipped.
- Choosing between CSS-only mitigation, incremental markdown libraries, and dependency patches.

## Examples

**Before (upstream):** throttle timer → `applyMarkdown` on full block text every ~70ms while `generating`.

**After (patch):** during generate, `plainEl.textContent = block.text`; on complete, `applyMarkdown` once. Playwright `tests/e2e/streaming-polish.spec.ts` asserts plain-text stream then final markdown/code.

## Related

- [murm-ui light theme on dark shell](../ui-bugs/murm-ui-light-theme-on-dark-shell.md) — complementary embed pitfalls (`data-theme`, overrides)
- Plan: `docs/plans/2026-07-25-001-feat-chat-ui-wave4-polish-plan.md` (KTD1/KTD2)
- Patch: `webui/patches/murm-ui+0.2.0.patch`
- Operator note: `docs/chat-ui-plugins.md` (Wave 4 streaming polish one-liner)
