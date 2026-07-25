# Self-hosted free-model gateway

Docker stack: **LiteLLM proxy** + **config-updater sidecar** + **Redis**, fed by `llm-fallbacks` config generation.

> **Local dev only.** Binds to `127.0.0.1:4000`. For production, add TLS, firewall rules, and proper secret storage.

## Prerequisites

- Docker and Docker Compose v2
- Copy `deploy/.env.example` → `deploy/.env` and set `LITELLM_MASTER_KEY`

## Quick start

From the repo root:

```bash
cp deploy/.env.example deploy/.env
# Set LITELLM_MASTER_KEY and OPENROUTER_API_KEY in deploy/.env

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build
```

Wait for `config-init` to finish, then:

```bash
curl -s http://127.0.0.1:4000/health/liveliness
```

## Smoke test

```bash
curl -s http://127.0.0.1:4000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "free",
    "messages": [{"role": "user", "content": "Say hello in one word."}],
    "max_tokens": 16
  }'
```

Use `model: openrouter/free` for OpenRouter's meta-router instead of our ranked `free` alias chain.

## Architecture

| Service | Role |
|---------|------|
| `config-init` | One-shot: `generate_configs --deploy` into shared volume |
| `config-updater` | Regenerates configs every 6h (configurable), restarts `litellm` |
| `litellm` | OpenAI-compatible proxy on port 4000 |
| `redis` | Cache backend in generated YAML |

Generated config lives on the `config-data` volume at `/config/litellm_config_free.yaml`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LITELLM_MASTER_KEY` | Yes | Proxy admin/API key for `Authorization: Bearer` |
| `OPENROUTER_API_KEY` | Recommended | Live model discovery; `dummy` for offline/test |
| `OPENAI_API_KEY` | No | If alias chain includes OpenAI-routed models |
| `GROQ_API_KEY` | No | If alias chain includes Groq-routed models |
| `LITELLM_LOCAL_MODEL_COST_MAP` | No | `true` = skip GitHub model-price fetch |
| `UPDATE_INTERVAL_SECONDS` | No | Sidecar refresh interval (default `21600`) |
| `DATABASE_URL` | No | LiteLLM spend DB; omit for minimal local deploy |

## Manual config refresh

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  run --rm config-init
docker compose -f deploy/docker-compose.yml restart litellm
```

Or run the updater script once:

```bash
OPENROUTER_API_KEY=dummy CONFIG_DIR=/tmp/llm-fallbacks-config \
  bash deploy/scripts/update-config.sh --once
```

## Cloud deploy (Render secondary)

For the public chat demo's backup backend:

1. Create a Render web service from [`deploy/render.yaml`](render.yaml) or run [`deploy/scripts/render-setup-secondary.sh`](scripts/render-setup-secondary.sh).
2. Set `LITELLM_MASTER_KEY` as an **operator-only** secret — never ship to Pages. The browser uses the guest token on the Worker; Render accepts the master key for operator curl smoke tests until a LiteLLM virtual key exists (see [`docs/CAVEATS.md`](../docs/CAVEATS.md)).
3. Set `OPENROUTER_API_KEY` and optional provider keys. **Omit** `DATABASE_URL` entirely for minimal deploy — do not set an empty string.
4. Sync GitHub secrets via [`deploy/scripts/sync-github-secrets.sh`](scripts/sync-github-secrets.sh):
   - `LITELLM_URL` — Render URL (appended to `chat_proxy.json`)
   - `RENDER_API_KEY` + `RENDER_SERVICE_ID` — API redeploy when deploy hook is unset
   - `RENDER_DEPLOY_HOOK` — optional hook trigger

CI appends the secondary URL to `configs/chat_proxy.json` and preserves existing secondaries on Worker-only redeploys.

[`Dockerfile.gateway`](Dockerfile.gateway) generates deploy-safe YAML on boot, then runs LiteLLM on port 4000.

**Free-tier note:** Render/Koyeb spin down when idle. Expect 30–60s cold starts. Best-effort HA, not paid SLA uptime.

## `free` vs `openrouter/free`

- **`free`** — Our alias: failure-driven chain ranked by `llm-fallbacks` quality scoring.
- **`openrouter/free`** — OpenRouter's passthrough meta-router.

## Troubleshooting

- **Proxy won't start:** Check `config-init` exited OK (`docker compose logs config-init`).
- **401 locally:** Pass `Authorization: Bearer` with your `LITELLM_MASTER_KEY`.
- **401 on Render from guest token:** Expected until a LiteLLM virtual key is configured. Public demo uses Worker primary with guest token.
- **Provider errors:** Some free models need provider API keys — check logs and `.env`.
- **Sidecar can't restart proxy:** Needs `/var/run/docker.sock` (local dev only).

## Library vs deploy

`llm-fallbacks` is a Python library in `src/`. This `deploy/` directory is optional runtime packaging — not installed via `pip install llm-fallbacks`.
