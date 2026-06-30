"""Intraday bar collector (non-LLM, Track A) — cached so the research chart's
intraday timeframes serve from the warehouse instead of always going live.

Scope: only symbols flagged `intraday` in the universe (curated active set —
SP500 + mid/small + TSX + ETFs/crypto/commodities/indices), NOT the full ~10k
market (intraday for everything would be impractical + hit Yahoo rate limits).

Fetch happens outside the DB connection; writes are chunked so the single-writer
lock is held only briefly.
"""

from __future__ import annotations

from datetime import datetime

import pandas as pd
import yfinance as yf

from ..db import connect

# interval -> how far back to pull each run (within Yahoo's intraday limits).
PERIOD = {"5m": "1mo", "15m": "1mo", "1h": "6mo"}
DEFAULT_INTERVALS = ("5m", "1h")


def _f(v):
    try:
        f = float(v)
        return None if f != f else round(f, 6)
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        return 0 if v != v else int(v)
    except (TypeError, ValueError):
        return 0


def _fetch(batch, interval):
    """Returns list of rows (symbol, interval, ts, o,h,l,c,v, source). No DB."""
    period = PERIOD.get(interval, "5d")
    try:
        df = yf.download(batch, period=period, interval=interval, auto_adjust=False,
                         group_by="ticker", threads=True, progress=False)
    except Exception:
        return []
    rows = []
    for sym in batch:
        try:
            sub = df[sym] if len(batch) > 1 else df
            sub = sub.dropna(how="all")
            if sub is None or sub.empty:
                continue
            idx = sub.index
            try:
                idx = idx.tz_convert("UTC").tz_localize(None)
            except (TypeError, AttributeError):
                pass
            for i, ts in enumerate(idx):
                r = sub.iloc[i]
                c = _f(r.get("Close"))
                if c is None:
                    continue
                rows.append((sym, interval, pd.Timestamp(ts).to_pydatetime(),
                             _f(r.get("Open")), _f(r.get("High")), _f(r.get("Low")),
                             c, _i(r.get("Volume")), "yfinance"))
        except Exception:
            continue
    return rows


def collect_intraday(symbols: list[str] | None = None, intervals=DEFAULT_INTERVALS, chunk: int = 60) -> dict:
    started = datetime.utcnow()
    if symbols is None:
        con = connect()
        try:
            symbols = [r[0] for r in con.execute(
                "SELECT symbol FROM symbols WHERE active AND intraday ORDER BY symbol").fetchall()]
        finally:
            con.close()

    total = 0
    note = ""
    for interval in intervals:
        done = 0
        for i in range(0, len(symbols), chunk):
            batch = symbols[i:i + chunk]
            try:
                rows = _fetch(batch, interval)  # network, no lock
            except Exception as e:
                note += f"{interval}:{type(e).__name__}; "
                rows = []
            if rows:
                con = connect()
                try:
                    con.executemany(
                        """INSERT INTO prices_intraday (symbol,interval,ts,open,high,low,close,volume,source)
                           VALUES (?,?,?,?,?,?,?,?,?)
                           ON CONFLICT (symbol,interval,ts) DO UPDATE SET
                             open=excluded.open, high=excluded.high, low=excluded.low,
                             close=excluded.close, volume=excluded.volume""",
                        rows)
                    total += len(rows)
                finally:
                    con.close()
            done += len(batch)
            if done % 300 == 0:
                print(f"[intraday] {interval}: {done}/{len(symbols)} symbols, {total} bars", flush=True)
    con = connect()
    try:
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('intraday',?,?,?,?,?)""",
            [started, datetime.utcnow(), True, total, note[:2000]])
    finally:
        con.close()
    print(f"[intraday] done: {total} bars across {len(symbols)} symbols", flush=True)
    return {"bars": total, "symbols": len(symbols)}


if __name__ == "__main__":
    import sys
    syms = [a for a in sys.argv[1:] if not a.startswith("--")] or None
    collect_intraday(syms)
