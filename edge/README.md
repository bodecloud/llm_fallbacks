# llm-fallbacks Edge Proxy

Cloudflare Worker — primary OpenAI-compatible API for the [GitHub Pages chat UI](../docs/index.html).

## Setup

```bash
cd edge
npm install
cp ../docs/config.example.js ../docs/config.js  # local UI config
```

Set secrets:

```bash
npx wrangler secret put PROXY_GUEST_TOKEN
npx wrangler secret put OPENROUTER_API_KEY
# optional:
npx wrangler secret put GROQ_API_KEY
```

Update `wrangler.toml` `MODEL_CHAIN` (comma-separated LiteLLM model ids) or let CI set it from `configs/free_models_ids.txt`.

## Local dev

```bash
npm run dev
# Worker default: http://127.0.0.1:8787
```

Point `docs/config.js` `endpoints` at the dev URL.

## Deploy

```bash
npm run deploy
```

Or push to `main` — `.github/workflows/deploy-proxies.yml` deploys when `edge/` changes.

### CI deploy troubleshooting

If **Deploy Proxies** fails with `Authentication error [code: 10000]`, regenerate the Cloudflare API token and update the `CLOUDFLARE_API_TOKEN` repository secret. The token needs at least:

- **Account** → **Workers Scripts** → **Edit**
- **Account** → **Workers AI** → **Read** (or Edit)
- **Account** → **Account Settings** → **Read** (for `wrangler deploy`)

Confirm `CLOUDFLARE_ACCOUNT_ID` matches the account that owns `llm-fallbacks-proxy`.

After updating secrets, re-run **Deploy Proxies** from the Actions tab (or push any `edge/` change). If wrangler auth fails but `WORKER_URL` is set, CI exits successfully with `deployed=false` instead of failing the whole workflow.

Local deploy (bypasses CI):

```bash
npx wrangler login
npm run deploy
echo "$OPENROUTER_API_KEY" | npx wrangler secret put OPENROUTER_API_KEY
```

### Pages CI: webui build step

Pushing changes to `.github/workflows/deploy-pages.yml` requires a GitHub token with the **`workflow`** scope. Refresh the active `gh` account:

```bash
gh auth refresh -h github.com -s workflow,repo
```

Then commit and push the webui build step (builds `webui/` into `docs/assets/` on each deploy).

## Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler deploy |
| `PROXY_GUEST_TOKEN` | Guest auth (same value in Pages `config.js`) |
| `OPENROUTER_API_KEY` | Upstream calls |
| `WORKER_URL` | Pages config — deployed Worker base URL |
| `LITELLM_URL` | Pages config — Render/Koyeb LiteLLM URL |
| `RENDER_DEPLOY_HOOK` | Optional — redeploy secondary backend |

## Security

- Never commit provider API keys or guest tokens.
- CORS allowlist is set in `wrangler.toml` (`ALLOWED_ORIGINS`).
- `MAX_TOKENS_CAP` limits abuse on the public demo.
