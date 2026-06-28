#!/usr/bin/env bash
# Update the Equilima AI agent sidecar in place: pull latest code, refresh the
# venv deps (openai-agents etc.), and restart the systemd service.
# Run on the sidecar host (e.g. Neo): bash scripts/update-agent.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_SERVICE="${EQUILIMA_AGENT_SERVICE:-equilima-agent.service}"
AGENT_PORT="${EQUILIMA_AGENT_PORT:-8888}"

cd "$ROOT"

echo "==> Pulling latest code in $ROOT"
git pull --ff-only

if [[ ! -x "$ROOT/agent_env/bin/pip" ]]; then
  echo "Agent venv missing — running full installer instead"
  exec bash "$ROOT/scripts/setup-agent-venv.sh"
fi

echo "==> Refreshing agent dependencies"
"$ROOT/agent_env/bin/pip" install -q -U -r "$ROOT/requirements-agent.txt"

if systemctl list-unit-files 2>/dev/null | grep -q "^${AGENT_SERVICE}"; then
  echo "==> Restarting $AGENT_SERVICE"
  sudo systemctl restart "$AGENT_SERVICE"
  sleep 3
else
  echo "Service $AGENT_SERVICE not installed — start manually: $ROOT/agent_env/bin/python agent_api.py"
fi

echo "==> Health check"
curl -fsS "http://127.0.0.1:${AGENT_PORT}/health" && echo "" || echo "health check pending"
