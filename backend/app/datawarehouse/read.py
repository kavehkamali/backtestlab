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
