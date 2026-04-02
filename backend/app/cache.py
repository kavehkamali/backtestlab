from __future__ import annotations
"""
Disk-based caching layer for stock data.

Two cache types:
1. Price cache: OHLCV data, refreshed every 15 min during market hours
2. Fundamental cache: company info (market cap, P/E, etc.), refreshed daily

Cache stored as pickle files in ~/.stock_dashboard_cache/
"""

import os
import pickle
import time
import pandas as pd
import yfinance as yf
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta

CACHE_DIR = Path.home() / ".stock_dashboard_cache"
PRICE_CACHE_DIR = CACHE_DIR / "prices"
FUNDAMENTAL_CACHE_DIR = CACHE_DIR / "fundamentals"

PRICE_TTL = 15 * 60       # 15 minutes
FUNDAMENTAL_TTL = 24 * 3600  # 24 hours

for d in [CACHE_DIR, PRICE_CACHE_DIR, FUNDAMENTAL_CACHE_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def _cache_path(directory: Path, key: str) -> Path:
    safe_key = key.replace("/", "_").replace("^", "_")
    return directory / f"{safe_key}.pkl"


def _is_fresh(path: Path, ttl: int) -> bool:
    if not path.exists():
        return False
    age = time.time() - path.stat().st_mtime
    return age < ttl


def get_cached_prices(symbol: str, period: str = "2y") -> pd.DataFrame | None:
    path = _cache_path(PRICE_CACHE_DIR, f"{symbol}_{period}")
    if _is_fresh(path, PRICE_TTL):
        try:
            return pickle.loads(path.read_bytes())
        except Exception:
            return None
    return None


def set_cached_prices(symbol: str, df: pd.DataFrame, period: str = "2y"):
    path = _cache_path(PRICE_CACHE_DIR, f"{symbol}_{period}")
    path.write_bytes(pickle.dumps(df))


def get_cached_fundamentals(symbol: str) -> dict | None:
    path = _cache_path(FUNDAMENTAL_CACHE_DIR, symbol)
    if _is_fresh(path, FUNDAMENTAL_TTL):
        try:
            return pickle.loads(path.read_bytes())
        except Exception:
            return None
    return None


def set_cached_fundamentals(symbol: str, data: dict):
    path = _cache_path(FUNDAMENTAL_CACHE_DIR, symbol)
    path.write_bytes(pickle.dumps(data))


def fetch_price_cached(symbol: str, period: str = "2y") -> pd.DataFrame:
    """Fetch price data with cache."""
    cached = get_cached_prices(symbol, period)
    if cached is not None:
        return cached

    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period)
    if df.empty:
        raise ValueError(f"No data for {symbol}")
    df.index = df.index.tz_localize(None)
    df = df[["Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["open", "high", "low", "close", "volume"]
    set_cached_prices(symbol, df, period)
    return df


def fetch_fundamentals_cached(symbol: str) -> dict:
    """Fetch fundamental data with cache."""
    cached = get_cached_fundamentals(symbol)
    if cached is not None:
        return cached

    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}

        data = {
            "name": info.get("longName") or info.get("shortName") or symbol,
            "sector": info.get("sector", ""),
            "industry": info.get("industry", ""),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),
            "eps": info.get("trailingEps"),
            "dividend_yield": round(info.get("dividendYield", 0) * 100, 2) if info.get("dividendYield") else None,
            "beta": info.get("beta"),
            "profit_margin": round(info.get("profitMargins", 0) * 100, 1) if info.get("profitMargins") else None,
            "revenue_growth": round(info.get("revenueGrowth", 0) * 100, 1) if info.get("revenueGrowth") else None,
            "earnings_growth": round(info.get("earningsGrowth", 0) * 100, 1) if info.get("earningsGrowth") else None,
            "short_ratio": info.get("shortRatio"),
            "short_pct_float": round(info.get("shortPercentOfFloat", 0) * 100, 1) if info.get("shortPercentOfFloat") else None,
            "insider_pct": round(info.get("heldPercentInsiders", 0) * 100, 1) if info.get("heldPercentInsiders") else None,
            "institution_pct": round(info.get("heldPercentInstitutions", 0) * 100, 1) if info.get("heldPercentInstitutions") else None,
            "book_value": info.get("bookValue"),
            "price_to_book": info.get("priceToBook"),
            "debt_to_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "return_on_equity": round(info.get("returnOnEquity", 0) * 100, 1) if info.get("returnOnEquity") else None,
            "free_cash_flow": info.get("freeCashflow"),
            "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
            "avg_volume": info.get("averageVolume"),
        }
        set_cached_fundamentals(symbol, data)
        return data
    except Exception:
        return {"name": symbol, "sector": "", "industry": ""}


def batch_fetch_prices(symbols: list[str], period: str = "2y") -> dict[str, pd.DataFrame]:
    """
    Batch fetch prices. Uses yf.download for uncached symbols (much faster).
    """
    result = {}
    uncached = []

    # Check cache first
    for s in symbols:
        cached = get_cached_prices(s, period)
        if cached is not None:
            result[s] = cached
        else:
            uncached.append(s)

    if not uncached:
        return result

    # Batch download uncached
    try:
        if len(uncached) == 1:
            df = yf.download(uncached[0], period=period, progress=False, threads=True)
            if not df.empty:
                df.index = df.index.tz_localize(None)
                df = df[["Open", "High", "Low", "Close", "Volume"]]
                df.columns = ["open", "high", "low", "close", "volume"]
                result[uncached[0]] = df
                set_cached_prices(uncached[0], df, period)
        else:
            data = yf.download(uncached, period=period, group_by="ticker", progress=False, threads=True)
            if data.empty:
                return result
            for s in uncached:
                try:
                    if s in data.columns.get_level_values(0):
                        df = data[s][["Open", "High", "Low", "Close", "Volume"]].dropna()
                        df.columns = ["open", "high", "low", "close", "volume"]
                        df.index = df.index.tz_localize(None)
                        if len(df) > 0:
                            result[s] = df
                            set_cached_prices(s, df, period)
                except Exception:
                    continue
    except Exception:
        # Fallback to individual downloads
        for s in uncached:
            try:
                result[s] = fetch_price_cached(s, period)
            except Exception:
                continue

    return result


def clear_cache():
    """Clear all cached data."""
    import shutil
    for d in [PRICE_CACHE_DIR, FUNDAMENTAL_CACHE_DIR]:
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True, exist_ok=True)
