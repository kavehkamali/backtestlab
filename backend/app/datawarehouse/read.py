"""Warehouse read helpers for the web app / agent.

All functions are best-effort and FAIL SOFT: they open the DuckDB read-only with
a tiny retry and return None on any error (missing data, or a collector/backfill
holding the single-writer lock). Callers must fall back to live fetching when
None is returned — never block a request on the warehouse.
"""

from __future__ import annotations

import json

from .db import connect


def _ro():
    try:
        return connect(read_only=True, retries=2, retry_wait=0.4)
    except Exception:
        return None


def prices(symbol: str, lookback_days: int | None = None):
    """Return [{date, close, volume}] ascending, or None if unavailable."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            "SELECT date, close, volume FROM prices_daily WHERE symbol = ? ORDER BY date",
            [symbol.upper()],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    if not rows:
        return None
    out = [{"date": str(d), "close": c, "volume": int(v) if v is not None else 0} for d, c, v in rows]
    if lookback_days:
        out = out[-lookback_days:]
    return out


def ohlc(symbol: str, lookback_days: int | None = None):
    """Full OHLCV bars ascending for pro candlestick charts, or None."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            """SELECT date, open, high, low, close, adj_close, volume
               FROM prices_daily WHERE symbol = ? ORDER BY date""",
            [symbol.upper()],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    if not rows:
        return None
    out = [{"date": str(d), "open": o, "high": h, "low": l, "close": c,
            "adj_close": a, "volume": int(v) if v is not None else 0}
           for d, o, h, l, c, a, v in rows]
    return out[-lookback_days:] if lookback_days else out


# EDGAR XBRL tag -> friendly metric name (the statement lines we surface).
_FIN_TAGS = {
    "Revenues": "revenue",
    "RevenueFromContractWithCustomerExcludingAssessedTax": "revenue",
    "GrossProfit": "gross_profit",
    "OperatingIncomeLoss": "operating_income",
    "NetIncomeLoss": "net_income",
    "ResearchAndDevelopmentExpense": "rnd",
    "EarningsPerShareDiluted": "eps_diluted",
    "Assets": "assets",
    "Liabilities": "liabilities",
    "StockholdersEquity": "equity",
    "CashAndCashEquivalentsAtCarryingValue": "cash",
    "NetCashProvidedByUsedInOperatingActivities": "operating_cash_flow",
}


def financials(symbol: str):
    """EDGAR fundamentals as annual + quarterly time series, or None.
    Returns {annual:[{period_end,fy,...metrics}], quarterly:[...]}."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            """SELECT tag, fp, fy, period_end, form, value
               FROM fundamentals_facts
               WHERE symbol = ? AND tag IN ({})
               ORDER BY period_end""".format(",".join("?" * len(_FIN_TAGS))),
            [symbol.upper(), *_FIN_TAGS.keys()],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    if not rows:
        return None
    annual, quarterly = {}, {}
    for tag, fp, fy, period_end, form, value in rows:
        metric = _FIN_TAGS.get(tag)
        if not metric or value is None:
            continue
        bucket = annual if (fp == "FY" or form == "10-K") else quarterly
        key = str(period_end)
        row = bucket.setdefault(key, {"period_end": key, "fy": fy, "fp": fp})
        row[metric] = value
    ann = sorted(annual.values(), key=lambda r: r["period_end"])[-12:]
    qtr = sorted(quarterly.values(), key=lambda r: r["period_end"])[-16:]
    if not ann and not qtr:
        return None
    return {"annual": ann, "quarterly": qtr}


def filings(symbol: str, limit: int = 25):
    """Recent SEC filings feed, or None."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            """SELECT form, filed, period, primary_doc_url, title
               FROM filings WHERE symbol = ? AND filed IS NOT NULL
               ORDER BY filed DESC LIMIT ?""",
            [symbol.upper(), limit],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    if not rows:
        return None
    return [{"form": f, "filed": str(fd), "period": str(p) if p else None,
             "url": u, "title": t} for f, fd, p, u, t in rows]


def info(symbol: str):
    """Return the cached full Yahoo .info dict, or None."""
    con = _ro()
    if con is None:
        return None
    try:
        row = con.execute(
            "SELECT info_json FROM yf_info WHERE symbol = ?", [symbol.upper()]
        ).fetchone()
    except Exception:
        return None
    finally:
        con.close()
    if not row or not row[0]:
        return None
    try:
        return json.loads(row[0])
    except Exception:
        return None


def macro_series(series_id: str):
    """Return [{date, value}] ascending for a macro series, or None."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            "SELECT date, value FROM macro_observations WHERE series_id = ? ORDER BY date",
            [series_id],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    return [{"date": str(d), "value": v} for d, v in rows] if rows else None


def coverage():
    """Warehouse health/coverage snapshot. None if the DB can't be opened."""
    con = _ro()
    if con is None:
        return {"available": False}
    try:
        out = {"available": True}
        out["symbols"] = con.execute("SELECT count(*) FROM symbols").fetchone()[0]
        out["price_rows"], out["price_symbols"] = con.execute(
            "SELECT count(*), count(DISTINCT symbol) FROM prices_daily").fetchone()
        out["yf_info"] = con.execute("SELECT count(*) FROM yf_info").fetchone()[0]
        out["macro_obs"] = con.execute("SELECT count(*) FROM macro_observations").fetchone()[0]
        out["fundamentals_facts"] = con.execute("SELECT count(*) FROM fundamentals_facts").fetchone()[0]
        out["filings"] = con.execute("SELECT count(*) FROM filings").fetchone()[0]
        out["runs"] = [
            {"collector": r[0], "finished_at": str(r[1]), "ok": r[2], "rows": r[3]}
            for r in con.execute(
                "SELECT collector, finished_at, ok, rows FROM collector_runs "
                "ORDER BY id DESC LIMIT 8").fetchall()
        ]
        return out
    except Exception:
        return {"available": False}
    finally:
        con.close()
