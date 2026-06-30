#!/usr/bin/env bash
# Bring a ProtonVPN WireGuard tunnel up INSIDE a dedicated network namespace so
# only processes launched in that namespace (the data collectors) egress through
# the VPN. The rest of the host (web app, AWS reverse tunnel, SSH) is untouched.
#
# Fail-closed: if this isn't up, `ip netns exec protonvpn ...` has no route and
# the collector fails — it never falls back to the host's real IP.
#
# Usage:  proton-netns.sh up|down|status
# Config: /etc/wireguard/proton.conf  (ProtonVPN WireGuard download, root mode)
set -euo pipefail

NETNS="${EQUILIMA_VPN_NETNS:-protonvpn}"
IF="wgproton"
CONF="${EQUILIMA_VPN_CONF:-/etc/wireguard/proton.conf}"

_val() { grep -iE "^\s*$1\s*=" "$CONF" | head -1 | cut -d= -f2- | tr -d ' \r'; }

up() {
  [ -r "$CONF" ] || { echo "Missing $CONF" >&2; exit 1; }
  local priv addr dns peer_pub endpoint
  priv=$(_val PrivateKey); addr=$(_val Address); dns=$(_val DNS)
  peer_pub=$(_val PublicKey); endpoint=$(_val Endpoint)
  [ -n "$priv" ] && [ -n "$peer_pub" ] && [ -n "$endpoint" ] || { echo "Bad conf (missing keys)"; exit 1; }

  # Idempotent: tear down a stale namespace first.
  ip netns list | grep -qw "$NETNS" && down || true

  ip netns add "$NETNS"
  ip netns exec "$NETNS" ip link set lo up

  # Create the wg device in the ROOT ns, then move it into the namespace. The
  # encrypted UDP socket stays bound to the root ns (real internet -> Proton),
  # while the tunnel interface itself lives in the namespace for apps.
  ip link add "$IF" type wireguard
  ip link set "$IF" netns "$NETNS"

  # Keep the wg config inside /etc/wireguard — `wg` is often AppArmor-confined
  # and cannot read a /tmp file (fopen: Permission denied).
  local wgconf="/etc/wireguard/.${IF}.setconf"
  ( umask 077; cat > "$wgconf" <<EOF
[Interface]
PrivateKey = $priv
[Peer]
PublicKey = $peer_pub
Endpoint = $endpoint
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF
  )
  ip netns exec "$NETNS" wg setconf "$IF" "$wgconf"
  rm -f "$wgconf"

  IFS=',' read -ra addrs <<< "$addr"
  for a in "${addrs[@]}"; do
    a=$(echo "$a" | tr -d ' '); [ -n "$a" ] && ip netns exec "$NETNS" ip addr add "$a" dev "$IF"
  done
  ip netns exec "$NETNS" ip link set "$IF" up
  ip netns exec "$NETNS" ip route add default dev "$IF"

  # Per-namespace DNS (ip netns exec bind-mounts this over /etc/resolv.conf).
  mkdir -p "/etc/netns/$NETNS"
  : "${dns:=10.2.0.1}"
  : > "/etc/netns/$NETNS/resolv.conf"
  IFS=',' read -ra dnss <<< "$dns"
  for d in "${dnss[@]}"; do
    d=$(echo "$d" | tr -d ' '); [ -n "$d" ] && echo "nameserver $d" >> "/etc/netns/$NETNS/resolv.conf"
  done
  echo "VPN namespace '$NETNS' up."
}

down() {
  ip netns list 2>/dev/null | grep -qw "$NETNS" && ip netns del "$NETNS" || true
  ip link show "$IF" >/dev/null 2>&1 && ip link del "$IF" || true
  rm -f "/etc/netns/$NETNS/resolv.conf" 2>/dev/null || true
  echo "VPN namespace '$NETNS' down."
}

status() {
  ip netns list | grep -qw "$NETNS" || { echo "down"; exit 0; }
  echo "namespace: up"
  ip netns exec "$NETNS" wg show "$IF" 2>/dev/null | grep -E "latest handshake|transfer" || true
  echo -n "egress IP: "; ip netns exec "$NETNS" curl -s --max-time 10 https://api.ipify.org || echo "(no egress)"
  echo
}

case "${1:-status}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac
