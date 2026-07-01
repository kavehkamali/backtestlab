"""EOD price + corporate-action collector (non-LLM, Track A).

Daily OHLCV with full detail (open/high/low/close/adj_close/volume) plus splits
and dividends, into prices_daily / corporate_actions. Incremental by default
(fetch only since the last stored date per symbol); full backfill on first run.

Primary source: yfinance (Yahoo — convenience, gray ToS). Fallback: Stooq CSV.
"""

from __future__ import annotations

import io
from datetime import datetime, timedelta

import httpx
import pandas as pd
import yfinance as yf

from ..db import connect, set_collector_state


# A symbol with fewer than this many bars is treated as un-backfilled, so a
# full history fetch runs even though a recent bar exists (e.g. one written by
# the `quotes` collector). Prevents quotes from poisoning incremental backfill.
MIN_HISTORY_BARS = 250


def _last_date(con, symbol: str):
    row = con.execute("SELECT max(date) FROM prices_daily WHERE symbol = ?", [symbol]).fetchone()
    return row[0] if row else None


def _row_count(con, symbol: str) -> int:
    row = con.execute("SELECT count(*) FROM prices_daily WHERE symbol = ?", [symbol]).fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def _fetch_yf(symbol: str, start=None, full: bool = False) -> pd.DataFrame:
    t = yf.Ticker(symbol)
    if full or start is None:
        df = t.history(period="max", auto_adjust=False, actions=True)
    else:
        df = t.history(start=start, auto_adjust=False, actions=True)
    return df if df is not None else pd.DataFrame()


def _fetch_stooq(symbol: str) -> pd.DataFrame:
    """Fallback for plain US equities. Stooq wants e.g. 'aapl.us'."""
    s = symbol.lower()
    if "." not in s and "-" not in s and "=" not in s and not s.startswith("^"):
        s = f"{s}.us"
    try:
        with httpx.Client(timeout=30.0, headers={"User-Agent": "Equilima/1.0"}) as c:
            r = c.get(f"https://stooq.com/q/d/l/?s={s}&i=d")
            if r.status_code >= 400 or not r.text or r.text.startswith("<"):
                return pd.DataFrame()
            df = pd.read_csv(io.StringIO(r.text))
    except Exception:
        return pd.DataFrame()
    if df.empty or "Date" not in df.columns:
        return pd.DataFrame()
    df = df.rename(columns={"Date": "date", "Open": "open", "High": "high",
                            "Low": "low", "Close": "close", "Volume": "volume"})
    df["date"] = pd.to_datetime(df["date"]).dt.date
    return df


def _fetch_rows(symbol: str, last, full: bool):
    """Fetch price + action rows for a symbol. NO DB connection held — the slow
    network fetch happens outside the warehouse lock so reads/other collectors
    can use the DB meanwhile."""
    start = (last + timedelta(days=1)) if last else None
    if start and start > datetime.utcnow().date():
        return [], []  # already current
    df = _fetch_yf(symbol, start=start, full=full)
    source = "yfinance"
    price_rows: list[tuple] = []
    action_rows: list[tuple] = []
    if df is not None and not df.empty:
        for idx, r in df.iterrows():
            d = idx.date() if hasattr(idx, "date") else pd.to_datetime(idx).date()
            close = r.get("Close")
            adj = r.get("Adj Close", close)
            price_rows.append((symbol, d, _f(r.get("Open")), _f(r.get("High")),
                               _f(r.get("Low")), _f(close), _f(adj),
                               _i(r.get("Volume")), source))
            div = r.get("Dividends") or 0
            if div and float(div) != 0:
                action_rows.append((symbol, d, "dividend", float(div), source))
            split = r.get("Stock Splits") or 0
            if split and float(split) != 0:
                action_rows.append((symbol, d, "split", float(split), source))
    else:
        sdf = _fetch_stooq(symbol)
        source = "stooq"
        for _, r in sdf.iterrows():
            d = r["date"]
            if last and d <= last:
                continue
            price_rows.append((symbol, d, _f(r.get("open")), _f(r.get("high")),
                               _f(r.get("low")), _f(r.get("close")), _f(r.get("close")),
                               _i(r.get("volume")), source))
    return price_rows, action_rows


