"""Macro / government data collector (non-LLM, Track A) — official free APIs.

- FRED (St. Louis Fed): rates, CPI, jobs, GDP, money supply. Needs free
  FRED_API_KEY; skipped with a warning if unset.
- US Treasury FiscalData: federal debt. No key.
- BLS: optional (BLS_API_KEY) — left as a documented extension point.

All upsert into macro_series + macro_observations. Attribution per provider.
"""

from __future__ import annotations

import os
from datetime import datetime

import httpx

from ..db import connect

# Curated FRED series (id -> human title).
FRED_SERIES = {
    "CPIAUCSL": "CPI (All Urban Consumers)",
    "UNRATE": "Unemployment Rate",
    "FEDFUNDS": "Federal Funds Rate",
    "GDPC1": "Real GDP",
    "DGS10": "10Y Treasury Yield",
    "DGS2": "2Y Treasury Yield",
    "DGS30": "30Y Treasury Yield",
    "T10Y2Y": "10Y-2Y Treasury Spread",
    "M2SL": "M2 Money Supply",
    "PAYEMS": "Nonfarm Payrolls",
    "INDPRO": "Industrial Production",
    "HOUST": "Housing Starts",
    "MORTGAGE30US": "30Y Mortgage Rate",
    "UMCSENT": "Consumer Sentiment",
}

FRED_BASE = "https://api.stlouisfed.org/fred"
TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"


def _upsert_series(con, series_id, source, title, units, freq):
    con.execute(
        """INSERT INTO macro_series (series_id,source,title,units,frequency,last_updated)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT (series_id) DO UPDATE SET
             title=excluded.title, units=excluded.units,
             frequency=excluded.frequency, last_updated=excluded.last_updated""",
        [series_id, source, title, units, freq, datetime.utcnow()])


def _upsert_obs(con, series_id, obs: list[tuple]):
    if not obs:
        return 0
    con.executemany(
        """INSERT INTO macro_observations (series_id,date,value) VALUES (?,?,?)
           ON CONFLICT (series_id,date) DO UPDATE SET value=excluded.value""",
        [(series_id, d, v) for d, v in obs])
    return len(obs)


def _collect_fred(con, client) -> int:
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        print("[macro] FRED_API_KEY not set — skipping FRED series")
        return 0
    n = 0
    for sid, title in FRED_SERIES.items():
        try:
            meta = client.get(f"{FRED_BASE}/series", params={
                "series_id": sid, "api_key": key, "file_type": "json"}).json()
            s = (meta.get("seriess") or [{}])[0]
            _upsert_series(con, sid, "fred", s.get("title", title),
                           s.get("units"), s.get("frequency"))
            obs_resp = client.get(f"{FRED_BASE}/series/observations", params={
                "series_id": sid, "api_key": key, "file_type": "json"}).json()
            obs = []
            for o in obs_resp.get("observations", []):
                val = o.get("value")
                if val in (None, ".", ""):
                    continue
                try:
                    obs.append((o["date"], float(val)))
                except (ValueError, KeyError):
                    pass
            n += _upsert_obs(con, sid, obs)
        except Exception as e:
            print(f"[macro] FRED {sid} failed: {type(e).__name__}")
    return n


def _collect_treasury(con, client) -> int:
    """Federal debt (debt to the penny). No key required."""
    try:
        r = client.get(
            f"{TREASURY_BASE}/v2/accounting/od/debt_to_penny",
            params={"fields": "record_date,tot_pub_debt_out_amt",
                    "sort": "-record_date", "page[size]": "400"})
        data = r.json().get("data", [])
    except Exception as e:
        print(f"[macro] Treasury debt failed: {type(e).__name__}")
        return 0
    obs = []
    for row in data:
        try:
            obs.append((row["record_date"], float(row["tot_pub_debt_out_amt"])))
        except (ValueError, KeyError):
            pass
    _upsert_series(con, "US_TOTAL_DEBT", "treasury", "US Total Public Debt", "USD", "Daily")
    return _upsert_obs(con, "US_TOTAL_DEBT", obs)


def collect_macro() -> dict:
    con = connect()
    started = datetime.utcnow()
    total = 0
    try:
        with httpx.Client(timeout=30.0, headers={"User-Agent": "Equilima Research"}) as client:
            total += _collect_fred(con, client)
            total += _collect_treasury(con, client)
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('macro',?,?,?,?,?)""",
            [started, datetime.utcnow(), True, total, ""])
    finally:
        con.close()
    print(f"[macro] done: {total} observations")
    return {"observations": total}


if __name__ == "__main__":
    collect_macro()
