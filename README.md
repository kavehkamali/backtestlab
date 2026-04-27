# Equilima

## Security notes (ops)

- The FastAPI app serves the SPA for unknown routes; common scanner targets (e.g. `/.env`, `/.git/*`) are explicitly blocked with 404s.
- Auth can optionally require email verification before signin by setting `REQUIRE_EMAIL_VERIFIED=true`.
- Email sending supports Google Workspace SMTP relay (`smtp-relay.gmail.com`) by enabling `SMTP_ALLOW_ANON=true` and allowlisting the EC2 public IP in the Google Admin SMTP Relay settings.

**AI-powered stock analysis platform** — screener, research, charting terminal, backtesting, and market dashboard.

Live at [equilima.com](https://equilima.com)

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.9+-green.svg)
![React](https://img.shields.io/badge/react-19-blue.svg)

---

## Features

### Dashboard
- Market indices (S&P 500, NASDAQ, Dow, TSX, Russell 2000, VIX)
- Sector heatmap with color-coded performance
- Commodities, bonds, currencies, crypto, housing
- News headlines
- Period selector: 1D / 1W / 1M / 3M / 6M / YTD / 1Y

### Screener
- 590+ stocks: S&P 500, Mid Caps, Small Caps, TSX 60
- 30+ filterable columns: price, performance, technicals, fundamentals, ownership
- Interactive snowflake radar filters (drag to set thresholds)
- Column visibility toggles
- Quick presets: Oversold, Bullish, Deep Value, Small Cap, High Dividend, High Short
- Click any stock to see detail panel with chart

### Research (Seeking Alpha + Simply Wall St style)
- **Snowflake chart**: spline radar with Value, Future, Past, Health, Dividend scores
- **DCF fair value**: intrinsic value vs current price
- **Ownership pie**: Insiders / Institutions / Public
- **Risk checklist**: 10 automated health checks
- **Quant grades**: A-F ratings for valuation, growth, profitability, momentum
- **9 sub-tabs**: Summary, Ratings, Financials, Earnings, Dividends, Risk, Ownership, Peers, News
- Income statement, balance sheet, cash flow (annual + quarterly)
- Insider transactions, institutional holders, mutual fund holders
- Analyst ratings history with firm names
- Dividend growth CAGR (3Y, 5Y)

### Terminal
- Professional candlestick charts (lightweight-charts)
- Multi-chart grid: 1, 2, 4, or 6 charts
- Technical indicators: SMA, EMA, Bollinger Bands, Volume
- AI insight panel: trend, momentum, volatility, support/resistance, risk
- Watchlist sidebar with live prices
- Keyboard shortcuts

### Backtesting
- 8 strategies: SMA Crossover, EMA Crossover, RSI, MACD, Bollinger Bands, Mean Reversion, Momentum, ML Transformer
- Walk-forward validation with purged time-series splits (no data leakage)
- Transaction costs and slippage
- Metrics: Sharpe, Sortino, Calmar, max drawdown, win rate, profit factor
- Equity curve, drawdown chart, monthly returns, trade log
- Head-to-head strategy comparison

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS, Recharts, lightweight-charts |
| Backend | Python, FastAPI, yfinance, ta (technical analysis), PyTorch |
| Database | SQLite (users, analytics, articles, interactions) |
| Deployment | AWS EC2, Caddy (auto-HTTPS), Let's Encrypt |
| Auth | JWT + bcrypt, IP-based rate limiting |

---

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- pip

### Local Development

```bash
# Clone (web app only — skips TradingAgents submodule; smaller/faster)
git clone https://github.com/kavehkamali/equilima.git
cd equilima

# Optional — only if you run agent_api.py locally (see “AI research agent” below)
# git submodule update --init --recursive

# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

### Environment Variables

Create a `.env` file or export these:

```bash
# Required for admin dashboard
export EQUILIMA_ADMIN_USER=admin
export EQUILIMA_ADMIN_PASS=your_secure_password

# Optional — auto-generated if not set
export JWT_SECRET=your_jwt_secret_hex

# Articles / Learn hub — canonical & sitemap URLs (no trailing slash)
export EQUILIMA_PUBLIC_URL=https://equilima.com

# Optional — analytics “calendar day” timezone (IANA); default America/New_York (EST/EDT)
# export EQUILIMA_ANALYTICS_TZ=America/New_York

# Optional — AI agent HTTP base (default http://localhost:8888). Use when agent runs elsewhere or via SSH tunnel.
# export EQUILIMA_AGENT_URL=http://127.0.0.1:8888
```

### Production Deployment

```bash
# On your server:
ssh your-server 'bash -s' < deploy.sh
```

The deploy script:
1. Installs Node.js and Python dependencies
2. Clones/pulls the repo (without fetching the **TradingAgents** submodule unless you opt in; see below)
3. Builds the frontend
4. Starts uvicorn on port 8080

**TradingAgents submodule:** the agent stack lives in this repo (`agent_api.py`, `requirements-agent.txt`, `TradingAgents/` as a [git submodule](https://github.com/TauricResearch/TradingAgents), `scripts/setup-agent-venv.sh`). Production web boxes do **not** need it. To have `deploy.sh` run `git submodule update --init --recursive` on a host, add to `~/.equilima_env`:

```bash
export EQUILIMA_PULL_AGENT_SUBMODULE=1
```

Use that on the machine where you actually run the sidecar (for example **home-linux**), not on a minimal EC2 web-only install.

### AI research agent (intended: **home-linux** only)

The chat UI calls the main FastAPI app, which **proxies** to a separate HTTP service (`POST /chat`, `POST /quick`, `GET /health`). The default base URL is `http://localhost:8888`. You do **not** need Ollama, `agent_env/`, or the submodule on every dev machine—only on the host that runs the sidecar.

For a complete home Linux setup, including a systemd unit and AWS reverse-tunnel wiring, see [`docs/HOME_LINUX_AGENT.md`](docs/HOME_LINUX_AGENT.md).

Fast path on the home Linux host:

```bash
cd ~/equilima
git pull origin main
bash scripts/install-home-agent.sh
```

**What lives in git:** `agent_api.py` (repo root), `requirements-agent.txt`, and **`TradingAgents/`** as a submodule. **`agent_env/`** is gitignored; create it only on the agent host.

**One-time setup on home-linux** (same Equilima clone you use for the agent):

```bash
cd ~/equilima   # or your clone path
git pull origin main
git submodule update --init --recursive
bash scripts/setup-agent-venv.sh   # creates agent_env, installs deps + editable TradingAgents
# Install/run Ollama on this host only; pull models as needed.
source agent_env/bin/activate
python agent_api.py   # default 0.0.0.0:8888 — use screen/systemd if you want it always on
```

After `git pull`, run `git submodule update --init --recursive` when the submodule pointer changed, then reinstall if `requirements-agent.txt` or TradingAgents changed, and **restart** `agent_api.py`.

**Pointing the main app at the sidecar:** on the machine that runs **uvicorn** for Equilima, set the base URL (no trailing slash):

```bash
export EQUILIMA_AGENT_URL=http://127.0.0.1:8888   # same host
# or LAN / tunnel URL if the agent runs on home-linux and the app elsewhere
```

Put that in `~/.equilima_env` on the app server if you use `deploy.sh`, or in your process manager env.

**Sidecar env (examples):** `EQUILIMA_AGENT_PORT`, `EQUILIMA_OLLAMA_MODEL`, `TRADING_AGENTS_PATH`, `OLLAMA_OPENAI_BASE`.

For HTTPS, install [Caddy](https://caddyserver.com):

```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

Caddy handles SSL certificates automatically.

### Auto-Deploy (GitHub Webhook)

1. Start the webhook listener on your server:
   ```bash
   python3 autodeploy.py &
   ```

2. Add a webhook in GitHub repo Settings → Webhooks:
   - URL: `http://your-server-ip:9000/webhook`
   - Content type: `application/json`
   - Events: Push

Now every push to `main` auto-deploys.

---

## Project Structure

```
equilima/
├── backend/
│   └── app/
│       ├── main.py            # FastAPI app, routes, static serving
│       ├── auth.py            # JWT auth, signup/signin, rate limiting
│       ├── analytics.py       # Visitor tracking, admin dashboard API
│       ├── articles.py        # Learn hub articles, SEO JSON-LD, sitemap
│       ├── data_fetcher.py    # yfinance data + technical indicators
│       ├── backtester.py      # Strategy backtesting engine
│       ├── ml_model.py        # Transformer model for stock prediction
│       ├── ml_backtest.py     # Walk-forward ML backtesting
│       ├── ai_analysis.py     # Rule-based AI stock analysis
│       ├── terminal.py        # Charting terminal API endpoints
│       ├── research.py        # Seeking Alpha-style research API
│       ├── cache.py           # Disk-based price/fundamental caching
│       └── stock_lists.py     # S&P 500, Mid/Small Caps, TSX 60
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── learnNavigation.js # /learn routes (pathname + hash fallback)
│       ├── api.js             # API client
│       └── components/
│           ├── DashboardPanel.jsx
│           ├── ScreenerPanel.jsx
│           ├── ResearchPanel.jsx
│           ├── ComparePanel.jsx
│           ├── AdminPanel.jsx
│           ├── AdminArticlesTab.jsx  # Admin → Articles tab
│           ├── LearnLayout.jsx       # Public /learn listing & article pages
│           ├── AuthModal.jsx
│           ├── SnowflakeChart.jsx
│           ├── InteractiveSnowflake.jsx
│           ├── StockDetail.jsx
│           └── terminal/
│               ├── TerminalPanel.jsx
│               ├── CandlestickChart.jsx
│               ├── AiInsightPanel.jsx
│               ├── WatchlistSidebar.jsx
│               └── TerminalContext.jsx
├── agent_api.py               # FastAPI sidecar for research chat (TradingAgents + Ollama)
├── requirements-agent.txt     # Deps for agent_api.py (use with venv; not backend/requirements.txt)
├── TradingAgents/             # Git submodule — init only on hosts that run the agent
├── scripts/
│   └── setup-agent-venv.sh    # Submodule + agent_env + pip install (run on agent host)
├── deploy.sh                  # One-command deployment
├── autodeploy.py              # GitHub webhook auto-deploy
└── README.md
```

---

## Data Sources

- **Yahoo Finance** (via yfinance) — free, ~15 min delayed
- Price data cached to disk (15 min TTL for prices, 24h for fundamentals)

---

## Learn hub & articles (SEO)

Long-form content lives in the **Learn** area: public URLs under `/learn`, data in SQLite, and APIs for the React app and crawlers. The design follows common SaaS SEO patterns: **stable URLs**, **one primary topic per article**, **hub-and-spoke clustering**, **internal links** to product surfaces, and **structured data** for rich results.

### Public URLs

| URL | Purpose |
|-----|---------|
| `/learn` | Article index (published only, newest first). |
| `/learn/{slug}` | Single article (HTML body, meta tags, JSON-LD). |
| `#/learn` / `#/learn/{slug}` | **Hash fallback** if the host cannot rewrite unknown paths to `index.html`; prefer pathname URLs in production. |

The main app **Header** includes a **Learn** entry that navigates to `/learn`. Vite is configured with `appType: 'spa'` so dev and compatible hosts serve the SPA for these routes.

**Production:** Configure the reverse proxy (e.g. Caddy) so requests to `/learn` and `/learn/*` return the same `index.html` as `/`, unless you serve the SPA another way.

### Database (`articles` table)

Stored in the same SQLite file as users and analytics (`~/.equilima_data/equilima.db` by default). Created automatically on backend startup.

| Column | Description |
|--------|----------------|
| `id` | Integer primary key. |
| `slug` | **Unique**, URL segment. Lowercase letters, numbers, hyphens only (e.g. `how-to-backtest-strategies`). |
| `title` | Page title and **H1** on the public page. |
| `meta_description` | Meta description for search snippets; keep it accurate and within a sensible length (~150–160 characters is a common target). |
| `excerpt` | Short summary shown on the `/learn` listing cards. |
| `body_html` | **Full article HTML** (trusted content — only admins can edit). Use headings (`h2`, `h3`), paragraphs, lists, and **internal links** (e.g. `/learn/other-slug`, or app paths if you expose them). |
| `og_image_url` | Optional Open Graph / Twitter image; defaults to site `og-image` if empty. |
| `author_name` | Shown on the article; defaults to `Equilima`. |
| `cluster_key` | Optional **hub / topic cluster** label (e.g. `backtesting-basics`). Used for grouping in the UI and for `GET /api/articles?cluster=...`. |
| `status` | `draft` or `published`. Only **published** rows with a non-null `published_at` are public. |
| `published_at` | When the article went live (SQLite datetime string). Set automatically when first published if omitted. Cleared when moved back to `draft`. |
| `created_at`, `updated_at` | Maintenance timestamps. |

### Environment variables

| Variable | Role |
|----------|------|
| `EQUILIMA_PUBLIC_URL` | **Origin** for `canonical_url`, JSON-LD `url`, and `<loc>` entries in the sitemap (no trailing slash). Default `https://equilima.com`. **Set this in production** to match your real domain. |

### Public HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/articles` | List published articles. Query: `cluster` (optional) filters by `cluster_key`. |
| GET | `/api/articles/{slug}` | One published article: `title`, `meta_description`, `excerpt`, `body_html`, `canonical_url`, **`json_ld`** (`BlogPosting`), `og_image_url`, etc. |
| GET | `/api/sitemap-articles.xml` | XML sitemap of all published article URLs under `{EQUILIMA_PUBLIC_URL}/learn/{slug}`. |

### Admin HTTP API

Requires the same **admin JWT** as the rest of the dashboard (`Authorization: Bearer …` after `POST /api/admin/login`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/articles` | List all articles. Query: `q` (title/slug), `status` (`draft` / `published`), `limit`. |
| GET | `/api/admin/articles/{id}` | Full row for editing. |
| POST | `/api/admin/articles` | Create (JSON body: slug, title, meta fields, body_html, status, etc.). |
| PATCH | `/api/admin/articles/{id}` | Update fields. |
| DELETE | `/api/admin/articles/{id}` | Remove. |

### Admin UI

Open **`/#admin`**, sign in, then the **Articles** tab:

- Search and filter the list, **New**, **Edit**, **Save**, **Delete**.
- **Open public page** link (works when the article is **published**).
- In-editor reminders: cluster keys, internal links, `EQUILIMA_PUBLIC_URL`, sitemap URL.

### Frontend behavior (SEO in the SPA)

For `/learn` and `/learn/{slug}`, the app updates **client-side**:

- `document.title`
- `<meta name="description">`
- `<link rel="canonical">`
- Open Graph and Twitter meta tags
- A `<script type="application/ld+json" id="eq-article-jsonld">` block from the API’s `json_ld`

Crawlers that execute JavaScript can see these after render; **all** crawlers can use **`/api/sitemap-articles.xml`** and stable URLs. For maximum parity with static HTML, you could add SSR or prerender later; the current setup is a typical SPA + sitemap compromise.

### Recommended content strategy

1. **Hub and spoke:** Use `cluster_key` to group related posts; link spokes to a hub and to each other where relevant.
2. **Intent:** One main search intent per `slug`; avoid making one page compete for many unrelated queries.
3. **Internal links:** In `body_html`, link to other `/learn/...` articles and, where useful, send readers to product areas (the article template also shows CTAs for AI Agent, Screener, and Backtesting).
4. **Freshness:** Update `body_html` or republish when facts change; `updated_at` is maintained on save.

### Submitting the sitemap

Point **Google Search Console** (or similar) at:

`{EQUILIMA_PUBLIC_URL}/api/sitemap-articles.xml`

Or reference that URL from your root `sitemap.xml` or `robots.txt` (`Sitemap: …`) if you maintain those files elsewhere.

---

## Admin Dashboard

Access at `yourdomain.com/#admin`

Features:
- Daily views & visitors chart (date buckets use **US Eastern** by default, with **daylight saving** via `America/New_York`; override with `EQUILIMA_ANALYTICS_TZ` if needed)
- Hourly traffic distribution
- Top pages, countries, cities, referrers
- Device and browser breakdown (pie charts)
- Live visitor log with IP geolocation
- Registered user count
- User management (verify, enable/disable, delete)
- Newsletters / broadcast email
- **Articles** — manage Learn hub posts, drafts, and publishing

---

## Disclaimer

This software is for **educational and informational purposes only**. It does not provide financial, investment, or trading advice. Past performance is not indicative of future results. Always consult a qualified financial advisor before making investment decisions.

---

## License

[MIT](LICENSE) — Kaveh Kamali, 2026
