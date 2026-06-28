#!/usr/bin/env bash
# Deploy Equilima on the private Neo backend host.
#
# Expected production layout:
#   code:    /srv/webapps/equilima/current
#   data:    /srv/webdata/equilima
#   secrets: /etc/webapps/equilima.env
#   service: equilima.service
#
# AWS should only terminate TLS/proxy traffic to the private reverse tunnel.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/webapps/equilima/current}"
DATA_DIR="${DATA_DIR:-/srv/webdata/equilima}"
ENV_FILE="${ENV_FILE:-/etc/webapps/equilima.env}"
SERVICE_NAME="${SERVICE_NAME:-equilima.service}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TORCH_INDEX_URL="${TORCH_INDEX_URL:-https://download.pytorch.org/whl/cpu}"
# AI agent sidecar (separate clone + service on this host). Best-effort.
AGENT_DIR="${EQUILIMA_AGENT_DIR:-/home/neo/equilima}"
AGENT_SERVICE="${EQUILIMA_AGENT_SERVICE:-equilima-agent.service}"
AGENT_PORT="${EQUILIMA_AGENT_PORT:-8888}"

cd "$APP_DIR"

if [ ! -r "$ENV_FILE" ]; then
  echo "Missing readable env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$DATA_DIR/.equilima_data" "$DATA_DIR/.stock_dashboard_cache"

if [ ! -d .venv ]; then
  "$PYTHON_BIN" -m venv .venv
fi

. .venv/bin/activate
python -m pip install --upgrade pip "setuptools<82" wheel

tmp_req="$(mktemp)"
awk '$1 != "torch"' backend/requirements.txt > "$tmp_req"
python -m pip install -r "$tmp_req"
rm -f "$tmp_req"
python -m pip install --index-url "$TORCH_INDEX_URL" torch

(
  cd frontend
  npm ci
  npm run build
)

sudo -n systemctl restart "$SERVICE_NAME"
sudo -n systemctl is-active "$SERVICE_NAME"

# ─── AI agent sidecar: pull latest, refresh deps, restart (best-effort) ───
# Never fail the web deploy because of the sidecar; it is independent infra.
update_agent_sidecar() {
  if [ ! -d "$AGENT_DIR/.git" ]; then
    echo "Agent sidecar clone not found at $AGENT_DIR — skipping sidecar update"
    return 0
  fi
  echo "==> Updating AI agent sidecar at $AGENT_DIR"
  ( cd "$AGENT_DIR" && git pull --ff-only ) \
    || { echo "Agent git pull failed — leaving sidecar as-is" >&2; return 0; }
  if [ -x "$AGENT_DIR/agent_env/bin/pip" ]; then
    "$AGENT_DIR/agent_env/bin/pip" install -q -r "$AGENT_DIR/requirements-agent.txt" \
      || echo "Agent dependency install reported an issue" >&2
  else
    echo "Agent venv missing at $AGENT_DIR/agent_env — run scripts/install-home-agent.sh first" >&2
  fi
  if systemctl list-unit-files 2>/dev/null | grep -q "^${AGENT_SERVICE}"; then
    sudo -n systemctl restart "$AGENT_SERVICE" || echo "Agent service restart failed" >&2
    sleep 3
    if curl -fs "http://127.0.0.1:${AGENT_PORT}/health" >/dev/null; then
      echo "Agent sidecar healthy on 127.0.0.1:${AGENT_PORT}"
    else
      echo "Agent sidecar restarted but health check pending" >&2
    fi
  else
    echo "Agent service ${AGENT_SERVICE} not installed — skipping restart"
  fi
}
update_agent_sidecar || true

web_ok=0
for _ in $(seq 1 30); do
  if curl -fs http://127.0.0.1:8080/api/health >/dev/null; then
    echo "Equilima deployed and healthy on 127.0.0.1:8080"
    web_ok=1
    break
  fi
  sleep 1
done
[ "$web_ok" = 1 ] && exit 0

echo "Equilima service restarted but health check did not pass" >&2
sudo -n systemctl is-active "$SERVICE_NAME" >&2 || true
exit 1
