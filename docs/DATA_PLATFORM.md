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
│       ├── info.py      full Yahoo .info snapshot + fast batch quotes
│       ├── edgar.py     SEC EDGAR companyfacts + filings (official API)
│       └── macro.py     BLS + US Treasury + BEA/FRED     (direct gov APIs)
├── scripts/collectors/  CLI entrypoints (one per source)
└── systemd timers:      equilima-collect-{prices,edgar,macro}.timer
```

Why DuckDB: single file, no server, columnar — fast aggregates/backtests over
millions of price rows. SQLite stays for transactional users/usage data.

## Sources & legality

Only official / free sources. Each row records provenance in `collector_runs`.

Macro is **direct-first** from public-domain federal sources — no FRED needed.

| Source | Data | Legal status |
|---|---|---|
| **SEC EDGAR** (`data.sec.gov`) | XBRL company facts, filing index, 8-K/10-K/10-Q text | Official US gov, free. MUST send a declared `User-Agent` and stay ≤10 req/s (SEC fair-access). |
| **BLS** (`api.bls.gov`) | CPI, unemployment, payrolls | Public domain, **keyless** (optional `BLS_API_KEY` raises limits to 20yr/500-per-day). |
| **US Treasury FiscalData** | total public debt | Public domain, **no key**. |
| **BEA** (`apps.bea.gov/api`) | real GDP | Public domain; needs a free `BEA_API_KEY`. Skipped if unset. |
| **FRED** (`api.stlouisfed.org`) | OPTIONAL extras: yields, M2, fed funds, mortgage, sentiment | Convenience aggregator only. Set `FRED_API_KEY` to enable; ⚠️ FRED requires "FRED®" attribution + has per-series copyright — we use it only for public-domain series. Not required. |
| **Stooq** (`stooq.com`) | free EOD price CSV | Free for personal use. |
| **yfinance** (Yahoo) | EOD prices, splits/divs, basic info | ⚠️ Unofficial Yahoo endpoint — personal-use / gray ToS. Used as convenience; Stooq/EDGAR are the defensible sources. Keep it swappable. |

Public-domain US-gov data (BLS/BEA/Treasury/SEC) is free to fetch, cache, and
redistribute — preferred over FRED, which only adds a uniform format but carries
attribution + per-series-copyright strings.

Rule: **only scrape when legal.** Prefer official APIs with documented free
access. No auth-walled or ToS-prohibited scraping. Respect robots.txt and rate
limits. Cache aggressively to minimize requests.

## Schema (DuckDB)

- `symbols(symbol PK, name, asset_class, cik, exchange, currency, active, added_at)`
- `prices_daily(symbol, date, open, high, low, close, adj_close, volume, source, PRIMARY KEY(symbol,date))`
- `corporate_actions(symbol, date, type, value, source)`  — splits, dividends
- `yf_info(symbol PK, fetched_at, name, asset_class, sector, industry, price, market_cap, pe_trailing, info_json)`  — full Yahoo .info JSON + extracts
- `fundamentals_facts(cik, symbol, taxonomy, tag, unit, fy, fp, period_end, value, form, filed, source)`
- `filings(cik, symbol, accession, form, filed, period, primary_doc_url, title, source)`
- `filing_text(accession, section, text, fetched_at)`  — raw text for Track B
- `macro_series(series_id PK, source, title, units, frequency, last_updated)`
- `macro_observations(series_id, date, value, PRIMARY KEY(series_id,date))`
- `collector_runs(id, collector, started_at, finished_at, ok, rows, note)`

## Schedule (systemd timers, Neo)

| Timer | Cadence | Collector |
|---|---|---|
| `equilima-collect-quotes` | every 30 min, Mon–Fri market hours | fast batch latest bar (continuous) |
| `equilima-collect-prices` | daily 18:30 ET (after close) | EOD prices + corporate actions |
| `equilima-collect-info` | daily 20:00 ET | full Yahoo .info snapshot per symbol |
| `equilima-collect-macro` | daily 07:00 ET | BLS + Treasury (+ optional BEA/FRED) |
| `equilima-collect-edgar` | weekly (Sun) | companyfacts + filing index |

DuckDB is single-writer; timers are staggered and each run is short. `db.connect`
retries briefly on the lock, and the read path falls back to live data if the DB
is held (e.g. during the one-time `prices-full` backfill).

Keys via `EnvironmentFile=/etc/webapps/equilima.env` — all optional for the core
(prices + BLS + Treasury run keyless): `SEC_USER_AGENT` (recommended for EDGAR),
`BEA_API_KEY` (GDP), `BLS_API_KEY` (higher limits), `FRED_API_KEY` (extra series).
Collectors are decoupled from the web
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
