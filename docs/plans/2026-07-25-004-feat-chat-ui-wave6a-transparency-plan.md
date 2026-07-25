---
title: "feat: Chat UI Wave 6A — usage badge + failover timeline"
status: completed
date: 2026-07-25
type: feat
origin: docs/brainstorms/2026-07-25-chat-ui-wave6-transparency-discovery-requirements.md
strategy: STRATEGY.md
wave: 6a
requirements: R58-R64, R88
prior_plan: docs/plans/2026-07-25-002-feat-chat-ui-wave4b-differentiation-plan.md
---

# feat: Chat UI Wave 6A — usage badge + failover timeline

> **Origin:** [Wave 6 transparency requirements](../brainstorms/2026-07-25-chat-ui-wave6-transparency-discovery-requirements.md) — 6A slice only (usage + failover timeline). Ships before Wave 5.

## Summary

Per-reply **usage/latency badge**, expandable **failover timeline** on the routing chip (ordered hops with tier skip reasons), and a **session totals** row. Client metadata only — no new proxy logging backend.

## Landed units

| Unit | What shipped |
|------|----------------|
| U1 | `RouteTrace` + orchestrator/proxy hop capture; `CompletionMeta.trace` |
| U2 | SSE usage + TTFT/total; `stream_options.include_usage` on proxy body |
| U3 | Trace + usage threaded into completion meta on success/failure |
| U4 | Routing-chip disclosure + badge + alias note (keyboard reachable) |
| U5 | `session-usage` plugin with client aggregation + session reset |
| U6 | Playwright `failover-timeline.spec.ts`; workflow registration; plugins docs |

## Verification

- `cd webui && npm test` (91+)
- `cd webui && npm run build`
- `npx playwright test tests/e2e/failover-timeline.spec.ts`

## Deferred

Wave 6B (branching, templates, share), 6C (analytics/artifacts), R86/R87, compare-column badges, Wave 5A after this merge.
