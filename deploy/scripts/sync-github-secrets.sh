#!/usr/bin/env bash
# Push llm-fallbacks secrets to GitHub Actions (bodecloud/llm_fallbacks).
set -euo pipefail

SECRETS="${SECRETS:-$HOME/.config/secrets.env}"
REPO="${LLM_FALLBACKS_GH_REPO:-bodecloud/llm_fallbacks}"

# shellcheck source=/dev/null
source "$SECRETS"

set_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "skip $name (empty)"
    return 0
  fi
  gh secret set "$name" -R "$REPO" -b "$value"
  echo "set $name"
}

set_secret CLOUDFLARE_ACCOUNT_ID "${CLOUDFLARE_ACCOUNT_ID:-}"
set_secret CLOUDFLARE_API_TOKEN "${CLOUDFLARE_API_TOKEN:-}"
set_secret OPENROUTER_API_KEY "${OPENROUTER_API_KEY:-}"
set_secret GROQ_API_KEY "${GROQ_API_KEY:-}"
set_secret WORKER_URL "${LLM_FALLBACKS_WORKER_URL:-}"
set_secret PROXY_GUEST_TOKEN "${LLM_FALLBACKS_PROXY_GUEST_TOKEN:-llm-fallbacks-public}"
set_secret LITELLM_URL "${LLM_FALLBACKS_LITELLM_URL:-}"
set_secret RENDER_DEPLOY_HOOK "${LLM_FALLBACKS_RENDER_DEPLOY_HOOK:-}"
set_secret RENDER_API_KEY "${RENDER_API_KEY:-}"
set_secret RENDER_SERVICE_ID "${LLM_FALLBACKS_RENDER_SERVICE_ID:-}"

echo "GitHub secrets synced for $REPO"
