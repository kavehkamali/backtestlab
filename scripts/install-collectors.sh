#!/usr/bin/env bash
# Install the Equilima data-platform collectors as systemd timers on Neo.
# Run once on Neo:  sudo bash scripts/install-collectors.sh
# Idempotent. Reuses the web app's .venv (duckdb/yfinance via backend/requirements.txt).
set -euo pipefail

APP_DIR="${EQUILIMA_APP_DIR:-/srv/webapps/equilima/current}"
SVC_USER="${EQUILIMA_SVC_USER:-neo}"
PY="$APP_DIR/.venv/bin/python"

echo "==> App dir: $APP_DIR  user: $SVC_USER"
[ -x "$PY" ] || { echo "Missing venv python at $PY — deploy the web app first." >&2; exit 1; }

echo "==> Templated collector service"
tee /etc/systemd/system/equilima-collect@.service >/dev/null <<UNIT
[Unit]
Description=Equilima data collector (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=$SVC_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-/etc/webapps/equilima.env
Environment=PYTHONUNBUFFERED=1
ExecStart=$PY $APP_DIR/scripts/collect.py %i
TimeoutStartSec=3600
Nice=10
UNIT

write_timer() {  # name  oncalendar  instance
  echo "==> Timer equilima-collect-$1"
  tee "/etc/systemd/system/equilima-collect-$1.timer" >/dev/null <<UNIT
[Unit]
Description=Equilima $1 collector

[Timer]
OnCalendar=$2
Persistent=true
Unit=equilima-collect@$3.service

[Install]
WantedBy=timers.target
UNIT
}

write_timer prices "Mon..Fri 18:30 America/New_York"          prices
write_timer macro  "*-*-* 07:00 America/New_York"             macro
write_timer edgar  "Sun 05:00 America/New_York"                edgar
write_timer info   "*-*-* 20:00 America/New_York"             info
write_timer quotes "Mon..Fri 09..16:00/30 America/New_York"   quotes

echo "==> Enable timers"
systemctl daemon-reload
systemctl enable --now \
  equilima-collect-prices.timer equilima-collect-macro.timer equilima-collect-edgar.timer \
  equilima-collect-info.timer equilima-collect-quotes.timer

echo "==> Initial schema + universe"
sudo -u "$SVC_USER" env $( [ -r /etc/webapps/equilima.env ] && cat /etc/webapps/equilima.env | grep -E '^(FRED_API_KEY|SEC_USER_AGENT|BLS_API_KEY)=' | xargs ) "$PY" "$APP_DIR/scripts/collect.py" universe || true

echo ""
echo "Done. Check:    systemctl list-timers 'equilima-collect-*'"
echo "Run one now:    sudo systemctl start equilima-collect@macro.service"
echo "Logs:           journalctl -u 'equilima-collect@*' -f"
echo "First backfill: sudo -u $SVC_USER $PY $APP_DIR/scripts/collect.py prices-full   (long)"
