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


def intraday(symbol: str, interval: str = "5m", limit: int = 1500):
    """Intraday OHLCV bars (epoch seconds for lightweight-charts), or None."""
    con = _ro()
    if con is None:
        return None
    try:
        rows = con.execute(
            """SELECT epoch(ts) AS t, open, high, low, close, volume
               FROM prices_intraday WHERE symbol = ? AND interval = ?
               ORDER BY ts DESC LIMIT ?""",
            [symbol.upper(), interval, limit],
        ).fetchall()
    except Exception:
        return None
    finally:
        con.close()
    if not rows:
        return None
    out = [{"time": int(t), "open": o, "high": h, "low": l, "close": c,
            "volume": int(v) if v is not None else 0} for t, o, h, l, c, v in rows]
    out.reverse()  # ascending
    return out


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


def _writer_active() -> bool:
    """True if a collector currently holds the write lock."""
    import duckdb as _d
    from .db import warehouse_path
    try:
        c = _d.connect(str(warehouse_path()))  # read-write; fails if locked
        c.close()
        return False
    except _d.IOException:
        return True
    except Exception:
        return False


def platform_status(top_n: int = 60):
    """Rich data-platform status for the admin dashboard: coverage, per-class
    breakdown, live collector progress, recent runs, top equities. Fail-soft.

    Uses a more patient read than the request-path helpers: collectors now write
    in short bursts, so a few seconds of retry reliably catches a gap between
    chunks even while several collectors run concurrently."""
    try:
        con = connect(read_only=True, retries=8, retry_wait=0.5)
    except Exception:
        con = None
    if con is None:
        return {"available": False, "writer_active": _writer_active()}
    try:
        out = {"available": True, "writer_active": False}
        q1 = con.execute("SELECT count(*), count(DISTINCT symbol) FROM prices_daily").fetchone()
        q2 = con.execute("SELECT count(*), count(DISTINCT symbol) FROM prices_intraday").fetchone()
        out["coverage"] = {
            "symbols": con.execute("SELECT count(*) FROM symbols").fetchone()[0],
            "price_rows": q1[0], "price_symbols": q1[1],
            "intraday_bars": q2[0], "intraday_symbols": q2[1],
            "yf_info": con.execute("SELECT count(*) FROM yf_info").fetchone()[0],
            "fundamentals_facts": con.execute("SELECT count(*) FROM fundamentals_facts").fetchone()[0],
            "filers_with_facts": con.execute("SELECT count(DISTINCT symbol) FROM fundamentals_facts").fetchone()[0],
            "filings": con.execute("SELECT count(*) FROM filings").fetchone()[0],
            "macro_series": con.execute("SELECT count(*) FROM macro_series").fetchone()[0],
            "macro_obs": con.execute("SELECT count(*) FROM macro_observations").fetchone()[0],
            "cik_symbols": con.execute("SELECT count(*) FROM symbols WHERE cik IS NOT NULL").fetchone()[0],
        }
        out["by_class"] = [
            {"asset_class": r[0], "symbols": r[1], "price_covered": r[2],
             "intraday_covered": r[3], "market_cap_total": r[4]}
            for r in con.execute(
                """SELECT s.asset_class, count(*) AS n,
                          count(DISTINCT pf.symbol), count(DISTINCT idf.symbol), sum(yi.market_cap)
                   FROM symbols s
                   LEFT JOIN (SELECT DISTINCT symbol FROM prices_daily) pf ON pf.symbol=s.symbol
                   LEFT JOIN (SELECT DISTINCT symbol FROM prices_intraday) idf ON idf.symbol=s.symbol
                   LEFT JOIN yf_info yi ON yi.symbol=s.symbol
                   GROUP BY 1 ORDER BY n DESC""").fetchall()
        ]
        out["collectors"] = [
            {"collector": r[0], "status": r[1], "phase": r[2], "total": r[3], "done": r[4],
             "rows": r[5], "started_at": str(r[6]) if r[6] else None, "updated_at": str(r[7]) if r[7] else None, "note": r[8]}
            for r in con.execute(
                "SELECT collector,status,phase,total,done,rows,started_at,updated_at,note FROM collector_state ORDER BY collector").fetchall()
        ]
        out["runs"] = [
            {"collector": r[0], "finished_at": str(r[1]) if r[1] else None, "ok": r[2], "rows": r[3], "note": (r[4] or "")[:200]}
            for r in con.execute(
                "SELECT collector,finished_at,ok,rows,note FROM collector_runs ORDER BY id DESC LIMIT 20").fetchall()
        ]
        out["top_equities"] = [
            {"symbol": r[0], "name": r[1], "asset_class": r[2], "market_cap": r[3]}
            for r in con.execute(
                """SELECT yi.symbol, yi.name, s.asset_class, yi.market_cap
                   FROM yf_info yi JOIN symbols s USING(symbol)
                   WHERE yi.market_cap IS NOT NULL ORDER BY yi.market_cap DESC LIMIT ?""", [top_n]).fetchall()
        ]
        return out
    except Exception as e:
        return {"available": False, "error": str(e), "writer_active": _writer_active()}
    finally:
        con.close()


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
