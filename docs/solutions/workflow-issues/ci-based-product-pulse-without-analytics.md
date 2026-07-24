---
title: CI and smoke-test product pulse when analytics is not wired
date: 2026-07-24
category: workflow-issues
module: compound-engineering
problem_type: workflow_issue
component: development_workflow
severity: low
applies_when:
  - "Running ce-product-pulse on a static GitHub Pages + Worker gateway with no PostHog/Sentry"
  - "STRATEGY.md metrics exist but client instrumentation is pending"
  - "Need a founder-readable health recap without mutating production"
tags:
  - product-pulse
  - github-actions
  - smoke-tests
  - strategy-metrics
resolution_type: workflow_improvement
---

# CI and smoke-test product pulse when analytics is not wired

## Context

`llm-fallbacks` ships a public static chat UI and a Cloudflare Worker proxy. STRATEGY.md defines gateway success rate, config freshness, homepage engagement, and free-tier cost — but there is no PostHog, Sentry, or read-only DB yet. `ce-product-pulse` still produces useful reports by combining CI history, git timestamps, and live smoke checks.

## Guidance

### Configure pulse locally (gitignored)

Seed `.compound-engineering/config.local.yaml` from STRATEGY.md:

```yaml
pulse_product_name: "llm-fallbacks"
pulse_lookback_default: 24h
pulse_primary_event: "homepage_session"
pulse_value_event: "chat_completion_success"
pulse_completion_events: "zero_config_reply,dark_theme_loaded"
pulse_analytics_source: custom
pulse_tracing_source: custom
pulse_pending_metrics: "homepage_engagement,gateway_success_rate"
```

Reports save to `docs/pulse-reports/YYYY-MM-DD_HH-MM.md` (committed). Config stays machine-local.

### Data sources to query each run

| STRATEGY metric | Source without analytics | Command / signal |
|-----------------|--------------------------|------------------|
| Gateway success rate | Deploy Pages live e2e + manual stream smoke | `gh run list --workflow "Deploy GitHub Pages"`; `curl` stream to Worker |
| Config freshness lag | Daily config workflow + git log | `git log -1 --format='%ci' -- configs/free_models.json` |
| Homepage engagement | Pending | Mark `no data` until client events land |
| Free-tier cost | Proxy errors + OpenRouter 429 in CI/logs | Note 429 → Workers AI fallback is expected on demo key |

Apply the skill's **15-minute trailing buffer** on the lookback upper bound.

### Smoke commands (read-only)

```bash
# Worker health
curl -sS -m 5 "https://llm-fallbacks-proxy.bocloud.workers.dev/health"

# Stream fallback (expect SSE data: lines)
curl -sS -m 15 -N -X POST "https://llm-fallbacks-proxy.bocloud.workers.dev/v1/chat/completions" \
  -H "Authorization: Bearer llm-fallbacks-public" \
  -H "Content-Type: application/json" \
  -d '{"model":"free","messages":[{"role":"user","content":"ping"}],"stream":true,"max_tokens":16}'

# Pages asset freshness
curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' \
  "https://bodecloud.github.io/llm_fallbacks/"

# CI window (last 24h)
gh run list --repo bodecloud/llm_fallbacks --limit 30 \
  --json conclusion,workflowName,createdAt
```

### Report structure

Follow `ce-product-pulse` output: Headlines → Usage (with explicit `no data` for pending metrics) → System performance (top CI/proxy errors) → Followups. Do not include PII, message content, or API keys in saved reports.

### Example headline patterns from 2026-07-24 pulse

- Deploy Proxies failures clustered around Cloudflare auth error 10000 before cfat token refresh.
- Deploy Pages live e2e failed on Workers AI 502 until response parsing and short `MODEL_CHAIN` fixes landed.
- OpenRouter 429 on shared demo key triggers Workers AI stream fallback — not a Pages build failure.

Cross-reference existing runbooks:

- `docs/solutions/integration-issues/workers-ai-proxy-fallback-and-model-chain.md`
- `docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md`

## Why This Matters

Without analytics, teams still need a repeatable "how are we doing?" loop after shipping gateway changes. CI + smoke tests catch regressions that STRATEGY metrics would eventually quantify; documenting the substitute sources prevents every pulse run from rediscovering `gh` queries and curl one-liners.

## When to Apply

- First `ce-product-pulse` run before PostHog/Sentry wiring
- Weekly or post-deploy health checks on the public demo
- After incident windows (proxy auth, Workers AI parsing, OpenRouter quota)

## Examples

**Before:** Pulse interview blocked on missing PostHog project.

**After:** Pulse config uses `pulse_analytics_source: custom`; report states `homepage_engagement: no data (instrumentation pending)` and fills gateway/config sections from CI + smoke tests. First report: `docs/pulse-reports/2026-07-24_13-21.md`.

## Related

- `STRATEGY.md` — metric definitions
- `docs/pulse-reports/` — pulse timeline
- `AGENTS.md` — verification commands and pitfalls
