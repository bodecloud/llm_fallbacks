---
title: GitHub Pages webui CI build and non-interactive deploy credentials
date: 2026-07-24
category: workflow-issues
module: webui
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Pushing changes to .github/workflows/*.yml from OAuth CLI accounts"
  - "Deploy Proxies or wrangler deploy fails with Cloudflare auth error 10000"
  - "Pre-built docs/assets drift from webui source"
tags:
  - github-actions
  - github-pages
  - wrangler
  - workflow-scope
  - secrets-env
resolution_type: workflow_improvement
---

# GitHub Pages webui CI build and non-interactive deploy credentials

## Context

The chat UI ships as static files under `docs/` from `webui/`. Worker deploy and workflow updates require secrets and token scopes that blocked hands-off pushes during the UI migration.

## Guidance

### Pages CI builds webui on every deploy

`.github/workflows/deploy-pages.yml` runs:

```yaml
- run: cd webui && npm ci && npm run build
  env:
    APP_VERSION: ${{ github.sha }}
```

This writes `docs/assets/chat.js`, `chat.css`, `docs/index.html`, and copies shell CSS. Pre-committing built assets is optional when CI builds fresh.

### Workflow scope for pushing workflow files

GitHub OAuth tokens without `workflow` scope reject pushes touching `.github/workflows/*`. Fix:

```bash
gh auth refresh -h github.com -s workflow,repo
# or push with a PAT that has workflow + repo write:
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/bodecloud/llm_fallbacks.git" main
```

### Cloudflare Worker deploy

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Must include **Workers Scripts Edit** + **Workers AI Read**; cfat/cfut tokens work |
| `CLOUDFLARE_ACCOUNT_ID` | Account owning `llm-fallbacks-proxy` |
| `OPENROUTER_API_KEY` | Upstream for `openrouter/free` |
| `PROXY_GUEST_TOKEN` | Guest auth — set as wrangler **secret** (not `wrangler.toml` `[vars]`) |
| `WORKER_URL` | Injected into Pages `config.js`; enables graceful skip when deploy fails |

**Authentication error [code: 10000]:** Token lacks Workers Scripts Edit or wrong account. Regenerate at Cloudflare dashboard → My Profile → API Tokens → Create Token → Edit Cloudflare Workers template. Update `CLOUDFLARE_API_TOKEN` via `gh secret set` or [`deploy/scripts/sync-github-secrets.sh`](../../deploy/scripts/sync-github-secrets.sh).

**WORKER_URL skip path:** When wrangler deploy fails but `WORKER_URL` is set, `deploy-proxies.yml` sets `deployed=false` and exits 0. The committed `configs/chat_proxy.json` **dual endpoints are not overwritten**. Pages deploy still uses `WORKER_URL` from secrets at build time. Re-run Deploy Proxies after fixing the token.

Local non-interactive deploy when CI secrets are wrong:

```bash
source ~/.config/secrets.env
cd edge && npx wrangler deploy --var "MODEL_CHAIN:openrouter/free"
echo "$OPENROUTER_API_KEY" | npx wrangler secret put OPENROUTER_API_KEY
echo "$LLM_FALLBACKS_PROXY_GUEST_TOKEN" | npx wrangler secret put PROXY_GUEST_TOKEN
```

## Why This Matters

Without CI webui build, HTML/CSS/JS drift from `webui/src`. Without valid Cloudflare tokens, edge fixes never reach production even when merged. Live e2e tests catch proxy regressions only after deploy succeeds.

## When to Apply

- Any change to `webui/`, `edge/`, or deploy workflows
- After rotating Cloudflare or OpenRouter keys
- Before claiming "zero-config chat works" — run live Playwright against production URL

## Examples

**Verify production after deploy:**

```bash
PAGES_BASE_URL=https://bodecloud.github.io/llm_fallbacks/ \
  npx playwright test tests/e2e/pages-chat-live.spec.ts tests/e2e/pages-chat-zero-config.spec.ts
```

**Update repo secrets non-interactively:**

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo bodecloud/llm_fallbacks --body "$CLOUDFLARE_API_TOKEN"
```

## Related

- `edge/README.md` — token permission checklist
- `AGENTS.md` — command reference
