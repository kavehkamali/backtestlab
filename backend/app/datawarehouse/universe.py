"""Build the collection universe and persist it into `symbols`.

Stocks come from the existing stock_lists (SP500 + mid/small + TSX60); the
non-stock asset classes (ETF/crypto/commodity/index/bond/forex) mirror the
adaptive-research asset index. CIKs for US filers are resolved from SEC's
official company_tickers.json so the EDGAR collector can look them up.
"""

from __future__ import annotations

import os

import httpx

from .db import connect

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"


def _sec_user_agent() -> str:
    # SEC requires a descriptive UA with contact info.
    return os.environ.get("SEC_USER_AGENT", "Equilima Research data@equilima.com")


# Non-stock assets to track (canonical Yahoo symbols), mirrors the research index.
ASSET_CLASS_SYMBOLS: dict[str, list[tuple[str, str]]] = {
    "etf": [
        ("SPY", "SPDR S&P 500 ETF"), ("QQQ", "Invesco QQQ Trust"),
        ("IWM", "iShares Russell 2000 ETF"), ("DIA", "SPDR Dow Jones ETF"),
        ("GLD", "SPDR Gold Shares"), ("SLV", "iShares Silver Trust"),
        ("USO", "United States Oil Fund"), ("TLT", "20+ Year Treasury Bond ETF"),
        ("VNQ", "US Real Estate ETF"),
    ],
    "crypto": [
        ("BTC-USD", "Bitcoin"), ("ETH-USD", "Ethereum"), ("SOL-USD", "Solana"),
    ],
    "commodity": [
        ("GC=F", "Gold futures"), ("SI=F", "Silver futures"),
        ("CL=F", "WTI crude oil futures"), ("BZ=F", "Brent crude futures"),
        ("NG=F", "Natural gas futures"), ("HG=F", "Copper futures"),
    ],
    "index": [
        ("^GSPC", "S&P 500 Index"), ("^IXIC", "Nasdaq Composite"),
        ("^DJI", "Dow Jones Industrial Average"), ("^RUT", "Russell 2000"),
        ("^VIX", "CBOE Volatility Index"),
    ],
    "bond": [("^TNX", "US 10Y Treasury Yield")],
    "forex": [("EURUSD=X", "EUR/USD"), ("DX-Y.NYB", "US Dollar Index")],
}


def _stock_symbols() -> list[str]:
    try:
        from .. import stock_lists as sl
    except ImportError:
        import stock_lists as sl  # when app/ is on sys.path directly

    seen: list[str] = []
    s: set[str] = set()
    for name in ("SP500", "MID_CAPS", "SMALL_CAPS", "TSX60"):
        for sym in getattr(sl, name, []) or []:
            u = str(sym).strip().upper()
            if u and u not in s:
                s.add(u)
                seen.append(u)
    return seen


def _fetch_cik_map() -> dict[str, str]:
    """ticker(upper) -> zero-padded 10-digit CIK, from SEC."""
    try:
        with httpx.Client(timeout=30.0, headers={"User-Agent": _sec_user_agent()}) as c:
            r = c.get(SEC_TICKERS_URL)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        print(f"[universe] SEC ticker map fetch failed: {e}")
        return {}
    out: dict[str, str] = {}
    for row in (data.values() if isinstance(data, dict) else data):
        t = str(row.get("ticker", "")).strip().upper()
        cik = row.get("cik_str")
        if t and cik is not None:
            out[t] = str(int(cik)).zfill(10)
    return out


def build_universe(full_market: bool | None = None) -> int:
    # Full market = every SEC-registered US-listed ticker (whole NASDAQ/NYSE/AMEX,
    # ~10k+). Default on; set EQUILIMA_FULL_UNIVERSE=0 to use the curated lists.
    if full_market is None:
        full_market = os.environ.get("EQUILIMA_FULL_UNIVERSE", "1").strip().lower() not in ("0", "false", "no", "")

    curated = _stock_symbols()
    cik_map = _fetch_cik_map()

    # SEC tickers use dots for share classes (BRK.B); yfinance wants dashes
    # (BRK-B). Curated symbols keep exchange suffixes like RY.TO untouched.
    rows: list[tuple] = []
    seen: set[str] = set()
    # 7th field = intraday flag: curated stocks + non-stock asset classes get
    # intraday bars; the broad full-market extras do not (too many to poll).
    for sym in curated:
        if sym not in seen:
            seen.add(sym)
            rows.append((sym, None, "stock", cik_map.get(sym), None, "USD", True))
    if full_market and cik_map:
        for sec_sym, cik in cik_map.items():
            yf_sym = sec_sym.replace(".", "-")
            if yf_sym not in seen:
                seen.add(yf_sym)
                rows.append((yf_sym, None, "stock", cik, None, "USD", False))
    for asset_class, items in ASSET_CLASS_SYMBOLS.items():
        for sym, name in items:
            rows.append((sym, name, asset_class, None, None, "USD", True))

    con = connect()
    try:
        con.executemany(
            """
            INSERT INTO symbols (symbol, name, asset_class, cik, exchange, currency, intraday)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (symbol) DO UPDATE SET
                name        = COALESCE(excluded.name, symbols.name),
                asset_class = excluded.asset_class,
                cik         = COALESCE(excluded.cik, symbols.cik),
                intraday    = excluded.intraday OR symbols.intraday,
                active      = TRUE
            """,
            rows,
        )
        n = con.execute("SELECT count(*) FROM symbols").fetchone()[0]
    finally:
        con.close()
    print(f"[universe] upserted {len(rows)} symbols; total in warehouse: {n} "
          f"(CIKs resolved: {sum(1 for r in rows if r[3])})")
    return n


if __name__ == "__main__":
    build_universe()
