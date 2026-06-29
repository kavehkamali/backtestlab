# Equilima — agent & contributor guide

Free AI stock-research app: chat agent + adaptive research + screener + macro.

## Topology
- **Neo** (private Dell host, `neo-OptiPlex-7040`): runs everything — web app
  (FastAPI `:8080` + built frontend, `equilima.service`), the AI agent sidecar
  (`agent_api.py` `:8888`, `equilima-agent.service`), DBs, and the data
  collectors. **AWS** = TLS/proxy edge only (Caddy → reverse SSH tunnel → Neo).
- Push to `main` → GitHub Actions → `deploy.sh` on Neo (rebuilds web + restarts
  the agent). See `docs/NEO_AWS_DEPLOYMENT.md`.

## Major pieces
- **Web app**: `backend/app` (FastAPI) + `frontend` (React/Vite). Data via
  yfinance + caches.
- **AI agent**: `agent_core.py` (OpenAI Agents SDK, cheap `gpt-5-nano`) +
  `agent_api.py` (FastAPI sidecar). Answers questions AND routes the user to the
  right workspace tab. Backend proxies `/api/agent/*`. See `docs/HOME_LINUX_AGENT.md`.
- **Adaptive research**: `/api/research/{symbol}` returns `asset_class`
  (stock/crypto/commodity/etf/index/forex/bond); the frontend renders a
  class-specific page. `/api/search` = live Yahoo symbol lookup.
- **Data platform** (in progress): background collectors on Neo build a DuckDB
  warehouse of historical prices, financials, filings, and macro/gov data. See
  **`docs/DATA_PLATFORM.md`** — non-LLM track active; LLM-summarization track
  deferred.

## Secrets
Local: gitignored `.env`. Prod: `/etc/webapps/equilima.env` (loaded via systemd
`EnvironmentFile`). Keys: `OPENAI_API_KEY`, `JWT_SECRET`. Data platform keys are
all optional (core macro/prices run keyless): `SEC_USER_AGENT` (EDGAR),
`BEA_API_KEY` (GDP), `BLS_API_KEY`, `FRED_API_KEY` (extras). Never commit secrets.

## Conventions
- Auth = JWT (72h) in `localStorage.eq_token`; authenticated users are
  un-gated. Anonymous users hit a soft usage gate (`backend/app/usage.py`).
- Only collect data from official/free sources, legally, rate-limited. yfinance
  is convenience-only (gray ToS) — prefer SEC EDGAR / FRED / Treasury / Stooq.

## TODO / future work
Tracked in this session's task list and `docs/DATA_PLATFORM.md` (Track B / LLM
summarization is DEFERRED — do not start without explicit go-ahead; it's the
expensive path).