def _write_rows(con, price_rows, action_rows):
    if price_rows:
        con.executemany(
            """INSERT INTO prices_daily (symbol,date,open,high,low,close,adj_close,volume,source)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT (symbol,date) DO UPDATE SET
                 open=excluded.open, high=excluded.high, low=excluded.low,
                 close=excluded.close, adj_close=excluded.adj_close,
                 volume=excluded.volume, source=excluded.source""",
            price_rows,
        )
    if action_rows:
        con.executemany(
            """INSERT INTO corporate_actions (symbol,date,type,value,source)
               VALUES (?,?,?,?,?)
               ON CONFLICT (symbol,date,type) DO UPDATE SET value=excluded.value""",
            action_rows,
        )


def _f(v):
    try:
        f = float(v)
        return None if f != f else round(f, 6)  # NaN -> None
    except (TypeError, ValueError):
        return None


def _i(v):
    try:
        if v != v:
            return 0
        return int(v)
    except (TypeError, ValueError):
        return 0


def collect_prices(symbols: list[str] | None = None, full: bool = False, chunk: int = 40) -> dict:
    """Process symbols in chunks, reopening the DuckDB connection per chunk so the
    single-writer lock is released between chunks — lets the 30-min quotes timer
    and web reads interleave even during the multi-hour full backfill."""
    started = datetime.utcnow()
    if symbols is None:
        con = connect()
        try:
            symbols = [r[0] for r in con.execute(
                "SELECT symbol FROM symbols WHERE active ORDER BY symbol").fetchall()]
        finally:
            con.close()

    total = 0
    note = ""
    done = 0
    set_collector_state("prices", "running", total=len(symbols), done=0, started=True,
                        phase="full" if full else "incremental")
    for i in range(0, len(symbols), chunk):
        batch = symbols[i:i + chunk]

        # Phase 1 — plan (brief lock): decide full/last per symbol.
        plans = {}
        con = connect()
        try:
            for sym in batch:
                do_full = full or _row_count(con, sym) < MIN_HISTORY_BARS
                plans[sym] = (do_full, None if do_full else _last_date(con, sym))
        finally:
            con.close()

        # Phase 2 — fetch (NO lock): the slow network work, lock-free.
        fetched = []
        for sym in batch:
            do_full, last = plans[sym]
            try:
                pr, ar = _fetch_rows(sym, last, do_full)
                fetched.append((pr, ar))
                total += len(pr)
            except Exception as e:
                note += f"{sym}:{type(e).__name__}; "
            done += 1

        # Phase 3 — write (brief lock): flush the whole chunk at once.
        con = connect()
        try:
            for pr, ar in fetched:
                try:
                    _write_rows(con, pr, ar)
                except Exception as e:
                    note += f"write:{type(e).__name__}; "
        finally:
            con.close()

        if done % 200 == 0 or done >= len(symbols):
            print(f"[prices] {done}/{len(symbols)} symbols, {total} rows so far", flush=True)
        set_collector_state("prices", "running", total=len(symbols), done=done, rows=total)

    con = connect()
    try:
        con.execute(
            """INSERT INTO collector_runs (collector,started_at,finished_at,ok,rows,note)
               VALUES ('prices',?,?,?,?,?)""",
            [started, datetime.utcnow(), True, total, note[:2000]],
        )
    finally:
        con.close()
    set_collector_state("prices", "idle", total=len(symbols), done=len(symbols), rows=total, note=note[:200])
    print(f"[prices] done: {total} rows across {len(symbols)} symbols", flush=True)
    return {"rows": total, "symbols": len(symbols)}


if __name__ == "__main__":
    import sys
    full = "--full" in sys.argv
    syms = [a for a in sys.argv[1:] if not a.startswith("--")] or None
    collect_prices(syms, full=full)
