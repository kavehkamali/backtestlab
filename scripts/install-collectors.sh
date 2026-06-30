#!/usr/bin/env bash
# Install the Equilima data-platform collectors as systemd timers on Neo.
# Run once on Neo:  sudo bash scripts/install-collectors.sh
# Idempotent. Reuses the web app's .venv (duckdb/yfinance via backend/requirements.txt).
set -euo pipefail

APP_DIR="${EQUILIMA_APP_DIR:-/srv/webapps/equilima/current}"
SVC_USER="${EQUILIMA_SVC_USER:-neo}"
PY="$APP_DIR/.venv/bin/python"
# Warehouse lives in the web app's data dir (web service is ProtectHome=yes and
# can't read /home/neo, but /srv/webdata/equilima is in its ReadWritePaths).
WHPATH="${EQUILIMA_WAREHOUSE_PATH:-/srv/webdata/equilima/.equilima_data/market.duckdb}"

echo "==> App dir: $APP_DIR  user: $SVC_USER"
[ -x "$PY" ] || { echo "Missing venv python at $PY — deploy the web app first." >&2; exit 1; }

# ─── Optional: route collector egress through ProtonVPN (collectors only) ───
VPN_CONF="${EQUILIMA_VPN_CONF:-/etc/wireguard/proton.conf}"
NETNS="${EQUILIMA_VPN_NETNS:-protonvpn}"
if [ -r "$VPN_CONF" ]; then
  echo "==> VPN config found ($VPN_CONF) — collectors will egress via namespace '$NETNS'"
  chmod 600 "$VPN_CONF"
  tee /etc/systemd/system/equilima-vpn-netns.service >/dev/null <<UNIT
[Unit]
Description=Equilima collector VPN namespace (ProtonVPN WireGuard)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$APP_DIR/scripts/vpn/proton-netns.sh up
ExecStop=$APP_DIR/scripts/vpn/proton-netns.sh down

[Install]
WantedBy=multi-user.target
UNIT
  chmod +x "$APP_DIR/scripts/vpn/proton-netns.sh"
  systemctl daemon-reload
  systemctl enable --now equilima-vpn-netns.service
  # Service runs as root and drops to $SVC_USER inside the namespace.
  SVC_RUN_USER="root"
  EXEC_PREFIX="/usr/sbin/ip netns exec $NETNS /usr/bin/setpriv --reuid=$SVC_USER --regid=$SVC_USER --init-groups "
  VPN_DEPS="Requires=equilima-vpn-netns.service
After=equilima-vpn-netns.service"
else
  echo "==> No VPN config at $VPN_CONF — collectors egress directly (no VPN)"
  SVC_RUN_USER="$SVC_USER"
  EXEC_PREFIX=""
  VPN_DEPS=""
fi

echo "==> Templated collector service"
tee /etc/systemd/system/equilima-collect@.service >/dev/null <<UNIT
[Unit]
Description=Equilima data collector (%i)
After=network-online.target
Wants=network-online.target
$VPN_DEPS

[Service]
Type=oneshot
User=$SVC_RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-/etc/webapps/equilima.env
Environment=PYTHONUNBUFFERED=1
# Pin HOME + warehouse path: under VPN the unit runs as root+setpriv (HOME would
# otherwise be /root), so the DuckDB path must not depend on \$HOME.
Environment=HOME=/home/$SVC_USER
Environment=EQUILIMA_WAREHOUSE_PATH=$WHPATH
ExecStart=${EXEC_PREFIX}$PY $APP_DIR/scripts/collect.py %i
TimeoutStartSec=7200
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

echo "==> Initial schema + universe (via VPN namespace if enabled)"
mkdir -p "$(dirname "$WHPATH")"; chown "$SVC_USER:$SVC_USER" "$(dirname "$WHPATH")" 2>/dev/null || true
WH="HOME=/home/$SVC_USER EQUILIMA_WAREHOUSE_PATH=$WHPATH"
KEYS=$( grep -E '^(SEC_USER_AGENT|BEA_API_KEY|BLS_API_KEY|FRED_API_KEY)=' /etc/webapps/equilima.env 2>/dev/null | xargs )
if [ -n "$EXEC_PREFIX" ]; then
  ${EXEC_PREFIX}env $WH $KEYS "$PY" "$APP_DIR/scripts/collect.py" universe || true
else
  sudo -u "$SVC_USER" env $WH $KEYS "$PY" "$APP_DIR/scripts/collect.py" universe || true
fi

if [ -r "$VPN_CONF" ]; then
  echo "==> VPN egress check:"; "$APP_DIR/scripts/vpn/proton-netns.sh" status || true
fi

echo ""
echo "Done. Check:    systemctl list-timers 'equilima-collect-*'"
echo "Run one now:    sudo systemctl start equilima-collect@macro.service"
echo "Logs:           journalctl -u 'equilima-collect@*' -f"
echo "First backfill: sudo -u $SVC_USER $PY $APP_DIR/scripts/collect.py prices-full   (long)"
