# Product caveats register

Honest limits for the public demo and library. Complements the README demo contract and plan 002 security model.

## Public demo

| Caveat | Detail |
|--------|--------|
| **Guest token abuse** | `PROXY_GUEST_TOKEN` is in view-source / `config.js`. It is a rate-limited capability gate, not user authentication. Rotate via [`deploy/scripts/sync-github-secrets.sh`](../deploy/scripts/sync-github-secrets.sh) workflow. |
| **No SLA** | Free-tier Worker, Render, and provider quotas — best-effort failover only. |
| **Cold start** | Render LiteLLM spins down when idle; expect 30–60s on first request after idle. |
| **OpenRouter quota** | Daily free limits may exhaust; Worker falls back to Workers AI when configured. |
| **Render failover auth (SG-01)** | Browser sends guest token to all configured endpoints. Worker accepts it; **Render LiteLLM may return 401** until a LiteLLM virtual key is issued. Operator smoke uses `LITELLM_MASTER_KEY` via curl only. |
| **Stale localStorage** | Custom proxy endpoints in localStorage override merged `chat_proxy.json`. Clear site data if failover list looks wrong after deploy. |
| **Analytics gap** | `/v1/events` counters are privacy-preserving but not a full product analytics pipeline. See pulse runbook. |

## Library / CI

| Caveat | Detail |
|--------|--------|
| **Import-time network** | Setting `OPENROUTER_API_KEY` (even `dummy`) triggers enrichment at import. Use `OPENROUTER_API_KEY=dummy` in tests. |
| **Cloudflare token scope** | Deploy Proxies needs Workers Scripts Edit; auth error **10000** means regenerate token — see [workflow runbook](solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md). |
| **Provider free tiers** | README provider table reflects repo research; **verify limits on each provider's official docs** before relying on quotas in production. |

## Evidence labels (partial adoption)

Top README provider links are `[OFFICIAL]` vendor docs where noted. Full `[REPO|OFFICIAL|OPEN|UI]` relabel across all docs is deferred to a follow-up pass.
