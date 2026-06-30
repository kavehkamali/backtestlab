"""DuckDB warehouse connection + idempotent schema.

Path: $EQUILIMA_WAREHOUSE_PATH or ~/.equilima_data/market.duckdb (sits next to
the existing SQLite equilima.db). Collectors open read-write; the web app/agent
should open read_only=True.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import duckdb


def warehouse_path() -> Path:
    env = os.environ.get("EQUILIMA_WAREHOUSE_PATH", "").strip()
    if env:
        return Path(env)
    return Path.home() / ".equilima_data" / "market.duckdb"


def connect(read_only: bool = False, retries: int = 8, retry_wait: float = 1.5) -> duckdb.DuckDBPyConnection:
    """Open the warehouse. DuckDB is single-writer with an exclusive lock, so
    briefly retry when another short collector holds it. Callers reading from the
    web app should pass read_only=True and fall back to live data if this raises
    (e.g. during the long one-time backfill)."""
    p = warehouse_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if read_only and not p.exists():
        init_schema()
    last = None
    for _ in range(max(1, retries)):
        try:
            return duckdb.connect(str(p), read_only=read_only)
        except duckdb.IOException as e:
            if "lock" not in str(e).lower():
                raise
            last = e
            time.sleep(retry_wait)
    raise last


_SCHEMA = """
CREATE TABLE IF NOT EXISTS symbols (
    symbol      VARCHAR PRIMARY KEY,
    name        VARCHAR,
    asset_class VARCHAR,            -- stock|etf|crypto|commodity|index|forex|bond
    cik         VARCHAR,            -- SEC CIK (zero-padded 10) for filers
    exchange    VARCHAR,
    currency    VARCHAR,
    active      BOOLEAN DEFAULT TRUE,
    intraday    BOOLEAN DEFAULT FALSE,   -- collect intraday bars for this symbol
    added_at    TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prices_daily (
    symbol    VARCHAR,
    date      DATE,
    open      DOUBLE,
    high      DOUBLE,
    low       DOUBLE,
    close     DOUBLE,
    adj_close DOUBLE,
    volume    BIGINT,
    source    VARCHAR,
    PRIMARY KEY (symbol, date)
);

CREATE TABLE IF NOT EXISTS prices_intraday (
    symbol   VARCHAR,
    interval VARCHAR,            -- 5m | 15m | 1h
    ts       TIMESTAMP,          -- UTC bar time
    open     DOUBLE,
    high     DOUBLE,
    low      DOUBLE,
    close    DOUBLE,
    volume   BIGINT,
    source   VARCHAR,
    PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE IF NOT EXISTS corporate_actions (
    symbol VARCHAR,
    date   DATE,
    type   VARCHAR,                 -- split | dividend
    value  DOUBLE,                  -- ratio for split, amount for dividend
    source VARCHAR,
    PRIMARY KEY (symbol, date, type)
);

CREATE TABLE IF NOT EXISTS fundamentals_facts (
    cik        VARCHAR,
    symbol     VARCHAR,
    taxonomy   VARCHAR,             -- us-gaap | dei | ...
    tag        VARCHAR,             -- e.g. Revenues, NetIncomeLoss
    unit       VARCHAR,             -- USD, shares, ...
    fy         INTEGER,
    fp         VARCHAR,             -- FY | Q1..Q4
    period_end DATE,
    value      DOUBLE,
    form       VARCHAR,             -- 10-K | 10-Q | ...
    filed      DATE,
    accn       VARCHAR,             -- filing accession (distinguishes restatements)
    source     VARCHAR DEFAULT 'sec_edgar',
    -- Key by fy/fp/accn so distinct fiscal framings & amended filings don't collapse.
    PRIMARY KEY (cik, taxonomy, tag, unit, period_end, fy, fp, accn)
);

CREATE TABLE IF NOT EXISTS filings (
    cik             VARCHAR,
    symbol          VARCHAR,
    accession       VARCHAR PRIMARY KEY,
    form            VARCHAR,        -- 8-K | 10-K | 10-Q | ...
    filed           DATE,
    period          DATE,
    primary_doc_url VARCHAR,
    title           VARCHAR,
    source          VARCHAR DEFAULT 'sec_edgar'
);

-- Raw filing/press-release text kept for the DEFERRED LLM-summary track.
CREATE TABLE IF NOT EXISTS filing_text (
    accession  VARCHAR,
    section    VARCHAR,
    text       VARCHAR,
    fetched_at TIMESTAMP DEFAULT now(),
    PRIMARY KEY (accession, section)
);

-- Full Yahoo Finance snapshot per symbol (the entire .info dict as JSON) plus
-- a few extracted columns for querying. Latest snapshot upserted; refreshed
-- continuously by the info/quotes collectors.
CREATE TABLE IF NOT EXISTS yf_info (
    symbol      VARCHAR PRIMARY KEY,
    fetched_at  TIMESTAMP,
    name        VARCHAR,
    asset_class VARCHAR,
    sector      VARCHAR,
    industry    VARCHAR,
    price       DOUBLE,
    market_cap  BIGINT,
    pe_trailing DOUBLE,
    info_json   VARCHAR          -- complete yfinance .info dict, JSON-encoded
);

CREATE TABLE IF NOT EXISTS macro_series (
    series_id    VARCHAR PRIMARY KEY,
    source       VARCHAR,           -- fred | treasury | bls
    title        VARCHAR,
    units        VARCHAR,
    frequency    VARCHAR,
    last_updated TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS macro_observations (
    series_id VARCHAR,
    date      DATE,
    value     DOUBLE,
    PRIMARY KEY (series_id, date)
);

CREATE SEQUENCE IF NOT EXISTS collector_runs_seq START 1;
CREATE TABLE IF NOT EXISTS collector_runs (
    id          BIGINT DEFAULT nextval('collector_runs_seq') PRIMARY KEY,
    collector   VARCHAR,
    started_at  TIMESTAMP,
    finished_at TIMESTAMP,
    ok          BOOLEAN,
    rows        BIGINT,
    note        VARCHAR
);
"""


def init_schema() -> None:
    p = warehouse_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    con = connect()  # retries on the single-writer lock instead of failing hard
    try:
        con.execute(_SCHEMA)
        # Migrations for pre-existing DBs (CREATE IF NOT EXISTS won't alter).
        try:
            con.execute("ALTER TABLE symbols ADD COLUMN IF NOT EXISTS intraday BOOLEAN DEFAULT FALSE")
        except Exception:
            pass
    finally:
        con.close()


if __name__ == "__main__":
    init_schema()
    print(f"Initialized warehouse schema at {warehouse_path()}")
