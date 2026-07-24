---
title: Cloudflare Worker proxy 502 on stream fallback and OpenRouter rate limits
date: 2026-07-24
category: integration-issues
module: edge
problem_type: integration_issue
component: tooling
symptoms:
  - "Live chat shows HTTP 502 Workers AI failed after OpenRouter returns 429"
  - "Deploy Proxies CI fails with Cloudflare Authentication error code 10000"
  - "Non-stream requests return OpenRouter 429 JSON instead of Workers AI text"
root_cause: wrong_api
resolution_type: code_fix
severity: high
tags:
  - cloudflare-worker
  - workers-ai
  - openrouter
  - model-chain
  - proxy-fallback
related_components:
  - webui
  - github-actions
---

# Cloudflare Worker proxy 502 on stream fallback and OpenRouter rate limits

## Problem

The public GitHub Pages chat calls `llm-fallbacks-proxy` with `model=free`. When OpenRouter rate-limits (`429`), the Worker should fall back to Cloudflare Workers AI and stream an OpenAI-compatible SSE response. Production returned `502 Workers AI failed`, breaking zero-config live Playwright tests.

## Symptoms

- `curl` stream to `/v1/chat/completions` with `model=free` → `{"error":{"message":"Workers AI failed"}}`
- Same Worker with a non-`free` model (e.g. direct fallback path) → valid assistant text
- CI **Deploy Proxies** → `Authentication error [code: 10000]` when `CLOUDFLARE_API_TOKEN` secret is stale or lacks Workers Scripts Edit

## What Didn't Work

- Parsing only `{ response: string }` from `env.AI.run()` — Workers AI now often returns OpenAI-shaped `choices[].message.content`
- Redeploying edge code without fixing `CLOUDFLARE_API_TOKEN` — CI still failed auth
- Long `MODEL_CHAIN` (first 10 ids from `free_models_ids.txt`) — each unsupported provider (`chatgpt/*`, `gemini/*`) still triggered upstream fetches before Workers AI, exhausting Worker budget on the `free` path

## Solution

1. **Parse all Workers AI response shapes** in `edge/src/index.ts`:

```typescript
function extractWorkersAIContent(result: unknown): string | null {
  // handles string | { response } | { choices[0].message.content } | nested result
}
```

2. **Skip unsupported chain entries locally** before `fetch()` — only attempt `openrouter` and `groq` when keys exist.

3. **Deploy demo chain as `openrouter/free` only** in `.github/workflows/deploy-proxies.yml`:

```bash
CHAIN=$(head -n 1 ../configs/free_models_ids.txt | paste -sd, -)
```

4. **Use a Workers AI API token with AI permissions** for `CLOUDFLARE_API_TOKEN` (cfat/cfut tokens work; zone-only fp6tj tokens do not). Local deploy via `source ~/.config/secrets.env && npx wrangler deploy` when CI secrets are wrong.

5. **Default model** `@cf/meta/llama-3.1-8b-instruct-fast` (non-deprecated).

## Why This Works

OpenRouter 429 is expected on the public demo key. Fallback only runs after the chain loop; a 10-model chain with eight unsupported providers added latency/subrequests so Workers AI never ran reliably on `model=free` streams. Response parsing failed silently when AI returned chat-completions JSON instead of legacy `{ response }`.

## Prevention

- Keep `MODEL_CHAIN` short for the public Worker (single alias or openrouter-only).
- Add live Playwright tests that hit the real proxy (`tests/e2e/pages-chat-live.spec.ts`).
- Document required Cloudflare token scopes in `edge/README.md`.
- Smoke test after deploy:

```bash
curl -sN -X POST "$WORKER_URL/v1/chat/completions" \
  -H "Authorization: Bearer llm-fallbacks-public" \
  -H "Content-Type: application/json" \
  -d '{"model":"free","messages":[{"role":"user","content":"Say pong"}],"stream":true,"max_tokens":32}'
```

## Related Issues

- `edge/README.md` — CI deploy troubleshooting
- `configs/chat_proxy.json` — published Worker URL for zero-config UI
