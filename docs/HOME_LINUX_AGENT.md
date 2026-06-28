# Home Linux AI Agent Setup

Equilima runs the public web app on the private Neo host (AWS is only the TLS/proxy edge), and the AI research agent is a separate sidecar service. The web app proxies `/api/agent/*` to `EQUILIMA_AGENT_URL`, which points at this sidecar.

The sidecar uses **cheap OpenAI models via the OpenAI Agents SDK** by default
(`EQUILIMA_LLM_PROVIDER=openai`, model `gpt-5-nano`). It answers questions AND
routes the user to the right workspace tab. Ollama remains a local fallback
(`EQUILIMA_LLM_PROVIDER=ollama`).

## 1. Prepare the host

Fast path:

```bash
cd ~/equilima
git pull origin main
bash scripts/install-home-agent.sh        # openai by default; EQUILIMA_LLM_PROVIDER=ollama for local
```

The installer creates `agent_env/`, installs deps (incl. `openai-agents`) and the
TradingAgents submodule, writes both systemd units, and enables them. With the
default `openai` provider it skips Ollama entirely.

### Secret: OPENAI_API_KEY

The agent service reads secrets from `EnvironmentFile=/etc/webapps/equilima.env`
(and an optional repo-root `.env`). Add the key once, then restart:

```bash
echo 'OPENAI_API_KEY=sk-...' | sudo tee -a /etc/webapps/equilima.env
sudo systemctl restart equilima-agent
curl -s 127.0.0.1:8888/health   # expect "backend":"openai","openai_key_present":true
```

Install the base packages:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip curl
```

Ollama is only needed for the local fallback (`EQUILIMA_LLM_PROVIDER=ollama`):

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

Run this on the home Linux machine. For the current AWS instance, the SSH target is `ec2-user@54.174.207.23`. This forwards the agent on `8888` and SSH on AWS-local port `2223`:

```bash
ssh -N \
  -R 127.0.0.1:8888:127.0.0.1:8888 \
  -R 127.0.0.1:2223:127.0.0.1:22 \
  ec2-user@54.174.207.23
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

## 4. Updating the sidecar

After new code is pushed to `main`:

```bash
cd ~/equilima
bash scripts/update-agent.sh    # pull + refresh deps + restart + health check
```

The web app's `deploy.sh` (run by CI on Neo) also best-effort pulls, reinstalls
deps for, and restarts the sidecar if its clone (`EQUILIMA_AGENT_DIR`, default
`/home/neo/equilima`) and `equilima-agent.service` exist — so a push can update
both. `scripts/update-agent.sh` is the manual equivalent.

## 5. Useful environment variables

The systemd unit sets these; override in `/etc/webapps/equilima.env` when needed:

```bash
EQUILIMA_AGENT_PORT=8888
EQUILIMA_LLM_PROVIDER=openai          # or: ollama
EQUILIMA_OPENAI_MODEL=gpt-5-nano      # cheapest; or gpt-5-mini / gpt-4o-mini
EQUILIMA_ROUTER_MODEL=gpt-5-nano      # fast tab-routing model
EQUILIMA_BACKEND_URL=http://127.0.0.1:8080   # so agent tools fetch live data
OPENAI_API_KEY=sk-...                 # secret — keep in the EnvironmentFile only
TRADING_AGENTS_PATH=/home/neo/equilima/TradingAgents
# ollama fallback only:
EQUILIMA_OLLAMA_MODEL=gemma3:4b
OLLAMA_OPENAI_BASE=http://localhost:11434/v1
```

Set this on the web host:

```bash
export EQUILIMA_AGENT_URL=http://127.0.0.1:8888
```
