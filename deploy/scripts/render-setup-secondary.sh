#!/usr/bin/env bash
# Create or update the Render LiteLLM secondary for llm-fallbacks.
set -euo pipefail

SECRETS="${SECRETS:-$HOME/.config/secrets.env}"
REPO="${LLM_FALLBACKS_GH_REPO:-bodecloud/llm_fallbacks}"
SERVICE_NAME="${LLM_FALLBACKS_RENDER_SERVICE_NAME:-llm-fallbacks-gateway}"

# shellcheck source=/dev/null
source "$SECRETS"

: "${RENDER_API_KEY:?Set RENDER_API_KEY in ~/.config/secrets.env (dashboard.render.com → Account Settings → API Keys)}"
: "${LITELLM_MASTER_KEY:?Set LITELLM_MASTER_KEY in ~/.config/secrets.env}"

api() {
  local method="$1"
  local path="$2"
  shift 2
  curl -fsS -X "$method" "https://api.render.com/v1${path}" \
    -H "Authorization: Bearer ${RENDER_API_KEY}" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    "$@"
}

owner_id="${RENDER_OWNER_ID:-}"
if [ -z "$owner_id" ]; then
  owner_id="$(api GET "/owners?limit=20" | python3 -c '
import json, sys
rows = json.load(sys.stdin)
if not rows:
    raise SystemExit("No Render owners/workspaces found for this API key")
print(rows[0]["owner"]["id"])
')"
  echo "Using Render ownerId: $owner_id"
fi

service_id="${LLM_FALLBACKS_RENDER_SERVICE_ID:-}"
service_url="${LLM_FALLBACKS_LITELLM_URL:-}"

if [ -z "$service_id" ]; then
  service_id="$(api GET "/services?limit=100" | python3 -c "
import json, sys
name = sys.argv[1]
for row in json.load(sys.stdin):
    svc = row.get('service') or row
    if svc.get('name') == name:
        print(svc['id'])
        break
" "$SERVICE_NAME" || true)"
fi

env_vars_json="$(python3 <<PY
import json, os
pairs = [
    ("LITELLM_MASTER_KEY", os.environ["LITELLM_MASTER_KEY"]),
    ("OPENROUTER_API_KEY", os.environ.get("OPENROUTER_API_KEY", "")),
    ("GROQ_API_KEY", os.environ.get("GROQ_API_KEY", "")),
    ("LITELLM_LOCAL_MODEL_COST_MAP", "true"),
]
print(json.dumps([{"key": k, "value": v} for k, v in pairs if v is not None]))
PY
)"

if [ -z "$service_id" ]; then
  echo "Creating Render service $SERVICE_NAME..."
  export SERVICE_NAME owner_id env_vars_json
  create_body="$(python3 <<'PY'
import json, os
print(json.dumps({
  "type": "web_service",
  "name": os.environ["SERVICE_NAME"],
  "ownerId": os.environ["owner_id"],
  "repo": "https://github.com/bodecloud/llm_fallbacks",
  "branch": "main",
  "autoDeploy": "yes",
  "envVars": json.loads(os.environ["env_vars_json"]),
  "serviceDetails": {
    "runtime": "docker",
    "plan": "free",
    "healthCheckPath": "/health/liveliness",
    "envSpecificDetails": {
      "dockerfilePath": "deploy/Dockerfile.gateway",
      "dockerContext": "."
    }
  },
}))
PY
)"
  service_id="$(api POST "/services" -d "$create_body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or (d.get("service") or {}).get("id") or "")')"
  if [ -z "$service_id" ]; then
    echo "Create service failed:" >&2
    api POST "/services" -d "$create_body" >&2 || true
    exit 1
  fi
  echo "Created service: $service_id"
else
  echo "Service already exists: $service_id"
  export env_vars_json
  patch_body="$(python3 <<'PY'
import json, os
print(json.dumps({"envVars": json.loads(os.environ["env_vars_json"])}))
PY
)"
  api PATCH "/services/${service_id}" -d "$patch_body" >/dev/null
  echo "Updated env vars (including LITELLM_MASTER_KEY)"
fi

echo "Triggering deploy..."
api POST "/services/${service_id}/deploys" -d '{}' >/dev/null

if [ -z "$service_url" ]; then
  for _ in $(seq 1 60); do
    service_url="$(api GET "/services/${service_id}" | python3 -c '
import json, sys
data = json.load(sys.stdin)
details = data.get("serviceDetails") or {}
print(details.get("url") or "")
' || true)"
    if [ -n "$service_url" ]; then
      break
    fi
    sleep 5
  done
fi

if [ -z "$service_url" ]; then
  service_url="https://${SERVICE_NAME}.onrender.com"
fi

health_ok=false
for _ in $(seq 1 36); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${service_url}/health/liveliness" || true)"
  if [ "$code" = "200" ]; then
    health_ok=true
    break
  fi
  echo "Waiting for health (last HTTP $code)..."
  sleep 10
done

echo ""
echo "Render service id: $service_id"
echo "LITELLM_URL: $service_url"
echo "Health OK: $health_ok"
echo ""
echo "Next: copy Deploy Hook from Render Dashboard → $SERVICE_NAME → Settings"
echo "      then set LLM_FALLBACKS_RENDER_DEPLOY_HOOK in ~/.config/secrets.env"
echo "      and run: deploy/scripts/sync-github-secrets.sh"

if [ -f "$SECRETS" ]; then
  python3 - "$SECRETS" "$service_id" "$service_url" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
service_id = sys.argv[2]
service_url = sys.argv[3]
text = path.read_text(encoding="utf-8")

def upsert(key, value):
    global text
    line = f'{key}="{value}"'
    pat = rf"^{re.escape(key)}=.*$"
    if re.search(pat, text, flags=re.M):
        text = re.sub(pat, line, text, count=1, flags=re.M)
    else:
        text = text.rstrip() + "\n" + line + "\n"

upsert("LLM_FALLBACKS_RENDER_SERVICE_ID", service_id)
upsert("LLM_FALLBACKS_LITELLM_URL", service_url)
path.write_text(text, encoding="utf-8")
print(f"Updated {path} with service id and LITELLM_URL")
PY
fi

export LLM_FALLBACKS_RENDER_SERVICE_ID="$service_id"
export LLM_FALLBACKS_LITELLM_URL="$service_url"
"$(dirname "$0")/sync-github-secrets.sh"
