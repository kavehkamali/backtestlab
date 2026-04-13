#!/usr/bin/env bash
# One-shot: init TradingAgents submodule + local venv for agent_api.py (repo root).
# Requires Python 3.10+ (TradingAgents). Ollama must be running separately for local LLM.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Submodule: TradingAgents"
git submodule update --init --recursive

if [[ ! -d agent_env ]]; then
  echo "==> Creating venv agent_env/"
  python3 -m venv agent_env
fi
# shellcheck disable=SC1091
source agent_env/bin/activate

echo "==> pip install (agent wrapper + TradingAgents editable)"
pip install -U pip wheel
pip install -r requirements-agent.txt
pip install -e ./TradingAgents

echo ""
echo "Done. Start the sidecar:"
echo "  cd \"$ROOT\" && source agent_env/bin/activate && python agent_api.py"
echo "(Default http://0.0.0.0:8888 — set EQUILIMA_AGENT_URL on the FastAPI host if needed.)"
