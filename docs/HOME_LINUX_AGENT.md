# Home Linux AI Agent Setup

Equilima runs the public web app on AWS, but the AI research agent is a separate sidecar service. The AWS FastAPI app proxies `/api/agent/*` to `EQUILIMA_AGENT_URL`, which can point at a service on a home Linux machine.

## 1. Prepare the home Linux machine

Fast path:

```bash
cd ~/equilima
git pull origin main
bash scripts/install-home-agent.sh
```

The installer sets up Ollama, pulls the default model, creates `agent_env/`, installs the TradingAgents submodule, writes both systemd units, and enables them.

Install the base packages:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip curl
```

Install Ollama and pull the model used by the sidecar:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull gemma3:4b
```

Clone or update the repo:

```bash
git clone git@github.com:kavehkamali/equilima.git ~/equilima
cd ~/equilima
git pull origin main
git submodule update --init --recursive
```

Create the sidecar virtualenv:

```bash
bash scripts/setup-agent-venv.sh
```

Smoke test it:

```bash
source agent_env/bin/activate
python agent_api.py
```

In another terminal:

```bash
curl http://127.0.0.1:8888/health
curl -X POST http://127.0.0.1:8888/quick \
  -H 'Content-Type: application/json' \
  -d '{"message":"Give me a quick view on NVDA","ticker":"NVDA"}'
```

## 2. Keep it running with systemd

Copy the template unit and edit `User`, `WorkingDirectory`, and paths if your clone is not `/home/neo/equilima`:

```bash
sudo cp scripts/equilima-agent.service.example /etc/systemd/system/equilima-agent.service
sudo nano /etc/systemd/system/equilima-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now equilima-agent
sudo systemctl status equilima-agent
```

Logs:

```bash
journalctl -u equilima-agent -f
```

## 3. Connect AWS to home Linux

Recommended: expose the home sidecar to AWS with an SSH reverse tunnel so port `8888` is not open to the internet.

Run this on the home Linux machine. For the current AWS instance, the SSH target is `ec2-user@54.174.207.23`:

```bash
ssh -N -R 127.0.0.1:8888:127.0.0.1:8888 ec2-user@54.174.207.23
```

On AWS, set the Equilima backend env:

```bash
cat >> ~/.equilima_env <<'EOF'
export EQUILIMA_AGENT_URL=http://127.0.0.1:8888
EOF
```

Then restart or redeploy the AWS app:

```bash
cd ~/equilima
bash deploy.sh
```

Verify from AWS:

```bash
curl http://127.0.0.1:8888/health
curl https://equilima.com/api/agent/health
```

For a persistent tunnel, run the SSH reverse tunnel under systemd or use `autossh`.

Copy the tunnel template and edit `User`, `IdentityFile`, and the AWS host if needed:

```bash
sudo cp scripts/equilima-agent-tunnel.service.example /etc/systemd/system/equilima-agent-tunnel.service
sudo nano /etc/systemd/system/equilima-agent-tunnel.service
sudo systemctl daemon-reload
sudo systemctl enable --now equilima-agent-tunnel
sudo systemctl status equilima-agent-tunnel
```

Tunnel logs:

```bash
journalctl -u equilima-agent-tunnel -f
```

## 4. Useful environment variables

Set these on the home Linux host when needed:

```bash
export EQUILIMA_AGENT_PORT=8888
export EQUILIMA_OLLAMA_MODEL=gemma3:4b
export OLLAMA_OPENAI_BASE=http://localhost:11434/v1
export TRADING_AGENTS_PATH=/home/neo/equilima/TradingAgents
```

Set this on the AWS web host:

```bash
export EQUILIMA_AGENT_URL=http://127.0.0.1:8888
```
