# Edge proxy

Cloudflare Worker — primary OpenAI-compatible API for the [GitHub Pages chat UI](../docs/index.html).

## Endpoints

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/health` | GET | none | Liveness |
| `/v1/chat/completions` | POST | guest token | Chat (OpenAI-compatible) |
| `/v1/events` | POST | guest token (header or JSON `token`) | Privacy-preserving UI counters |
| `/v1/metrics` | GET | guest token | Daily event totals for pulse / STRATEGY metrics |

Allowed events: `homepage_session`, `chat_completion_success`, `zero_config_reply`, `dark_theme_loaded`. No message content or user IDs stored.

## Setup

```bash
cd edge
npm install
cp ../docs/config.example.js ../docs/config.js  # local UI config
```

Set secrets (required for deploy and `wrangler dev`):

```bash
npx wrangler secret put PROXY_GUEST_TOKEN
npx wrangler secret put OPENROUTER_API_KEY
# optional:
npx wrangler secret put GROQ_API_KEY
```

`PROXY_GUEST_TOKEN` is **not** in `wrangler.toml` `[vars]` — use a secret or `.dev.vars` locally.

Update `wrangler.toml` `MODEL_CHAIN` and `ALLOWED_MODELS`, or let CI set them from `configs/free_models_ids.txt` (chain: first line; allowlist: top 20).

## Rate limits and allowlist

- **Rate limits:** KV-backed per-IP caps (`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`). Returns HTTP 429 with `Retry-After`.
- **Turnstile (optional):** Set `TURNSTILE_SECRET` via `wrangler secret put TURNSTILE_SECRET`. Chat requests require a valid `CF-Turnstile-Response` header or an existing KV pass (`ts:pass:{ip}`, TTL 1h). When the secret is unset, verification is skipped (local dev / CI).
- **Model allowlist:** Explicit `model` values must appear in `ALLOWED_MODELS` or `MODEL_CHAIN`; alias `free` is always allowed.
- **Guest token:** Public demo gate in `docs/config.js` — not user auth. Visible in view-source; CORS does not stop server-side abuse.

## Local dev

```bash
npm run dev
# Default: http://127.0.0.1:8787
```

Point `docs/config.js` `endpoints` at the dev URL.

## Deploy

```bash
npm run deploy
```

Or push to `main` — `.github/workflows/deploy-proxies.yml` deploys when `edge/` changes.

### CI deploy troubleshooting

**Authentication error [code: 10000]:** Regenerate the Cloudflare API token and update `CLOUDFLARE_API_TOKEN`. See [`docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md`](../docs/solutions/workflow-issues/github-pages-webui-deploy-and-secrets.md).

If wrangler auth fails but `WORKER_URL` is set, CI exits with `deployed=false` — committed `chat_proxy.json` dual endpoints are preserved; Pages still serves the last known Worker URL from secrets at build time.

Local deploy (bypasses CI):

```bash
npx wrangler login
npm run deploy
echo "$OPENROUTER_API_KEY" | npx wrangler secret put OPENROUTER_API_KEY
```

### Pages CI: webui build step

Pushing `.github/workflows/deploy-pages.yml` needs a GitHub token with **`workflow`** scope:

```bash
gh auth refresh -h github.com -s workflow,repo
```

Then commit and push the webui build step.

## Required GitHub secrets

Sync from `~/.config/secrets.env` with [`deploy/scripts/sync-github-secrets.sh`](../deploy/scripts/sync-github-secrets.sh):

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy (Workers Scripts Edit + Workers AI Read) |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler deploy |
| `PROXY_GUEST_TOKEN` | Guest auth — same value in Pages `config.js` and Worker secret |
| `OPENROUTER_API_KEY` | Upstream calls |
| `GROQ_API_KEY` | Optional upstream |
| `WORKER_URL` | Pages config + graceful skip when CF deploy fails (auth 10000) |
| `LITELLM_URL` | Render LiteLLM secondary URL for `chat_proxy.json` |
| `RENDER_API_KEY` | Render API redeploy when hook unset |
| `RENDER_SERVICE_ID` | Render service id (e.g. `srv-…`) |
| `RENDER_DEPLOY_HOOK` | Optional — redeploy secondary via hook |

## Security

- Never commit provider API keys or guest tokens.
- CORS allowlist in `wrangler.toml` (`ALLOWED_ORIGINS`).
- `MAX_TOKENS_CAP` limits abuse on the public demo.
