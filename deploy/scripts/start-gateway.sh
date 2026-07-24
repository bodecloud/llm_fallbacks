#!/usr/bin/env bash
# Start LiteLLM on free PaaS (Render/Koyeb): generate deploy config then run proxy.
set -euo pipefail

CONFIG_DIR="${CONFIG_DIR:-/config}"
PORT="${PORT:-4000}"

mkdir -p "$CONFIG_DIR"

echo "Generating LiteLLM config into ${CONFIG_DIR}..."
python -m llm_fallbacks.generate_configs --output-dir "$CONFIG_DIR" --deploy

CONFIG_FILE="${CONFIG_DIR}/litellm_config_free.yaml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing ${CONFIG_FILE}" >&2
  exit 1
fi

echo "Starting LiteLLM on port ${PORT}..."
exec litellm --config "$CONFIG_FILE" --port "$PORT" --host 0.0.0.0
