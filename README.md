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
| Database | SQLite (users, analytics, interactions) |
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
# Clone
git clone https://github.com/kavehkamali/equilima.git
cd equilima

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
```

### Production Deployment

```bash
# On your server:
ssh your-server 'bash -s' < deploy.sh
```

The deploy script:
1. Installs Node.js and Python dependencies
2. Clones/pulls the repo
3. Builds the frontend
4. Starts uvicorn on port 8080

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
│       ├── api.js             # API client
│       └── components/
│           ├── DashboardPanel.jsx
│           ├── ScreenerPanel.jsx
│           ├── ResearchPanel.jsx
│           ├── ComparePanel.jsx
│           ├── AdminPanel.jsx
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
├── deploy.sh                  # One-command deployment
├── autodeploy.py              # GitHub webhook auto-deploy
└── README.md
```

---

## Data Sources

- **Yahoo Finance** (via yfinance) — free, ~15 min delayed
- Price data cached to disk (15 min TTL for prices, 24h for fundamentals)

---

## Admin Dashboard

Access at `yourdomain.com/#admin`

Features:
- Daily views & visitors chart
- Hourly traffic distribution
- Top pages, countries, cities, referrers
- Device and browser breakdown (pie charts)
- Live visitor log with IP geolocation
- Registered user count

---

## Disclaimer

This software is for **educational and informational purposes only**. It does not provide financial, investment, or trading advice. Past performance is not indicative of future results. Always consult a qualified financial advisor before making investment decisions.

---

## License

[MIT](LICENSE) — Kaveh Kamali, 2026
