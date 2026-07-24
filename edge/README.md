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
