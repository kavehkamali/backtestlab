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

for _ in $(seq 1 30); do
  if curl -fs http://127.0.0.1:8080/api/health >/dev/null; then
    echo "Equilima deployed and healthy on 127.0.0.1:8080"
    exit 0
  fi
  sleep 1
done

echo "Equilima service restarted but health check did not pass" >&2
sudo -n systemctl is-active "$SERVICE_NAME" >&2 || true
exit 1
