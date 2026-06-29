"""Macro / government data collector (non-LLM, Track A).

Direct-first from public-domain US-gov sources (no FRED dependency required):
- US Treasury FiscalData  -> federal debt + deficit            (no key)
- BLS                     -> CPI, unemployment, payrolls        (keyless; optional BLS_API_KEY)
- BEA                     -> real GDP                           (needs free BEA_API_KEY; skipped if unset)
- FRED                    -> OPTIONAL fallback for extras (yields, M2, ...) if FRED_API_KEY set

Public-domain federal data — free to cache/redistribute. We still tag the source
per series in macro_series for clean attribution.
"""

from __future__ import annotations

import os
from datetime import datetime

import httpx

from ..db import connect

TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service"
BLS_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BEA_URL = "https://apps.bea.gov/api/data"
FRED_BASE = "https://api.stlouisfed.org/fred"

# BLS series (public domain). id -> (warehouse series_id, title, units)
BLS_SERIES = {
    "CUUR0000SA0":     ("CPI", "CPI-U All Items (NSA)", "Index 1982-84=100"),
    "LNS14000000":     ("UNEMPLOYMENT", "Unemployment Rate", "%"),
    "CES0000000001":   ("PAYROLLS", "Total Nonfarm Payrolls", "Thousands"),
}

# Optional FRED extras not covered by the direct sources above.
FRED_EXTRAS = {
    "FEDFUNDS": "Federal Funds Rate",
    "DGS2": "2Y Treasury Yield", "DGS10": "10Y Treasury Yield", "DGS30": "30Y Treasury Yield",
    "T10Y2Y": "10Y-2Y Spread", "M2SL": "M2 Money Supply",
    "INDPRO": "Industrial Production", "HOUST": "Housing Starts",
    "MORTGAGE30US": "30Y Mortgage Rate", "UMCSENT": "Consumer Sentiment",
}


def _upsert_series(con, series_id, source, title, units, freq):
    con.execute(
        """INSERT INTO macro_series (series_id,source,title,units,frequency,last_updated)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT (series_id) DO UPDATE SET
             title=excluded.title, units=excluded.units,
             frequency=excluded.frequency, last_updated=excluded.last_updated""",
        [series_id, source, title, units, freq, datetime.utcnow()])


def _upsert_obs(con, series_id, obs):
    obs = [(series_id, d, v) for d, v in obs if d and v is not None]
    if not obs:
        return 0
    con.executemany(
        """INSERT INTO macro_observations (series_id,date,value) VALUES (?,?,?)
           ON CONFLICT (series_id,date) DO UPDATE SET value=excluded.value""", obs)
    return len(obs)


# ─── Treasury (no key) ───
def _get_json(client, url, params, attempts=3):
    """Treasury occasionally drops the connection (RemoteProtocolError) — retry."""
    last = None
    for _ in range(attempts):
        try:
            return client.get(url, params=params).json()
        except Exception as e:
            last = e
    raise last


def _collect_treasury(con, client) -> int:
    n = 0
    try:
        data = _get_json(client, f"{TREASURY_BASE}/v2/accounting/od/debt_to_penny", {
            "fields": "record_date,tot_pub_debt_out_amt", "sort": "-record_date",
            "page[size]": "500"}).get("data", [])
        obs = [(r["record_date"], _f(r.get("tot_pub_debt_out_amt"))) for r in data]
        _upsert_series(con, "US_TOTAL_DEBT", "treasury", "US Total Public Debt", "USD", "Daily")
        n += _upsert_obs(con, "US_TOTAL_DEBT", obs)
    except Exception as e:
        print(f"[macro] Treasury debt failed: {type(e).__name__}")
    return n


# ─── BLS (keyless, optional key) ───
def _bls_date(year, period):
    p = str(period)
    if p.startswith("M") and p != "M13":
        return f"{year}-{int(p[1:]):02d}-01"
    if p.startswith("Q"):
        q = int(p[1:]); return f"{year}-{(q-1)*3+1:02d}-01" if 1 <= q <= 4 else None
    if p in ("A01", "M13"):
        return f"{year}-01-01"
    return None


