#!/usr/bin/env bash
# Regenerate deploy artifacts and optionally restart the LiteLLM proxy container.
set -euo pipefail

CONFIG_DIR="${CONFIG_DIR:-/config}"
INTERVAL="${UPDATE_INTERVAL_SECONDS:-21600}"
COMPOSE_FILE="${COMPOSE_FILE:-/app/deploy/docker-compose.yml}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-llm-fallbacks-gateway}"
RESTART_LITELLM="${RESTART_LITELLM:-true}"
ONCE="${ONCE:-false}"

log() {
  printf '[update-config] %s\n' "$*"
}

generate_configs() {
  local tmpdir
  tmpdir="$(mktemp -d)"

  log "Generating deploy configs into temporary directory"
  if ! python -m llm_fallbacks.generate_configs --output-dir "$tmpdir" --deploy; then
    rm -rf "$tmpdir"
    return 1
  fi

  if [[ ! -f "$tmpdir/litellm_config_free.yaml" ]]; then
    log "ERROR: litellm_config_free.yaml was not generated"
    rm -rf "$tmpdir"
    return 1
  fi

  mkdir -p "$CONFIG_DIR"
  cp "$tmpdir/litellm_config_free.yaml" "$CONFIG_DIR/litellm_config_free.yaml.new"
  mv "$CONFIG_DIR/litellm_config_free.yaml.new" "$CONFIG_DIR/litellm_config_free.yaml"

  for artifact in free_models.json free_models_ids.txt custom_providers.json; do
    if [[ -f "$tmpdir/$artifact" ]]; then
      cp "$tmpdir/$artifact" "$CONFIG_DIR/$artifact"
    fi
  done

  rm -rf "$tmpdir"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$CONFIG_DIR/.last_updated"
  log "Config written to $CONFIG_DIR/litellm_config_free.yaml"
}

reload_proxy() {
  if [[ "$RESTART_LITELLM" != "true" ]]; then
    log "RESTART_LITELLM=false; skipping proxy restart"
    return 0
  fi

  if [[ -S /var/run/docker.sock ]] && command -v docker >/dev/null 2>&1; then
    log "Restarting litellm service via docker compose"
    docker compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT" restart litellm
    return 0
  fi

  log "WARN: docker socket unavailable; restart litellm manually to apply config"
}

run_once() {
  generate_configs
  reload_proxy
}

if [[ "${1:-}" == "--once" ]]; then
  run_once
  exit 0
fi

run_once

while true; do
  sleep "$INTERVAL"
  if generate_configs; then
    reload_proxy
  else
    log "ERROR: generation failed; keeping previous config"
  fi
done
