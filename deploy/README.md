# Self-Hosted Free-Model Gateway

Local development stack: **LiteLLM Proxy** + **config-updater sidecar** + **Redis**, powered by `llm-fallbacks` config generation.

> **Local development only.** Binds the proxy to `127.0.0.1:4000`. For production, add TLS, firewall rules, and secret management.

## Prerequisites

- Docker and Docker Compose v2
- Copy `deploy/.env.example` to `deploy/.env` and set at least `LITELLM_MASTER_KEY`

## Quick start

From the repository root:

```bash
cp deploy/.env.example deploy/.env
# Edit deploy/.env — set LITELLM_MASTER_KEY and OPENROUTER_API_KEY

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build
```

Wait for `config-init` to complete, then check proxy health:

```bash
curl -s http://127.0.0.1:4000/health/liveliness
```

## Smoke test (chat completion)

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

Use `model: openrouter/free` for OpenRouter's own meta-router instead of the self-hosted ranked fallback chain.

## Architecture

| Service | Role |
|---------|------|
| `config-init` | One-shot: runs `generate_configs --deploy` into shared volume |
| `config-updater` | Every 6h (configurable): regenerates configs and restarts `litellm` |
| `litellm` | OpenAI-compatible proxy on port 4000 |
| `redis` | Cache backend referenced by generated YAML |

Generated config lives on the `config-data` Docker volume at `/config/litellm_config_free.yaml`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LITELLM_MASTER_KEY` | Yes | Proxy admin/API key; use in `Authorization: Bearer` header |
| `OPENROUTER_API_KEY` | Recommended | Live model discovery; use `dummy` only for offline/test |
| `OPENAI_API_KEY` | No | If alias chain includes OpenAI-routed models |
| `GROQ_API_KEY` | No | If alias chain includes Groq-routed models |
| `LITELLM_LOCAL_MODEL_COST_MAP` | No | Set to `true` to skip GitHub model-price fetch |
| `UPDATE_INTERVAL_SECONDS` | No | Sidecar refresh interval (default `21600`) |
| `DATABASE_URL` | No | LiteLLM spend DB; leave empty for minimal local deploy |

## Manual config refresh

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env \
  run --rm config-init
docker compose -f deploy/docker-compose.yml restart litellm
```

Or run the updater script once locally:

```bash
OPENROUTER_API_KEY=dummy CONFIG_DIR=/tmp/llm-fallbacks-config \
  bash deploy/scripts/update-config.sh --once
```

## Cloud deploy (Render / Koyeb)

For the public chat demo secondary backend:

1. Create a Render web service from [`deploy/render.yaml`](render.yaml) (or connect the repo manually).
2. Set `LITELLM_MASTER_KEY` to the same value as GitHub secret `PROXY_GUEST_TOKEN`.
3. Set `OPENROUTER_API_KEY` and optional provider keys.
4. Add `RENDER_DEPLOY_HOOK` and `LITELLM_URL` to GitHub repo secrets for CI + Pages config.

The container uses [`Dockerfile.gateway`](Dockerfile.gateway) — generates deploy-safe YAML on boot, then runs LiteLLM on port 4000.

**Free-tier note:** Render/Koyeb spin down when idle; expect 30–60s cold starts. This is best-effort HA, not paid SLA uptime.

## `free` vs `openrouter/free`

- **`free`** — Self-hosted alias: failure-driven fallback chain ranked by `llm-fallbacks` quality scoring (see plan in `docs/plans/`).
- **`openrouter/free`** — OpenRouter's passthrough meta-router (unchanged).

## Troubleshooting

- **Proxy won't start:** Ensure `config-init` exited successfully (`docker compose logs config-init`).
- **401 on chat requests:** Pass `Authorization: Bearer` with your `LITELLM_MASTER_KEY`.
- **Provider errors:** Some free models require provider API keys; check logs and `.env`.
- **Sidecar can't restart proxy:** Requires `/var/run/docker.sock` mount (local dev only).

## Library vs deploy

`llm-fallbacks` remains a Python library in `src/`. This `deploy/` directory is optional runtime packaging — not installed via `pip install llm-fallbacks`.
