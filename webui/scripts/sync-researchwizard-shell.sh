#!/usr/bin/env bash
# Sync static shell assets from ai-researchwizard (same org, user-owned).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="${RESEARCHWIZARD_REF:-master}"
BASE="https://raw.githubusercontent.com/bolabaden/ai-researchwizard/${REF}/frontend"
mkdir -p "${ROOT}/shell"
curl -fsSL "${BASE}/styles.css" -o "${ROOT}/shell/styles.css"
echo "Synced researchwizard shell styles.css @ ${REF}"
