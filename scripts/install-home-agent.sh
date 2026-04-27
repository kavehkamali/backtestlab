#!/usr/bin/env bash
# One-run installer for the Equilima AI agent sidecar on a home Linux machine.
# Run from the Equilima repo:
#   bash scripts/install-home-agent.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_NAME="${SUDO_USER:-$USER}"
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
SSH_KEY="${EQUILIMA_AWS_SSH_KEY:-$HOME_DIR/.ssh/kaveh-aws-projects-ec2.pem}"
AWS_HOST="${EQUILIMA_AWS_HOST:-54.174.207.23}"
AWS_USER="${EQUILIMA_AWS_USER:-ec2-user}"
AGENT_PORT="${EQUILIMA_AGENT_PORT:-8888}"
OLLAMA_MODEL="${EQUILIMA_OLLAMA_MODEL:-gemma3:4b}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer is for the home Linux machine."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required."
  exit 1
fi

echo "==> Equilima home agent installer"
echo "Repo:       $ROOT"
echo "User:       $USER_NAME"
echo "AWS:        $AWS_USER@$AWS_HOST"
echo "SSH key:    $SSH_KEY"
echo "Port/model: $AGENT_PORT / $OLLAMA_MODEL"
echo ""

install_packages() {
  echo "==> Installing base packages"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y git python3 python3-venv python3-pip curl openssh-client
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y git python3 python3-pip curl openssh-clients
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y git python3 python3-pip curl openssh-clients
  else
    echo "Unsupported package manager. Install git, python3, python3-venv, python3-pip, curl, and ssh manually."
    exit 1
  fi
}

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    echo "==> Ollama already installed"
  else
    echo "==> Installing Ollama"
    curl -fsSL https://ollama.com/install.sh | sh
  fi

  echo "==> Enabling Ollama service if available"
  sudo systemctl enable --now ollama 2>/dev/null || true

  echo "==> Pulling Ollama model: $OLLAMA_MODEL"
  ollama pull "$OLLAMA_MODEL"
}

setup_repo() {
  echo "==> Updating submodule and Python env"
  cd "$ROOT"
  git submodule update --init --recursive
  bash scripts/setup-agent-venv.sh
}

write_agent_service() {
  echo "==> Writing /etc/systemd/system/equilima-agent.service"
  sudo tee /etc/systemd/system/equilima-agent.service >/dev/null <<EOF
[Unit]
Description=Equilima AI Agent sidecar
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$ROOT
Environment=EQUILIMA_AGENT_PORT=$AGENT_PORT
Environment=EQUILIMA_OLLAMA_MODEL=$OLLAMA_MODEL
Environment=OLLAMA_OPENAI_BASE=http://localhost:11434/v1
Environment=TRADING_AGENTS_PATH=$ROOT/TradingAgents
ExecStart=$ROOT/agent_env/bin/python $ROOT/agent_api.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
}

write_tunnel_service() {
  if [[ ! -f "$SSH_KEY" ]]; then
    echo ""
    echo "WARNING: SSH key not found: $SSH_KEY"
    echo "The agent service will be installed, but the AWS tunnel will not start until this key exists."
    echo "Set a different key path with EQUILIMA_AWS_SSH_KEY=/path/to/key.pem."
    return
  fi

  chmod 600 "$SSH_KEY"

  echo "==> Writing /etc/systemd/system/equilima-agent-tunnel.service"
  sudo tee /etc/systemd/system/equilima-agent-tunnel.service >/dev/null <<EOF
[Unit]
Description=Equilima AI Agent reverse tunnel to AWS
After=network-online.target equilima-agent.service
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
ExecStart=/usr/bin/ssh -NT \\
  -o ExitOnForwardFailure=yes \\
  -o ServerAliveInterval=30 \\
  -o ServerAliveCountMax=3 \\
  -o StrictHostKeyChecking=accept-new \\
  -i $SSH_KEY \\
  -R 127.0.0.1:$AGENT_PORT:127.0.0.1:$AGENT_PORT \\
  $AWS_USER@$AWS_HOST
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

enable_services() {
  echo "==> Enabling services"
  sudo systemctl daemon-reload
  sudo systemctl enable --now equilima-agent

  if [[ -f /etc/systemd/system/equilima-agent-tunnel.service ]]; then
    sudo systemctl enable --now equilima-agent-tunnel
  fi
}

verify() {
  echo "==> Local health check"
  sleep 3
  curl -fsS "http://127.0.0.1:$AGENT_PORT/health" || true
  echo ""
  echo ""
  echo "Done."
  echo "Check status:"
  echo "  systemctl status equilima-agent"
  echo "  systemctl status equilima-agent-tunnel"
  echo ""
  echo "Watch logs:"
  echo "  journalctl -u equilima-agent -f"
  echo "  journalctl -u equilima-agent-tunnel -f"
  echo ""
  echo "On AWS, make sure ~/.equilima_env contains:"
  echo "  export EQUILIMA_AGENT_URL=http://127.0.0.1:$AGENT_PORT"
}

install_packages
install_ollama
setup_repo
write_agent_service
write_tunnel_service
enable_services
verify

