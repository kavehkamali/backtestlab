"""Yahoo Finance full-info + quotes collector (non-LLM, Track A).

- collect_info:   the ENTIRE yfinance .info dict per symbol -> yf_info (JSON +
                  extracted columns). Slower; run daily/often.
- collect_quotes: lightweight batch latest-bar refresh -> prices_daily, for
                  continuous intraday freshness. Run every ~30 min market hours.

⚠️ yfinance is Yahoo's unofficial endpoint (personal-use / gray ToS). Kept
swappable; the defensible historical sources remain EDGAR / Treasury / BLS / Stooq.
"""

from __future__ import annotations

import json
from datetime import datetime

import yfinance as yf

from ..db import connect, set_collector_state


def _f(v):
    try:
        f = float(v)
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def collect_info(symbols: list[str] | None = None) -> dict:
    con = connect()
    started = datetime.utcnow()
    n = 0
    note = ""
    try:
        if symbols is None:
            symbols = [r[0] for r in con.execute(
                "SELECT symbol FROM symbols WHERE active ORDER BY symbol").fetchall()]
        cls = {r[0]: r[1] for r in con.execute("SELECT symbol, asset_class FROM symbols").fetchall()}
        now = datetime.utcnow()
        set_collector_state("info", "running", total=len(symbols), done=0, started=True)
        for i, sym in enumerate(symbols):
            try:
                info = yf.Ticker(sym).info or {}
                if not info:
                    continue
                con.execute(
                    """INSERT INTO yf_info
                       (symbol,fetched_at,name,asset_class,sector,industry,price,market_cap,pe_trailing,info_json)
                       VALUES (?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT (symbol) DO UPDATE SET
                         fetched_at=excluded.fetched_at, name=excluded.name,
                         sector=excluded.sector, industry=excluded.industry,
                         price=excluded.price, market_cap=excluded.market_cap,
                         pe_trailing=excluded.pe_trailing, info_json=excluded.info_json""",
                    [sym, now, info.get("longName") or info.get("shortName"),
                     cls.get(sym), info.get("sector"), info.get("industry"),
                     _f(info.get("currentPrice") or info.get("regularMarketPrice")),
                     _i(info.get("marketCap")), _f(info.get("trailingPE")),
                     json.dumps(info, default=str)[:1_000_000]])
                n += 1
            except Exception as e:
                note += f"{sym}:{type(e).__name__}; "
            if (i + 1) % 50 == 0:
                print(f"[info] {i+1}/{len(symbols)} symbols", flush=True)
                set_collector_state("info", "running", total=len(symbols), done=i + 1, rows=n)
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('info',?,?,?,?,?)""", [started, datetime.utcnow(), True, n, note[:2000]])
    finally:
        con.close()
    set_collector_state("info", "idle", total=len(symbols), done=len(symbols), rows=n)
    print(f"[info] done: {n} symbol snapshots", flush=True)
    return {"snapshots": n}


def collect_quotes(symbols: list[str] | None = None, chunk: int = 80) -> dict:
    """Batch latest daily bar for all symbols (cheap, frequent)."""
    con = connect()
    started = datetime.utcnow()
    total = 0
    try:
        if symbols is None:
            symbols = [r[0] for r in con.execute(
                "SELECT symbol FROM symbols WHERE active ORDER BY symbol").fetchall()]
        set_collector_state("quotes", "running", total=len(symbols), done=0, started=True)
        for c0 in range(0, len(symbols), chunk):
            set_collector_state("quotes", "running", total=len(symbols), done=c0, rows=total)
            batch = symbols[c0:c0 + chunk]
            try:
                df = yf.download(batch, period="2d", interval="1d", auto_adjust=False,
                                 group_by="ticker", threads=True, progress=False)
            except Exception:
                continue
            rows = []
            for sym in batch:
                try:
                    sub = df[sym] if len(batch) > 1 else df
                    sub = sub.dropna(how="all")
                    if sub is None or sub.empty:
                        continue
                    last = sub.iloc[-1]
                    d = sub.index[-1].date()
                    close = _f(last.get("Close"))
                    rows.append((sym, d, _f(last.get("Open")), _f(last.get("High")),
                                 _f(last.get("Low")), close, _f(last.get("Adj Close", close)),
                                 _i(last.get("Volume")) or 0, "yfinance"))
                except Exception:
                    continue
            if rows:
                con.executemany(
                    """INSERT INTO prices_daily (symbol,date,open,high,low,close,adj_close,volume,source)
                       VALUES (?,?,?,?,?,?,?,?,?)
                       ON CONFLICT (symbol,date) DO UPDATE SET
                         open=excluded.open, high=excluded.high, low=excluded.low,
                         close=excluded.close, adj_close=excluded.adj_close,
                         volume=excluded.volume, source=excluded.source""", rows)
                total += len(rows)
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('quotes',?,?,?,?,?)""", [started, datetime.utcnow(), True, total, ""])
    finally:
        con.close()
    set_collector_state("quotes", "idle", total=len(symbols or []), done=len(symbols or []), rows=total)
    print(f"[quotes] done: {total} latest bars", flush=True)
    return {"quotes": total}


if __name__ == "__main__":
    import sys
    syms = [a for a in sys.argv[1:] if not a.startswith("--")] or None
    if "--quotes" in sys.argv:
        collect_quotes(syms)
    else:
        collect_info(syms)
