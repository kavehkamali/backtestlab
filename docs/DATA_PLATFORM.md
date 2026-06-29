# Equilima Data Platform

Background services on the **Neo** host that collect free, legal market &
government data from the internet and cache it in a proper analytics database,
so the app and agent read from a fast, complete local warehouse instead of
hammering live APIs per request.

Two delivery tracks:

- **Track A — non-LLM (this phase):** data that only needs fetch + arrange +
  clean. Historical EOD prices, corporate actions, XBRL financial facts, filing
  index, macro/government series. Deterministic, cheap, scheduled.
- **Track B — LLM-summarized (DEFERRED, not started — expensive):** press
  releases / 8-K narratives, earnings-call transcripts, customer-relations &
  sentiment. Needs cost controls. See *Future work* below. We collect the raw
  text in Track A so Track B has something to summarize later.

## Architecture

```
Neo (private Dell host)
├── DuckDB warehouse: ~/.equilima_data/market.duckdb         (analytics store)
├── SQLite (existing): ~/.equilima_data/equilima.db          (users/usage — unchanged)
├── backend/app/datawarehouse/                               (importable: read + collect)
│   ├── db.py            DuckDB connection + idempotent schema
│   ├── universe.py      symbol set -> symbols table (+ SEC CIK map)
│   └── sources/
│       ├── prices.py    EOD OHLCV + splits/dividends   (yfinance, Stooq fallback)
│       ├── edgar.py     SEC EDGAR companyfacts + filings (official API)
│       └── macro.py     FRED + US Treasury + BLS         (official APIs)
├── scripts/collectors/  CLI entrypoints (one per source)
└── systemd timers:      equilima-collect-{prices,edgar,macro}.timer
```

Why DuckDB: single file, no server, columnar — fast aggregates/backtests over
millions of price rows. SQLite stays for transactional users/usage data.

## Sources & legality

Only official / free sources. Each row records provenance in `collector_runs`.

| Source | Data | Legal status |
|---|---|---|
| **SEC EDGAR** (`data.sec.gov`) | XBRL company facts, filing index, 8-K/10-K/10-Q text | Official US gov, free. MUST send a declared `User-Agent` and stay ≤10 req/s (SEC fair-access). |
| **FRED** (`api.stlouisfed.org`) | rates, CPI, jobs, GDP, money supply | Free API key (env `FRED_API_KEY`). Attribution required. |
| **US Treasury FiscalData** | debt, deficit, yields | Official, free, no key. |
| **BLS** (`api.bls.gov`) | CPI, unemployment, payrolls | Free; optional key raises rate limit. |
| **Stooq** (`stooq.com`) | free EOD price CSV | Free for personal use. |
| **yfinance** (Yahoo) | EOD prices, splits/divs, basic info | ⚠️ Unofficial Yahoo endpoint — personal-use / gray ToS. Used as convenience; Stooq/EDGAR are the defensible sources. Keep it swappable. |

Rule: **only scrape when legal.** Prefer official APIs with documented free
access. No auth-walled or ToS-prohibited scraping. Respect robots.txt and rate
limits. Cache aggressively to minimize requests.

## Schema (DuckDB)

- `symbols(symbol PK, name, asset_class, cik, exchange, currency, active, added_at)`
- `prices_daily(symbol, date, open, high, low, close, adj_close, volume, source, PRIMARY KEY(symbol,date))`
- `corporate_actions(symbol, date, type, value, source)`  — splits, dividends
- `fundamentals_facts(cik, symbol, taxonomy, tag, unit, fy, fp, period_end, value, form, filed, source)`
- `filings(cik, symbol, accession, form, filed, period, primary_doc_url, title, source)`
- `filing_text(accession, section, text, fetched_at)`  — raw text for Track B
- `macro_series(series_id PK, source, title, units, frequency, last_updated)`
- `macro_observations(series_id, date, value, PRIMARY KEY(series_id,date))`
- `collector_runs(id, collector, started_at, finished_at, ok, rows, note)`

## Schedule (systemd timers, Neo)

| Timer | Cadence | Collector |
|---|---|---|
| `equilima-collect-prices` | daily ~18:00 ET (after close) | EOD prices + corporate actions |
| `equilima-collect-macro` | daily ~07:00 ET | FRED/Treasury/BLS series |
| `equilima-collect-edgar` | weekly (Sun) | companyfacts + filing index |

Secrets/keys via `EnvironmentFile=/etc/webapps/equilima.env` (`FRED_API_KEY`,
optional `BLS_API_KEY`, `SEC_USER_AGENT`). Collectors are decoupled from the web
app and survive its restarts. Monitor with `journalctl -u equilima-collect-*`.

## Universe

Existing `stock_lists.py` (SP500 + mid/small + TSX60) **plus** the adaptive
research asset classes (ETFs, crypto, commodities, indices). CIKs resolved from
SEC `company_tickers.json`. Expandable to the full SEC ticker list later.

## Read path

App/agent read warehouse-first (complete, fast), falling back to live yfinance
only when a symbol/series isn't cached yet. A coverage/health endpoint reports
freshness per collector.

## Future work — Track B (LLM, DEFERRED, do NOT start yet)

Expensive; gated until the non-LLM layer is solid. Plan:
- Summarize 8-K / press-release text (`filing_text`) into structured events.
- Earnings-call transcript summaries + tone.
- Customer-relations / sentiment digests.
- Cost controls: cheapest model (gpt-5-nano), batch, dedupe, cache by accession,
  hard monthly token budget. Store under `*_summary` tables keyed by source id.