def _collect_bls(con, client) -> int:
    key = os.environ.get("BLS_API_KEY", "").strip()
    end = datetime.utcnow().year
    start = end - (19 if key else 9)  # keyless v1 limits = 10yr window
    body = {"seriesid": list(BLS_SERIES.keys()), "startyear": str(start), "endyear": str(end)}
    if key:
        body["registrationkey"] = key
    try:
        resp = client.post(BLS_URL, json=body, headers={"Content-Type": "application/json"}).json()
    except Exception as e:
        print(f"[macro] BLS request failed: {type(e).__name__}")
        return 0
    if resp.get("status") != "REQUEST_SUCCEEDED":
        print(f"[macro] BLS: {resp.get('status')} {resp.get('message')}")
        return 0
    n = 0
    for s in resp.get("Results", {}).get("series", []):
        sid = s.get("seriesID")
        wid, title, units = BLS_SERIES.get(sid, (sid, sid, ""))
        _upsert_series(con, wid, "bls", title, units, "Monthly")
        obs = []
        for d in s.get("data", []):
            dt = _bls_date(d.get("year"), d.get("period"))
            if dt:
                obs.append((dt, _f(d.get("value"))))
        n += _upsert_obs(con, wid, obs)
    return n


# ─── BEA (optional free key) ───
def _collect_bea(con, client) -> int:
    key = os.environ.get("BEA_API_KEY", "").strip()
    if not key:
        print("[macro] BEA_API_KEY not set — skipping GDP (get a free key at apps.bea.gov)")
        return 0
    try:
        r = client.get(BEA_URL, params={
            "UserID": key, "method": "GetData", "datasetname": "NIPA",
            "TableName": "T10106", "Frequency": "Q", "Year": "ALL", "ResultFormat": "JSON"})
        rows = r.json().get("BEAAPI", {}).get("Results", {}).get("Data", [])
    except Exception as e:
        print(f"[macro] BEA GDP failed: {type(e).__name__}")
        return 0
    obs = []
    for row in rows:
        if str(row.get("LineNumber")) != "1":  # line 1 = GDP
            continue
        tp = row.get("TimePeriod", "")  # e.g. 2024Q1
        if "Q" in tp:
            y, q = tp.split("Q")
            obs.append((f"{y}-{(int(q)-1)*3+1:02d}-01", _f(str(row.get("DataValue", "")).replace(",", ""))))
    _upsert_series(con, "REAL_GDP", "bea", "Real GDP (chained $)", "Billions", "Quarterly")
    return _upsert_obs(con, "REAL_GDP", obs)


# ─── FRED (optional fallback for extras) ───
def _collect_fred_extras(con, client) -> int:
    key = os.environ.get("FRED_API_KEY", "").strip()
    if not key:
        return 0
    n = 0
    for sid, title in FRED_EXTRAS.items():
        try:
            obs_resp = client.get(f"{FRED_BASE}/series/observations", params={
                "series_id": sid, "api_key": key, "file_type": "json"}).json()
            obs = []
            for o in obs_resp.get("observations", []):
                v = o.get("value")
                if v not in (None, ".", ""):
                    obs.append((o["date"], _f(v)))
            _upsert_series(con, sid, "fred", title, None, None)
            n += _upsert_obs(con, sid, obs)
        except Exception as e:
            print(f"[macro] FRED {sid} failed: {type(e).__name__}")
    return n


def _f(v):
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def collect_macro() -> dict:
    con = connect()
    started = datetime.utcnow()
    total = 0
    try:
        with httpx.Client(timeout=40.0, headers={"User-Agent": "Equilima Research"}) as client:
            total += _collect_treasury(con, client)
            total += _collect_bls(con, client)
            total += _collect_bea(con, client)
            total += _collect_fred_extras(con, client)  # only if FRED_API_KEY set
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
