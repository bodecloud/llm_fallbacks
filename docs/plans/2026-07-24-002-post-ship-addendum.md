---
title: "Plan 002 post-ship addendum (as-built deltas)"
date: 2026-07-24
type: addendum
parent: docs/plans/2026-07-24-002-feat-static-chat-ha-gateway-plan.md
status: living
---

# Plan 002 post-ship addendum

This addendum records **as-built deltas** after plan 002 shipped. The original plan remains a historical RFC; do not silently edit completed units — update this file instead.

**Remediation track:** [Plan 003 audit remediation](2026-07-24-003-feat-audit-remediation-living-docs-plan.md) (if copied to repo) or Cursor living plan 4658a344.

## As-built production (July 2026)

| Surface | URL / id | Notes |
|---------|----------|-------|
| GitHub Pages | `https://bodecloud.github.io/llm_fallbacks/` | CI builds `webui/` → `docs/` |
| Cloudflare Worker | `https://llm-fallbacks-proxy.bocloud.workers.dev` | Primary; guest token auth |
| Render LiteLLM | `https://llm-fallbacks-gateway.onrender.com` | Secondary; service `srv-d9hur6vaqgkc73c6a4m0` |
| `chat_proxy.json` | Dual endpoints committed | Worker first, Render second |

## Deploy path deltas

| Plan 002 assumption | As-built |
|---------------------|----------|
| `RENDER_DEPLOY_HOOK` primary | **Render API** fallback: `RENDER_API_KEY` + `RENDER_SERVICE_ID` in `deploy-proxies.yml` |
| Hook-only secondary trigger | API POST `https://api.render.com/v1/services/{id}/deploys` when hook unset |
| Empty `DATABASE_URL` in deploy YAML | **Omitted entirely** — `generate_configs --deploy` excludes `database_url` and `allowed_routes` |
| Rate limits TBD | **Closed:** 30/min, 300/day (`wrangler.toml`) |

## Code fixes (plan 003)

| ID | Issue | Fix |
|----|-------|-----|
| F001 | `FailoverProvider` used unmerged `readRuntimeConfig()` | `loadRuntimeConfig()` in `webui/src/config.ts`; bootstrap + save refresh |
| F002 | CI reset `chat_proxy.json` to Worker-only | Merge preserves existing secondaries; dedupe order |
| F003 | Tests expected `database_url` in deploy mode | Assert key absent |

## Security decisions (SG)

| ID | Decision (v1) |
|----|---------------|
| **SG-01** | **Option A (document-first):** Browser sends guest token to all proxy endpoints. Worker accepts guest token. Render LiteLLM expects master key — **failover to Render may return 401** until a LiteLLM virtual key is issued (v1.1). Operator smoke uses master key via curl. |
| **SG-02** | Guest token rotation: atomic workflow in `deploy/scripts/sync-github-secrets.sh`; `PROXY_GUEST_TOKEN` via wrangler secret (not `[vars]`) |
| **SG-03** | `/v1/events` uses same KV rate limits as chat |

## Operational runbooks

- Cloudflare auth **10000:** [`docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md`](../solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md)
- Worker deploy skip + `WORKER_URL`: CI exits `deployed=false`; committed dual endpoints preserved
- Caveats register: [`docs/CAVEATS.md`](../CAVEATS.md)

## Remaining follow-ups

- LiteLLM virtual key automation (SG-01 option B) — deferred v1.1
- Full `[REPO|OFFICIAL|OPEN|UI]` evidence relabel across all docs
- Accessibility acceptance criteria (plan 002 open question)
- Render keep-alive cron for cold starts
