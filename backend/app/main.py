from __future__ import annotations
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from typing import Optional, List, Dict
import pandas as pd
import math
import json
from dataclasses import asdict
import time
import os
import threading

from .data_fetcher import fetch_stock_data, add_technical_indicators, fetch_multiple, DEFAULT_INDICES
from .backtester import BacktestConfig, StrategyType, run_backtest
from .terminal import router as terminal_router
from .research import router as research_router
from .auth import router as auth_router
from .analytics import router as analytics_router
from .agent_history import router as agent_history_router
from .articles import public_router as articles_public_router, admin_router as articles_admin_router
from .shared_cache import get_or_compute, get_cached_or_refresh_bg, get_cached_any, set_cached, is_stale, SCREENER_TTL, DASHBOARD_TTL, CRYPTO_TTL, RESEARCH_TTL, cache_stats

app = FastAPI(title="Stock Backtesting Dashboard API")
app.include_router(terminal_router)
app.include_router(research_router)
app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(agent_history_router)
app.include_router(articles_public_router)
app.include_router(articles_admin_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://equilima.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Minimal in-memory rate limiting (per IP, per endpoint) ───
_RATE_STATE: dict[tuple[str, str], list[float]] = {}


def _rate_limit_ok(ip: str, key: str, max_requests: int, window_secs: int) -> bool:
    now = time.time()
    k = (ip or "", key)
    arr = _RATE_STATE.get(k, [])
    cutoff = now - float(window_secs)
    arr = [t for t in arr if t >= cutoff]
    if len(arr) >= max_requests:
        _RATE_STATE[k] = arr
        return False
    arr.append(now)
    _RATE_STATE[k] = arr
    return True


@app.middleware("http")
async def _auth_rate_limit_mw(request: Request, call_next):
    path = request.url.path or ""
    if path.startswith("/api/auth/") or path == "/api/admin/login":
        ip = request.client.host if request.client else ""
        xff = request.headers.get("x-forwarded-for")
        if xff:
            ip = xff.split(",")[0].strip() or ip

        # conservative defaults; tune as needed
        limits = {
            "/api/auth/signin": (30, 60),
            "/api/auth/signup": (10, 60),
            "/api/auth/forgot-password": (10, 60),
            "/api/auth/resend-verification-public": (10, 60),
            "/api/admin/login": (20, 60),
        }
        if path in limits:
            mx, win = limits[path]
            if not _rate_limit_ok(ip, path, mx, win):
                return JSONResponse({"detail": "Too many requests. Please try again shortly."}, status_code=429)
    return await call_next(request)


class BacktestRequest(BaseModel):
    symbol: str = "AAPL"
    strategy: str = "sma_crossover"
    period: str = "max"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 100_000.0
    commission_pct: float = 0.001
    position_size: float = 1.0
    params: dict = {}


class CompareRequest(BaseModel):
    symbol: str = "AAPL"
    strategies: List[str] = ["sma_crossover", "buy_and_hold"]
    period: str = "max"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 100_000.0
    commission_pct: float = 0.001
    params_per_strategy: Dict[str, dict] = {}


class ScreenerRequest(BaseModel):
    list_id: str = "sp500_top100"
    strategies: List[str] = ["sma_crossover", "ema_crossover", "rsi", "macd", "bollinger_bands", "momentum"]


class PicksRequest(BaseModel):
    refresh: bool = False
    max_candidates: int = 340


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/stock/{symbol}")
def get_stock_data(symbol: str, period: str = "2y", interval: str = "1d"):
    """Fetch stock OHLCV data with technical indicators."""
    try:
        df = fetch_stock_data(symbol, period, interval)
        df = add_technical_indicators(df)
        records = df.reset_index().rename(columns={"index": "date"})
        records["date"] = records["date"].dt.strftime("%Y-%m-%d")
        return {"symbol": symbol, "data": records.to_dict("records")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/strategies")
def list_strategies():
    """List available backtesting strategies with their configurable parameters."""
    return {
        "strategies": [
            {
                "id": "buy_and_hold",
                "name": "Buy & Hold",
                "description": "Simple buy and hold benchmark",
                "params": [],
            },
            {
                "id": "sma_crossover",
                "name": "SMA Crossover",
                "description": "Buy when fast SMA crosses above slow SMA, sell on cross below",
                "params": [
                    {"name": "fast_period", "type": "int", "default": 20, "min": 5, "max": 100},
                    {"name": "slow_period", "type": "int", "default": 50, "min": 20, "max": 200},
                ],
            },
            {
                "id": "ema_crossover",
                "name": "EMA Crossover",
                "description": "Buy when fast EMA crosses above slow EMA",
                "params": [
                    {"name": "fast_period", "type": "int", "default": 12, "min": 5, "max": 50},
                    {"name": "slow_period", "type": "int", "default": 26, "min": 10, "max": 100},
                ],
            },
            {
                "id": "rsi",
                "name": "RSI",
                "description": "Buy when RSI is oversold, sell when overbought",
                "params": [
                    {"name": "period", "type": "int", "default": 14, "min": 5, "max": 30},
                    {"name": "oversold", "type": "int", "default": 30, "min": 10, "max": 40},
                    {"name": "overbought", "type": "int", "default": 70, "min": 60, "max": 90},
                ],
            },
            {
                "id": "macd",
                "name": "MACD",
                "description": "Buy on MACD signal line crossover, sell on cross-under",
                "params": [
                    {"name": "fast_period", "type": "int", "default": 12, "min": 5, "max": 30},
                    {"name": "slow_period", "type": "int", "default": 26, "min": 15, "max": 50},
                    {"name": "signal_period", "type": "int", "default": 9, "min": 5, "max": 20},
                ],
            },
            {
                "id": "bollinger_bands",
                "name": "Bollinger Bands",
                "description": "Mean reversion: buy at lower band, sell at upper band",
                "params": [
                    {"name": "period", "type": "int", "default": 20, "min": 10, "max": 50},
                    {"name": "num_std", "type": "float", "default": 2.0, "min": 1.0, "max": 3.0},
                ],
            },
            {
                "id": "mean_reversion",
                "name": "Mean Reversion",
                "description": "Buy when Z-score is below threshold, sell when above",
                "params": [
                    {"name": "lookback", "type": "int", "default": 20, "min": 10, "max": 60},
                    {"name": "entry_z", "type": "float", "default": -1.5, "min": -3.0, "max": -0.5},
                    {"name": "exit_z", "type": "float", "default": 1.5, "min": 0.5, "max": 3.0},
                ],
            },
            {
                "id": "momentum",
                "name": "Momentum",
                "description": "Buy when momentum over lookback period is positive",
                "params": [
                    {"name": "lookback", "type": "int", "default": 20, "min": 5, "max": 60},
                    {"name": "threshold", "type": "float", "default": 0.0, "min": -0.05, "max": 0.1},
                ],
            },
            {
                "id": "ml_transformer",
                "name": "ML Transformer",
                "description": "Transformer model predicts P(up X% in N days). Walk-forward training, no leakage.",
                "params": [
                    {"name": "target_return_pct", "type": "float", "default": 2.0, "min": 0.5, "max": 10.0},
                    {"name": "horizon_days", "type": "int", "default": 5, "min": 1, "max": 30},
                    {"name": "seq_len", "type": "int", "default": 30, "min": 10, "max": 60},
                    {"name": "retrain_every", "type": "int", "default": 60, "min": 20, "max": 120},
                    {"name": "prob_threshold", "type": "float", "default": 0.5, "min": 0.3, "max": 0.8},
                    {"name": "epochs", "type": "int", "default": 30, "min": 10, "max": 100},
                ],
            },
        ]
    }


def _sanitize(obj):
    """Replace NaN/Inf with JSON-safe values."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


@app.post("/api/backtest")
def backtest(req: BacktestRequest):
    """Run a single strategy backtest."""
    try:
        df = fetch_stock_data(req.symbol, period=req.period)
        strategy = StrategyType(req.strategy)
        config = BacktestConfig(
            strategy=strategy,
            symbol=req.symbol,
            start_date=req.start_date,
            end_date=req.end_date,
            initial_capital=req.initial_capital,
            commission_pct=req.commission_pct,
            position_size=req.position_size,
            params=req.params,
        )
        result = run_backtest(df, config)
        return _sanitize(asdict(result))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/compare")
def compare_strategies(req: CompareRequest):
    """Run multiple strategies on the same data for comparison."""
    try:
        df = fetch_stock_data(req.symbol, period=req.period)
        results = []
        for strategy_id in req.strategies:
            strategy = StrategyType(strategy_id)
            params = req.params_per_strategy.get(strategy_id, {})
            config = BacktestConfig(
                strategy=strategy,
                symbol=req.symbol,
                start_date=req.start_date,
                end_date=req.end_date,
                initial_capital=req.initial_capital,
                commission_pct=req.commission_pct,
                params=params,
            )
            result = run_backtest(df, config)
            results.append(_sanitize(asdict(result)))
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/screener/lists")
def get_screener_lists():
    from .stock_lists import LISTS
    result = []
    for key, val in LISTS.items():
        group = "Sectors" if key.startswith("sector_") else "Markets"
        result.append({"id": key, "name": val["name"], "count": len(val["symbols"]), "group": group})
    return {"lists": result}


def _compute_snowflake(fund: dict, price: float, change_pct: float) -> dict:
    """Compute Simply Wall St style snowflake scores (0-6) from cached fundamentals."""
    def _sc(val, thresholds, reverse=False):
        if val is None: return 3
        scores = [0, 1, 2, 3, 4, 5, 6] if not reverse else [6, 5, 4, 3, 2, 1, 0]
        for i, t in enumerate(thresholds):
            if val < t: return scores[i]
        return scores[-1]

    pe = fund.get("pe_ratio")
    pb = fund.get("price_to_book")
    val = round((_sc(pe, [8, 12, 18, 25, 35, 50], True) + _sc(pb, [1, 2, 3, 5, 8, 15], True)) / 2, 1)

    rg = fund.get("revenue_growth")
    eg = fund.get("earnings_growth")
    rg_v = rg / 100 if rg and abs(rg) < 10 else rg  # handle if already pct
    eg_v = eg / 100 if eg and abs(eg) < 10 else eg
    fut = round((_sc(rg_v, [-0.05, 0, 0.05, 0.10, 0.15, 0.25]) + _sc(eg_v, [-0.1, 0, 0.05, 0.10, 0.20, 0.40])) / 2, 1)

    pm = fund.get("profit_margin")
    pm_v = pm / 100 if pm and abs(pm) < 5 else pm
    roe = fund.get("return_on_equity")
    roe_v = roe / 100 if roe and abs(roe) < 5 else roe
    past = round((_sc(pm_v, [-0.05, 0, 0.05, 0.10, 0.15, 0.25]) + _sc(roe_v, [-0.05, 0, 0.08, 0.15, 0.25, 0.40])) / 2, 1)

    de = fund.get("debt_to_equity")
    cr = fund.get("current_ratio")
    health = round((_sc(de, [20, 50, 80, 120, 200, 400], True) + _sc(cr, [0.5, 0.8, 1.0, 1.5, 2.0, 3.0])) / 2, 1)

    dy = fund.get("dividend_yield")
    dy_v = dy / 100 if dy and dy > 1 else dy  # handle if pct
    div = round(_sc(dy_v, [0, 0.01, 0.02, 0.03, 0.04, 0.06]), 1) if dy_v and dy_v > 0 else 0

    total = round((min(6, val) + min(6, fut) + min(6, past) + min(6, health) + min(6, div)) / 5, 1)

    return {"value": min(6, val), "future": min(6, fut), "past": min(6, past), "health": min(6, health), "dividend": min(6, div), "total": min(6, total)}


@app.post("/api/screener")
def screener(req: ScreenerRequest):
    """Professional screener with shared cache for all users."""
    cache_key = f"screener_{req.list_id}"

    def _compute():
        return _screener_compute(req.list_id, req.strategies)

    # Always return cached data instantly, refresh in background if stale
    result = get_cached_or_refresh_bg(cache_key, SCREENER_TTL, _compute)
    return result


def _screener_compute(list_id, strategies):
    """Actual screener computation — called by shared cache."""
    from .backtester import STRATEGY_MAP
    from .stock_lists import LISTS
    from .cache import batch_fetch_prices, fetch_fundamentals_cached
    from ta.momentum import RSIIndicator
    from ta.trend import MACD as MACD_Indicator
    from ta.volatility import BollingerBands
    import numpy as np
    from concurrent.futures import ThreadPoolExecutor

    stock_list = LISTS.get(list_id)
    if not stock_list:
        raise HTTPException(status_code=400, detail=f"Unknown list: {list_id}")

    symbols = stock_list["symbols"]

    # Batch fetch all prices (cached)
    price_data = batch_fetch_prices(symbols, period="2y")

    # Fetch fundamentals in parallel (cached, so mostly instant after first run)
    fund_data = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch_fundamentals_cached, s): s for s in symbols}
        for future in futures:
            s = futures[future]
            try:
                fund_data[s] = future.result(timeout=10)
            except Exception:
                fund_data[s] = {"name": s, "sector": "", "industry": ""}

    results = []
    for symbol in symbols:
        try:
            df = price_data.get(symbol)
            if df is None or len(df) < 50:
                continue

            close = df["close"]
            high = df["high"]
            low = df["low"]
            volume = df["volume"]
            fund = fund_data.get(symbol, {})

            price = float(close.iloc[-1])
            prev_close = float(close.iloc[-2]) if len(close) > 1 else price
            change_1d = (price / prev_close - 1) * 100 if prev_close else 0
            change_5d = (price / float(close.iloc[-6]) - 1) * 100 if len(close) > 5 else 0
            change_20d = (price / float(close.iloc[-21]) - 1) * 100 if len(close) > 20 else 0
            change_60d = (price / float(close.iloc[-61]) - 1) * 100 if len(close) > 60 else 0

            high_52w = float(high.iloc[-252:].max()) if len(high) >= 252 else float(high.max())
            low_52w = float(low.iloc[-252:].min()) if len(low) >= 252 else float(low.min())
            pct_from_52w_high = (price / high_52w - 1) * 100

            rsi = RSIIndicator(close, window=14).rsi()
            rsi_val = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else 50

            macd_ind = MACD_Indicator(close)
            macd_hist = float(macd_ind.macd_diff().iloc[-1]) if not np.isnan(macd_ind.macd_diff().iloc[-1]) else 0
            macd_prev = float(macd_ind.macd_diff().iloc[-2]) if len(macd_ind.macd_diff()) > 1 and not np.isnan(macd_ind.macd_diff().iloc[-2]) else 0
            macd_trend = "rising" if macd_hist > macd_prev else "falling"

            bb = BollingerBands(close, window=20, window_dev=2)
            bb_upper = float(bb.bollinger_hband().iloc[-1])
            bb_lower = float(bb.bollinger_lband().iloc[-1])
            bb_pos = (price - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5

            vol_sma = float(volume.rolling(20).mean().iloc[-1])
            vol_ratio = float(volume.iloc[-1]) / vol_sma if vol_sma > 0 else 1.0

            returns = close.pct_change().dropna()
            volatility = float(returns.iloc[-20:].std() * np.sqrt(252) * 100) if len(returns) >= 20 else 0

            sma_20 = float(close.rolling(20).mean().iloc[-1])
            sma_50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else sma_20
            sma_200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else sma_50

            signals = {}
            buy_count = 0
            for strategy_id in strategies:
                try:
                    strategy = StrategyType(strategy_id)
                    if strategy in STRATEGY_MAP:
                        sig_series = STRATEGY_MAP[strategy](df, {})
                        current_signal = int(sig_series.iloc[-1])
                        signals[strategy_id] = current_signal
                        if current_signal == 1:
                            buy_count += 1
                except Exception:
                    signals[strategy_id] = 0

            spark_data = close.iloc[-60:].tolist() if len(close) >= 60 else close.tolist()

            results.append({
                "symbol": symbol,
                "name": fund.get("name", symbol),
                "sector": fund.get("sector", ""),
                "industry": fund.get("industry", ""),
                "price": round(price, 2),
                "change_1d": round(change_1d, 2),
                "change_5d": round(change_5d, 2),
                "change_20d": round(change_20d, 2),
                "change_60d": round(change_60d, 2),
                "high_52w": round(high_52w, 2),
                "low_52w": round(low_52w, 2),
                "pct_from_52w_high": round(pct_from_52w_high, 1),
                "rsi": round(rsi_val, 1),
                "macd_hist": round(macd_hist, 3),
                "macd_trend": macd_trend,
                "bb_pos": round(bb_pos, 2),
                "vol_ratio": round(vol_ratio, 2),
                "volatility": round(volatility, 1),
                "above_sma20": price > sma_20,
                "above_sma50": price > sma_50,
                "above_sma200": price > sma_200,
                "signals": signals,
                "buy_count": buy_count,
                "total_strategies": len(strategies),
                "sparkline": [round(float(v), 2) for v in spark_data],
                # Fundamentals
                "market_cap": fund.get("market_cap"),
                "pe_ratio": fund.get("pe_ratio"),
                "forward_pe": fund.get("forward_pe"),
                "eps": fund.get("eps"),
                "dividend_yield": fund.get("dividend_yield"),
                "beta": fund.get("beta"),
                "profit_margin": fund.get("profit_margin"),
                "revenue_growth": fund.get("revenue_growth"),
                "earnings_growth": fund.get("earnings_growth"),
                "short_ratio": fund.get("short_ratio"),
                "short_pct_float": fund.get("short_pct_float"),
                "insider_pct": fund.get("insider_pct"),
                "institution_pct": fund.get("institution_pct"),
                "price_to_book": fund.get("price_to_book"),
                "debt_to_equity": fund.get("debt_to_equity"),
                "current_ratio": fund.get("current_ratio"),
                "return_on_equity": fund.get("return_on_equity"),
                # Snowflake scores (0-6 each)
                "snowflake": _compute_snowflake(fund, price, change_5d),
            })
        except Exception:
            continue

    results.sort(key=lambda x: (-x["buy_count"], -x.get("change_5d", 0)))
    return {"results": _sanitize(results), "list_name": stock_list["name"]}


def _clip_score(v, lo, hi):
    if v is None:
        return 0.0
    try:
        x = float(v)
    except Exception:
        return 0.0
    if hi == lo:
        return 0.0
    return max(0.0, min(1.0, (x - lo) / (hi - lo)))


def _fmt_reason(label, value, suffix=""):
    if value is None:
        return None
    return f"{label}: {value}{suffix}"


def _pick_category(symbol, fund, scores, low_cap_symbols=None):
    low_cap_symbols = low_cap_symbols or set()
    market_cap = fund.get("market_cap") or 0
    if symbol.endswith(".TO"):
        return "Canada / Diversified"
    if (symbol in low_cap_symbols or (market_cap and market_cap <= 5_000_000_000)) and scores.get("short_term", 0) >= 55:
        return "Low-Cap Short-Term"
    if scores["momentum"] >= scores["quality"] and scores["momentum"] >= 65:
        return "Swing Momentum"
    if scores["value"] >= scores["quality"] and scores["value"] >= 58:
        return "Value / Income"
    return "Long-Term Quality"


def _market_context(prices):
    def pct(sym, days):
        df = prices.get(sym)
        if df is None or len(df) <= days:
            return 0.0
        close = df["close"]
        last = float(close.iloc[-1])
        base = float(close.iloc[-days - 1])
        return (last / base - 1) * 100 if base else 0.0

    spx_1m = pct("^GSPC", 21)
    rut_1m = pct("^RUT", 21)
    nasdaq_1m = pct("^IXIC", 21)
    vix_df = prices.get("^VIX")
    vix = float(vix_df["close"].iloc[-1]) if vix_df is not None and len(vix_df) else None
    tnx_3m = pct("^TNX", 63)
    risk_off = (spx_1m < -3) or (vix is not None and vix >= 24)
    small_cap_pressure = rut_1m < spx_1m - 4
    growth_tailwind = nasdaq_1m > spx_1m + 2 and not risk_off
    return {
        "spx_1m": round(spx_1m, 1),
        "rut_1m": round(rut_1m, 1),
        "nasdaq_1m": round(nasdaq_1m, 1),
        "vix": round(vix, 1) if vix is not None else None,
        "tnx_3m": round(tnx_3m, 1),
        "risk_off": risk_off,
        "small_cap_pressure": small_cap_pressure,
        "growth_tailwind": growth_tailwind,
    }


def _score_pick(symbol, df, fund, market_context=None, low_cap_symbols=None):
    import numpy as np
    from ta.momentum import RSIIndicator
    from ta.trend import MACD as MACD_Indicator

    market_context = market_context or {}
    if df is None or len(df) < 90:
        return None
    close = df["close"]
    volume = df["volume"]
    price = float(close.iloc[-1])
    if price <= 2:
        return None

    def ret(days):
        if len(close) <= days:
            return 0.0
        base = float(close.iloc[-days - 1])
        return (price / base - 1) * 100 if base else 0.0

    rsi = RSIIndicator(close, window=14).rsi()
    rsi_val = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else 50.0
    macd = MACD_Indicator(close)
    macd_hist = macd.macd_diff()
    mh = float(macd_hist.iloc[-1]) if not np.isnan(macd_hist.iloc[-1]) else 0.0
    mh_prev = float(macd_hist.iloc[-5]) if len(macd_hist) > 5 and not np.isnan(macd_hist.iloc[-5]) else 0.0
    sma50 = float(close.rolling(50).mean().iloc[-1])
    sma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else sma50
    vol_ratio = float(volume.iloc[-1]) / float(volume.rolling(20).mean().iloc[-1]) if float(volume.rolling(20).mean().iloc[-1]) > 0 else 1.0
    returns = close.pct_change().dropna()
    volatility = float(returns.iloc[-20:].std() * np.sqrt(252) * 100) if len(returns) >= 20 else 0.0

    market_cap = fund.get("market_cap") or 0
    pe = fund.get("forward_pe") or fund.get("pe_ratio")
    revenue_growth = fund.get("revenue_growth")
    earnings_growth = fund.get("earnings_growth")
    profit_margin = fund.get("profit_margin")
    roe = fund.get("return_on_equity")
    debt_to_equity = fund.get("debt_to_equity")
    current_ratio = fund.get("current_ratio")
    dividend_yield = fund.get("dividend_yield")

    quality = (
        25 * _clip_score(profit_margin, 5, 35)
        + 25 * _clip_score(roe, 5, 35)
        + 20 * _clip_score(revenue_growth, -5, 25)
        + 15 * _clip_score(earnings_growth, -10, 35)
        + 10 * (1 - _clip_score(debt_to_equity, 40, 250))
        + 5 * _clip_score(current_ratio, 0.8, 2.5)
    )
    value = (
        35 * (1 - _clip_score(pe, 12, 45))
        + 20 * (1 - _clip_score(fund.get("price_to_book"), 1, 8))
        + 15 * _clip_score(dividend_yield, 0, 5)
        + 15 * _clip_score(roe, 5, 30)
        + 15 * (1 - _clip_score(debt_to_equity, 50, 250))
    )
    momentum = (
        28 * _clip_score(ret(20), -8, 14)
        + 22 * _clip_score(ret(60), -15, 28)
        + 18 * (1 if price > sma50 else 0)
        + 14 * (1 if price > sma200 else 0)
        + 10 * _clip_score(mh - mh_prev, -0.5, 0.8)
        + 8 * _clip_score(vol_ratio, 0.7, 2.0)
    )
    short_term = (
        30 * _clip_score(ret(5), -5, 9)
        + 30 * _clip_score(ret(20), -8, 18)
        + 16 * _clip_score(vol_ratio, 0.8, 2.5)
        + 12 * _clip_score(mh - mh_prev, -0.4, 0.9)
        + 8 * (1 if price > sma50 else 0)
        + 4 * (1 if 48 <= rsi_val <= 76 else 0)
    )
    risk_adj = max(0, 100 - volatility)
    base = 0.42 * quality + 0.32 * momentum + 0.18 * value + 0.08 * risk_adj
    if market_cap and market_cap < 750_000_000:
        base -= 8
    if rsi_val > 78:
        base -= 5
    if market_context.get("risk_off"):
        base -= 4
        short_term -= 5
    if market_context.get("small_cap_pressure") and (symbol in (low_cap_symbols or set()) or (market_cap and market_cap <= 5_000_000_000)):
        short_term -= 4
    if market_context.get("growth_tailwind") and (symbol in (low_cap_symbols or set()) or (market_cap and market_cap <= 5_000_000_000)):
        short_term += 3

    scores = {
        "overall": round(max(0, min(100, base)), 1),
        "quality": round(max(0, min(100, quality)), 1),
        "momentum": round(max(0, min(100, momentum)), 1),
        "short_term": round(max(0, min(100, short_term)), 1),
        "value": round(max(0, min(100, value)), 1),
        "risk": round(max(0, min(100, risk_adj)), 1),
    }
    category = _pick_category(symbol, fund, scores, low_cap_symbols)
    if category == "Swing Momentum":
        overall = 0.55 * scores["momentum"] + 0.25 * scores["quality"] + 0.12 * scores["value"] + 0.08 * scores["risk"]
    elif category == "Low-Cap Short-Term":
        overall = 0.62 * scores["short_term"] + 0.18 * scores["momentum"] + 0.10 * scores["quality"] + 0.10 * scores["risk"]
    elif category == "Value / Income":
        overall = 0.50 * scores["value"] + 0.25 * scores["quality"] + 0.15 * scores["momentum"] + 0.10 * scores["risk"]
    elif category == "Canada / Diversified":
        overall = 0.40 * scores["quality"] + 0.25 * scores["value"] + 0.25 * scores["momentum"] + 0.10 * scores["risk"]
    else:
        overall = scores["overall"]
    scores["overall"] = round(max(0, min(100, overall)), 1)

    reasons = [
        _fmt_reason("5D", round(ret(5), 1), "%"),
        _fmt_reason("1M", round(ret(20), 1), "%"),
        _fmt_reason("3M", round(ret(60), 1), "%"),
        _fmt_reason("RSI", round(rsi_val, 1)),
        _fmt_reason("Fwd P/E", round(pe, 1) if pe else None),
        _fmt_reason("Rev growth", revenue_growth, "%"),
        _fmt_reason("ROE", roe, "%"),
    ]
    reasons = [r for r in reasons if r][:5]
    return {
        "symbol": symbol,
        "name": fund.get("name", symbol),
        "sector": fund.get("sector", ""),
        "industry": fund.get("industry", ""),
        "country": "Canada" if symbol.endswith(".TO") else "US",
        "category": category,
        "price": round(price, 2),
        "market_cap": market_cap,
        "scores": scores,
        "change_20d": round(ret(20), 2),
        "change_60d": round(ret(60), 2),
        "rsi": round(rsi_val, 1),
        "above_sma50": price > sma50,
        "above_sma200": price > sma200,
        "volatility": round(volatility, 1),
        "pe_ratio": fund.get("pe_ratio"),
        "forward_pe": fund.get("forward_pe"),
        "dividend_yield": fund.get("dividend_yield"),
        "profit_margin": fund.get("profit_margin"),
        "revenue_growth": fund.get("revenue_growth"),
        "earnings_growth": fund.get("earnings_growth"),
        "return_on_equity": fund.get("return_on_equity"),
        "reasons": reasons,
    }


def _attach_pick_news(columns, per_column=4):
    try:
        import yfinance as yf
        all_picks = []
        for col in columns:
            all_picks.extend(col.get("picks", [])[:per_column])
        for pick in all_picks[:50]:
            headlines = []
            try:
                raw = yf.Ticker(pick["symbol"]).news or []
                for item in raw[:4]:
                    content = item.get("content", {})
                    title = content.get("title") or item.get("title")
                    if title:
                        headlines.append(title)
                pick["news"] = headlines[:2]
            except Exception:
                pick["news"] = []
    except Exception:
        return columns
    return columns


def _headline_sentiment(headlines):
    text = " ".join(headlines or []).lower()
    if not text:
        return 0
    positive = ["beat", "beats", "raises", "raised", "upgrade", "upgraded", "surge", "record", "profit", "growth", "contract", "approval", "launch"]
    negative = ["miss", "misses", "cut", "cuts", "downgrade", "downgraded", "probe", "lawsuit", "warning", "recall", "loss", "decline", "bankruptcy"]
    return sum(1 for w in positive if w in text) - sum(1 for w in negative if w in text)


def _apply_news_scores(columns):
    for col in columns:
        for pick in col.get("picks", []):
            score = _headline_sentiment(pick.get("news", []))
            pick["news_score"] = score
            if score:
                pick["scores"]["overall"] = round(max(0, min(100, pick["scores"]["overall"] + max(-4, min(4, score * 1.5)))), 1)
        col["picks"].sort(key=lambda x: x["scores"]["overall"], reverse=True)
    return columns


def _extract_json_object(text):
    if not text:
        return None
    s = str(text).strip()
    start = s.find("{")
    end = s.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(s[start:end + 1])
    except Exception:
        return None


def _agent_review_picks(columns, market_context, per_column=4):
    def _candidate_payload(col):
        payload = []
        for pick in col.get("picks", [])[:per_column]:
            payload.append({
                "symbol": pick["symbol"],
                "category": col["title"],
                "name": pick.get("name"),
                "sector": pick.get("sector"),
                "candidate_sources": pick.get("candidate_sources", []),
                "market_cap": pick.get("market_cap"),
                "scores": pick.get("scores"),
                "price": pick.get("price"),
                "change_20d": pick.get("change_20d"),
                "change_60d": pick.get("change_60d"),
                "rsi": pick.get("rsi"),
                "volatility": pick.get("volatility"),
                "forward_pe": pick.get("forward_pe"),
                "revenue_growth": pick.get("revenue_growth"),
                "earnings_growth": pick.get("earnings_growth"),
                "return_on_equity": pick.get("return_on_equity"),
                "headlines": pick.get("news", [])[:2],
            })
        return payload

    try:
        import httpx
        selections_by_col = {}
        with httpx.Client(timeout=600.0) as client:
            for col in columns:
                candidates = _candidate_payload(col)
                if not candidates:
                    continue
                prompt = (
                    f"You are the Equilima deep stock-picks selection agent for the {col['title']} sleeve. "
                    "Review these pre-selection candidates with careful reasoning. Use the supplied fundamentals, technicals, recent headlines, "
                    "and macro context, and use your configured research/news/macro/fundamental capabilities if available. "
                    "Return strict JSON only with this schema: "
                    "{\"selections\":[{\"symbol\":\"AAPL\",\"rank\":1,\"note\":\"why selected\",\"risk\":\"main risk\"}]}. "
                    "Select exactly 4 symbols from the supplied candidate list, ranked 1 to 4. These are the final displayed picks. "
                    "Do not include symbols outside the candidate list. Prefer evidence over excitement; penalize overbought charts, weak fundamentals, "
                    "bad headlines, macro mismatch, liquidity risk, or volatility risk. Keep note and risk under 18 words each.\n\n"
                    f"Macro context: {json.dumps(market_context)}\n"
                    f"Candidates: {json.dumps(candidates)}"
                )
                resp = client.post(f"{AGENT_URL}/chat", json={"message": prompt, "history": []})
                if not resp.is_success:
                    resp = client.post(f"{AGENT_URL}/quick", json={"message": prompt, "ticker": "", "history": []})
                if not resp.is_success:
                    print(f"[picks] Agent review {col['title']} HTTP {resp.status_code}: {resp.text[:500]}")
                    continue
                body = resp.json()
                raw = body.get("response") or body.get("message") or body.get("content") or ""
                parsed = _extract_json_object(raw)
                selections = parsed.get("selections", []) if isinstance(parsed, dict) else []
                if not selections:
                    print(f"[picks] Agent selection {col['title']} returned no selections. Raw: {str(raw)[:500]}")
                selections_by_col[col["id"]] = selections
    except Exception as e:
        print(f"[picks] Agent review failed: {e}")
        return columns, False

    selected_any = False
    for col in columns:
        picks_by_symbol = {p["symbol"].upper(): p for p in col.get("picks", [])}
        selected = []
        seen = set()
        for sel in selections_by_col.get(col["id"], []):
            try:
                symbol = str(sel.get("symbol", "")).strip().upper()
                if symbol in seen or symbol not in picks_by_symbol:
                    continue
                pick = picks_by_symbol[symbol]
                pick["agent_selected"] = True
                pick["agent_note"] = str(sel.get("note", "")).strip()[:180]
                pick["agent_risk"] = str(sel.get("risk", "")).strip()[:180]
                pick["agent_rank"] = int(sel.get("rank", len(selected) + 1))
                selected.append(pick)
                seen.add(symbol)
            except Exception:
                continue
        if selected:
            selected_any = True
            fallback = [p for p in col.get("picks", []) if p["symbol"].upper() not in seen]
            col["picks"] = selected + fallback
    if not selected_any:
        print("[picks] Agent returned no usable selections")
    return columns, selected_any


def _collect_news_candidate_symbols(limit=40):
    import re
    try:
        import yfinance as yf
        from .stock_lists import SP500, MID_CAPS, SMALL_CAPS, TSX60
        valid_symbols = {s.upper() for s in SP500 + MID_CAPS + SMALL_CAPS + TSX60}
        common = REDDIT_COMMON_WORDS if "REDDIT_COMMON_WORDS" in globals() else set()
        seeds = ["SPY", "QQQ", "DIA", "IWM", "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META", "AMD", "PLTR", "SMCI"]
        counts = {}
        for seed in seeds:
            try:
                for item in (yf.Ticker(seed).news or [])[:12]:
                    content = item.get("content", {}) if isinstance(item, dict) else {}
                    title = content.get("title") or item.get("title") or ""
                    summary = content.get("summary") or item.get("summary") or ""
                    text = f"{title} {summary}"
                    for raw in re.findall(r"(?<![A-Za-z0-9])\$?([A-Z][A-Z0-9.-]{1,7})(?![A-Za-z0-9])", text):
                        sym = raw.replace("-", ".").upper().strip(".")
                        if sym in valid_symbols and sym not in common:
                            counts[sym] = counts.get(sym, 0) + 1
            except Exception:
                continue
        return [s for s, _ in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]]
    except Exception:
        return []


def _collect_reddit_candidate_symbols(limit=40):
    try:
        reddit = get_cached_any(REDDIT_PICKS_KEY)
        if reddit is None or is_stale(REDDIT_PICKS_KEY, REDDIT_PICKS_TTL):
            reddit = _reddit_picks_compute()
            set_cached(REDDIT_PICKS_KEY, reddit)
        return [item["symbol"] for item in (reddit.get("items") or [])[:limit] if item.get("symbol")]
    except Exception as e:
        print(f"[picks] Reddit candidate collection failed: {e}")
        return []


PICKS_TTL = 24 * 60 * 60
PICKS_DEFAULT_CANDIDATES = 340


def _picks_cache_key(max_candidates=PICKS_DEFAULT_CANDIDATES):
    return f"ai_picks_v8_{int(max_candidates or PICKS_DEFAULT_CANDIDATES)}"


def _refresh_picks_cache_background(max_candidates=PICKS_DEFAULT_CANDIDATES, force=False):
    cache_key = _picks_cache_key(max_candidates)
    if not force and not is_stale(cache_key, PICKS_TTL):
        return

    def _run():
        try:
            start = time.time()
            data = _ai_picks_compute(max_candidates)
            set_cached(cache_key, data)
            print(f"[picks] Daily cache refresh {cache_key} in {time.time() - start:.1f}s")
        except Exception as e:
            print(f"[picks] Daily cache refresh {cache_key} FAILED: {e}")

    threading.Thread(target=_run, daemon=True).start()


@app.on_event("startup")
def warm_picks_cache_on_startup():
    _refresh_picks_cache_background(PICKS_DEFAULT_CANDIDATES)


@app.post("/api/picks")
def ai_picks(req: PicksRequest):
    max_candidates = int(req.max_candidates or PICKS_DEFAULT_CANDIDATES)
    cache_key = _picks_cache_key(max_candidates)
    if req.refresh:
        data = _ai_picks_compute(max_candidates)
        set_cached(cache_key, data)
        return data
    return get_cached_or_refresh_bg(cache_key, PICKS_TTL, lambda: _ai_picks_compute(max_candidates))


def _ai_picks_compute(max_candidates=260):
    from concurrent.futures import ThreadPoolExecutor
    from .stock_lists import SP500, MID_CAPS, SMALL_CAPS, TSX60
    from .cache import batch_fetch_prices, fetch_fundamentals_cached

    limit = max(80, min(int(max_candidates or 260), 340))
    reddit_symbols = _collect_reddit_candidate_symbols(45)
    news_symbols = _collect_news_candidate_symbols(45)
    # Keep each market-cap/country sleeve represented before applying the total cap.
    symbols = list(dict.fromkeys(reddit_symbols + news_symbols + SP500[:120] + MID_CAPS[:55] + SMALL_CAPS[:70] + TSX60[:40]))
    if limit > len(symbols):
        symbols = list(dict.fromkeys(symbols + SP500[120:170] + MID_CAPS[55:80] + SMALL_CAPS[70:] + TSX60[40:55]))
    symbols = symbols[:limit]
    macro_symbols = ["^GSPC", "^IXIC", "^RUT", "^VIX", "^TNX", "CL=F", "GC=F"]
    prices = batch_fetch_prices(list(dict.fromkeys(symbols + macro_symbols)), period="1y")
    market_context = _market_context(prices)
    low_cap_symbols = set(SMALL_CAPS)
    funds = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(fetch_fundamentals_cached, s): s for s in symbols}
        for fut, sym in [(f, futures[f]) for f in futures]:
            try:
                funds[sym] = fut.result(timeout=12)
            except Exception:
                funds[sym] = {"name": sym}

    scored = []
    for sym in symbols:
        try:
            item = _score_pick(sym, prices.get(sym), funds.get(sym, {}), market_context, low_cap_symbols)
            if item and item["scores"]["overall"] >= 45:
                item["candidate_sources"] = []
                if sym in reddit_symbols:
                    item["candidate_sources"].append("Reddit buzz")
                if sym in news_symbols:
                    item["candidate_sources"].append("News buzz")
                if not item["candidate_sources"]:
                    item["candidate_sources"].append("Fundamental/technical screen")
                scored.append(item)
        except Exception:
            continue

    buckets = [
        {"id": "long_term", "title": "Long-Term Quality", "tone": "emerald", "subtitle": "Durable fundamentals and balanced technicals"},
        {"id": "swing", "title": "Swing Momentum", "tone": "sky", "subtitle": "Near-term trend strength with confirmation"},
        {"id": "low_cap", "title": "Low-Cap Short-Term", "tone": "cyan", "subtitle": "Smaller-cap momentum with liquidity and risk checks"},
        {"id": "value", "title": "Value / Income", "tone": "amber", "subtitle": "Valuation, yield, and balance-sheet support"},
        {"id": "canada", "title": "Canada / Diversified", "tone": "rose", "subtitle": "TSX and non-US diversification candidates"},
    ]
    agent_pool_per_bucket = 12
    final_picks_per_bucket = 4
    used = set()
    for b in buckets:
        cat = b["title"]
        picks = [x for x in scored if x["category"] == cat and x["symbol"] not in used]
        picks.sort(key=lambda x: x["scores"]["overall"], reverse=True)
        b["picks"] = picks[:agent_pool_per_bucket]
        used.update(x["symbol"] for x in b["picks"])

    if len(buckets[0]["picks"]) < 3:
        fallback = [x for x in sorted(scored, key=lambda x: x["scores"]["overall"], reverse=True) if x["symbol"] not in used]
        buckets[0]["picks"].extend(fallback[: 3 - len(buckets[0]["picks"])])

    buckets = _apply_news_scores(_attach_pick_news(buckets, per_column=agent_pool_per_bucket))
    buckets, agent_reviewed = _agent_review_picks(buckets, market_context, per_column=agent_pool_per_bucket)
    for b in buckets:
        b["picks"] = b.get("picks", [])[:final_picks_per_bucket]

    return _sanitize({
        "as_of": pd.Timestamp.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "universe_count": len(symbols),
        "scored_count": len(scored),
        "model": os.getenv("EQUILIMA_AGENT_URL", "http://localhost:8888"),
        "market_context": market_context,
        "agent_reviewed": agent_reviewed,
        "method": "Candidate pools combine Reddit/social buzz, market-news buzz, fundamentals, technicals, headlines, and macro context; the same home LLM agent service used by tab 1 selects the final displayed picks from each pool.",
        "candidate_sources": {"reddit": len(reddit_symbols), "news": len(news_symbols), "fundamental_technical": len(symbols)},
        "columns": buckets,
        "ai_summary": "",
        "disclaimer": "Research shortlist only. Not investment advice. Verify news, filings, liquidity, and your risk constraints before trading.",
    })


REDDIT_PICKS_TTL = 6 * 60 * 60
REDDIT_PICKS_KEY = "reddit_picks_v2"
REDDIT_SUBREDDITS = ["wallstreetbets", "stocks", "investing", "StockMarket", "pennystocks", "ValueInvesting", "options", "smallstreetbets"]
REDDIT_COMMON_WORDS = {
    "A", "AI", "ALL", "ARE", "ATH", "BE", "BIG", "BUY", "CALL", "CAN", "CEO", "CFO", "DD", "DO", "EPS", "ETF",
    "FOR", "GDP", "GO", "HOLD", "IMO", "IPO", "IT", "JAN", "JUL", "JUN", "LEAP", "LOW", "MACD", "MOON", "NEW",
    "NOW", "ON", "ONE", "OR", "PE", "PEG", "PM", "PUT", "ROI", "RSI", "SEC", "TA", "THE", "TO", "USA", "USD",
}
REDDIT_BULLISH_WORDS = {
    "buy", "bought", "buying", "long", "calls", "call", "bullish", "undervalued", "breakout", "moon", "squeeze",
    "accumulate", "adding", "added", "hold", "holding", "recommend", "recommended", "upside", "beat", "beats",
}
REDDIT_FALLBACK_SYMBOLS = ["NVDA", "TSLA", "AMD", "PLTR", "SMCI", "AAPL", "MSFT", "AMZN", "META", "GOOGL", "SOFI", "RKLB", "IONQ", "RGTI", "SOUN"]


def _reddit_symbol_universe():
    from .stock_lists import SP500, MID_CAPS, SMALL_CAPS, TSX60
    symbols = set(SP500 + MID_CAPS + SMALL_CAPS + TSX60)
    return {s.upper() for s in symbols if 2 <= len(s.replace(".TO", "")) <= 5 and s.upper() not in REDDIT_COMMON_WORDS}


def _reddit_extract_symbols(text, valid_symbols):
    import re
    symbols = []
    for raw in re.findall(r"(?<![A-Za-z0-9])\$?([A-Z][A-Z0-9.-]{1,7})(?![A-Za-z0-9])", text or ""):
        sym = raw.replace("-", ".").upper().strip(".")
        if sym in valid_symbols:
            symbols.append(sym)
    return symbols


def _reddit_recommendation_count(text):
    lowered = (text or "").lower()
    return sum(1 for word in REDDIT_BULLISH_WORDS if word in lowered)


def _reddit_fetch_json(client, url):
    try:
        r = client.get(url)
        if r.is_success:
            return r.json()
    except Exception:
        return None
    return None


def _reddit_scan_rss_posts(client, subreddit, valid_symbols):
    import xml.etree.ElementTree as ET
    posts = []
    url = f"https://www.reddit.com/r/{subreddit}/hot/.rss"
    try:
        r = client.get(url)
        if not r.is_success:
            return posts
        root = ET.fromstring(r.text)
    except Exception:
        return posts
    ns = {"a": "http://www.w3.org/2005/Atom"}
    for entry in root.findall("a:entry", ns)[:30]:
        title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
        content = (entry.findtext("a:content", default="", namespaces=ns) or "").strip()
        link_el = entry.find("a:link", ns)
        href = link_el.attrib.get("href", "") if link_el is not None else ""
        text = f"{title} {content}"
        symbols = _reddit_extract_symbols(text, valid_symbols)
        if not symbols:
            continue
        posts.append({
            "id": (entry.findtext("a:id", default="", namespaces=ns) or "").split("/")[-1],
            "subreddit": subreddit,
            "title": title,
            "text": text,
            "url": href or f"https://www.reddit.com/r/{subreddit}",
            "score": 1,
            "comments": 0,
            "symbols": symbols,
            "recommendations": _reddit_recommendation_count(text),
        })
    return posts


def _reddit_scan_posts(client, subreddit, valid_symbols):
    posts = []
    base = f"https://www.reddit.com/r/{subreddit}"
    for listing in ["hot", "top"]:
        url = f"{base}/{listing}.json?limit=25&t=day&raw_json=1"
        data = _reddit_fetch_json(client, url)
        rows = data.get("data", {}).get("children", []) if isinstance(data, dict) else []
        for child in rows:
            p = child.get("data", {}) if isinstance(child, dict) else {}
            if p.get("stickied"):
                continue
            text = " ".join([p.get("title") or "", p.get("selftext") or ""])
            symbols = _reddit_extract_symbols(text, valid_symbols)
            if not symbols:
                continue
            posts.append({
                "id": p.get("id"),
                "subreddit": subreddit,
                "title": p.get("title") or "",
                "text": text,
                "url": f"https://www.reddit.com{p.get('permalink', '')}",
                "score": int(p.get("score") or 0),
                "comments": int(p.get("num_comments") or 0),
                "symbols": symbols,
                "recommendations": _reddit_recommendation_count(text),
            })
    return posts


def _reddit_search_symbol_posts(client, symbols):
    posts = []
    for sym in symbols:
        url = f"https://api.pullpush.io/reddit/search/submission/?q={sym}&subreddit=wallstreetbets,stocks,investing,StockMarket,pennystocks&size=8&sort=desc&sort_type=score"
        data = _reddit_fetch_json(client, url)
        rows = data.get("data", []) if isinstance(data, dict) else []
        for p in rows:
            if not isinstance(p, dict):
                continue
            subreddit = p.get("subreddit") or "reddit"
            title = p.get("title") or ""
            text = " ".join([title, p.get("selftext") or "", f"${sym}"])
            posts.append({
                "id": p.get("id"),
                "subreddit": subreddit,
                "title": title or f"${sym} Reddit discussion",
                "text": text,
                "url": f"https://www.reddit.com{p.get('permalink', '')}" if p.get("permalink") else f"https://www.reddit.com/search/?q=%24{sym}%20stock",
                "score": int(p.get("score") or 0),
                "comments": int(p.get("num_comments") or 0),
                "symbols": [sym],
                "recommendations": _reddit_recommendation_count(text),
            })
    return posts


def _reddit_attach_comments(client, posts, valid_symbols):
    for post in sorted(posts, key=lambda x: x["score"] + x["comments"], reverse=True)[:24]:
        if not post.get("id"):
            continue
        url = f"https://www.reddit.com/r/{post['subreddit']}/comments/{post['id']}.json?limit=40&depth=1&sort=top&raw_json=1"
        data = _reddit_fetch_json(client, url)
        if not isinstance(data, list) or len(data) < 2:
            continue
        rows = data[1].get("data", {}).get("children", [])
        for child in rows[:30]:
            c = child.get("data", {}) if isinstance(child, dict) else {}
            body = c.get("body") or ""
            symbols = _reddit_extract_symbols(body, valid_symbols)
            if not symbols:
                continue
            post.setdefault("comment_hits", []).append({
                "body": body[:240],
                "symbols": symbols,
                "score": int(c.get("score") or 0),
                "recommendations": _reddit_recommendation_count(body),
            })
    return posts


def _reddit_picks_compute():
    import math as _math
    from collections import defaultdict
    valid_symbols = _reddit_symbol_universe()
    mentions = defaultdict(lambda: {
        "symbol": "",
        "mentions": 0,
        "recommendations": 0,
        "engagement": 0,
        "subreddits": set(),
        "examples": [],
    })

    headers = {"User-Agent": "EquilimaRedditPicks/1.0 by u/equilima"}
    with __import__("httpx").Client(timeout=20.0, headers=headers, follow_redirects=True) as client:
        posts = []
        for subreddit in REDDIT_SUBREDDITS:
            posts.extend(_reddit_scan_posts(client, subreddit, valid_symbols))
            posts.extend(_reddit_scan_rss_posts(client, subreddit, valid_symbols))
        if len(posts) < 12:
            posts.extend(_reddit_search_symbol_posts(client, REDDIT_FALLBACK_SYMBOLS))
        posts = _reddit_attach_comments(client, posts, valid_symbols)

    for post in posts:
        engagement = max(1, post["score"]) + 2 * max(0, post["comments"])
        for sym in post.get("symbols", []):
            row = mentions[sym]
            row["symbol"] = sym
            row["mentions"] += 1
            row["recommendations"] += post.get("recommendations", 0)
            row["engagement"] += engagement
            row["subreddits"].add(post["subreddit"])
            if len(row["examples"]) < 3:
                row["examples"].append({
                    "source": f"r/{post['subreddit']}",
                    "title": post["title"][:180],
                    "url": post["url"],
                    "score": post["score"],
                    "comments": post["comments"],
                })
        for hit in post.get("comment_hits", []):
            for sym in hit.get("symbols", []):
                row = mentions[sym]
                row["symbol"] = sym
                row["mentions"] += 1
                row["recommendations"] += hit.get("recommendations", 0)
                row["engagement"] += max(1, hit.get("score", 0))
                row["subreddits"].add(post["subreddit"])

    ranked = []
    for row in mentions.values():
        buzz_score = row["mentions"] * 4 + row["recommendations"] * 5 + _math.log1p(row["engagement"]) * 3 + len(row["subreddits"]) * 2
        ranked.append({
            "symbol": row["symbol"],
            "mentions": row["mentions"],
            "recommendations": row["recommendations"],
            "engagement": int(row["engagement"]),
            "subreddits": sorted(row["subreddits"]),
            "buzz_score": round(buzz_score, 1),
            "examples": row["examples"],
        })
    ranked.sort(key=lambda x: x["buzz_score"], reverse=True)
    ranked, agent_reviewed = _agent_select_reddit_picks(ranked[:30])
    return _sanitize({
        "as_of": pd.Timestamp.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "source": "reddit",
        "subreddits": REDDIT_SUBREDDITS,
        "items": ranked[:30],
        "agent_reviewed": agent_reviewed,
        "method": "Builds a Reddit buzz candidate pool from mentions, recommendation language, engagement, and subreddit breadth; the same home LLM agent selects the final displayed Reddit ideas from that pool.",
        "disclaimer": "Reddit buzz is social discussion, not investment advice. Verify fundamentals, catalysts, liquidity, and risk before trading.",
    })


def _agent_select_reddit_picks(items):
    if not items:
        return items, False
    try:
        import httpx
        payload = []
        for item in items[:24]:
            payload.append({
                "symbol": item["symbol"],
                "mentions": item["mentions"],
                "recommendations": item["recommendations"],
                "engagement": item["engagement"],
                "subreddits": item["subreddits"],
                "examples": item["examples"][:2],
            })
        prompt = (
            "You are the Equilima Reddit stock-buzz selection agent. Select the final displayed Reddit ideas from these candidates. "
            "Use the supplied mention counts, recommendation language counts, engagement, subreddit breadth, and linked examples. "
            "Distinguish broad useful discussion from meme/pump risk. Do not invent facts outside the supplied data. "
            "Return strict JSON only with this schema: "
            "{\"selections\":[{\"symbol\":\"AAPL\",\"rank\":1,\"sentiment\":\"bullish|mixed|bearish|hype\",\"note\":\"why selected\",\"risk\":\"short risk\"}]}. "
            "Select exactly 12 symbols from the supplied candidate list, ranked 1 to 12. These are the final displayed Reddit ideas. "
            "Do not include symbols outside the candidate list. Prefer broad, recommendation-heavy, high-engagement discussion; penalize low-quality hype, pump-risk, or unclear context. "
            "Keep note and risk under 18 words each.\n\n"
            f"Candidates: {json.dumps(payload)}"
        )
        with httpx.Client(timeout=600.0) as client:
            resp = client.post(f"{AGENT_URL}/chat", json={"message": prompt, "history": []})
            if not resp.is_success:
                resp = client.post(f"{AGENT_URL}/quick", json={"message": prompt, "ticker": "", "history": []})
            if not resp.is_success:
                print(f"[reddit-picks] Agent HTTP {resp.status_code}: {resp.text[:500]}")
                return items, False
            body = resp.json()
            raw = body.get("response") or body.get("message") or body.get("content") or ""
            parsed = _extract_json_object(raw)
            selections = parsed.get("selections", []) if isinstance(parsed, dict) else []
            if not selections and isinstance(parsed, dict):
                selections = parsed.get("reviews") or parsed.get("picks") or parsed.get("items") or []
            if not selections:
                print(f"[reddit-picks] Agent returned no selections. Raw: {str(raw)[:500]}")
    except Exception as e:
        print(f"[reddit-picks] Agent review failed: {e}")
        return items, False

    by_symbol = {}
    for review in selections:
        try:
            sym = str(review.get("symbol", "")).upper().strip().lstrip("$")
            if not sym:
                continue
            by_symbol[sym] = {
                "rank": int(review.get("rank", len(by_symbol) + 1)),
                "sentiment": str(review.get("sentiment", "mixed"))[:20],
                "note": str(review.get("note", ""))[:180],
                "risk": str(review.get("risk", ""))[:180],
            }
        except Exception:
            continue
    if not by_symbol:
        print("[reddit-picks] Agent returned no usable selections")
        return items, False

    selected = []
    remaining = []
    for item in items:
        review = by_symbol.get(item["symbol"])
        if review:
            item["agent_selected"] = True
            item["agent_rank"] = review["rank"]
            item["agent_sentiment"] = review["sentiment"]
            item["agent_note"] = review["note"]
            item["agent_risk"] = review["risk"]
            selected.append(item)
        else:
            remaining.append(item)
    selected.sort(key=lambda x: x.get("agent_rank", 999))
    if not selected:
        return items, False
    return selected + remaining, True


@app.post("/api/picks/reddit")
def reddit_picks(req: PicksRequest):
    if req.refresh:
        data = _reddit_picks_compute()
        set_cached(REDDIT_PICKS_KEY, data)
        return data
    return get_cached_or_refresh_bg(REDDIT_PICKS_KEY, REDDIT_PICKS_TTL, _reddit_picks_compute)


@app.get("/api/stock/{symbol}/detail")
def stock_detail(symbol: str):
    """Detailed stock info with chart data."""
    import numpy as np
    from ta.momentum import RSIIndicator
    from ta.trend import MACD as MACD_Indicator
    from .cache import fetch_price_cached, fetch_fundamentals_cached

    try:
        df = fetch_price_cached(symbol, period="2y")
        if len(df) < 10:
            raise ValueError("Not enough data")

        fund = fetch_fundamentals_cached(symbol)
        close = df["close"]
        price = float(close.iloc[-1])

        chart = []
        sma_data = {}
        for period in [20, 50, 200]:
            sma_data[period] = close.rolling(period).mean()

        for i in range(len(df)):
            row = {
                "date": df.index[i].strftime("%Y-%m-%d"),
                "open": round(float(df["open"].iloc[i]), 2),
                "high": round(float(df["high"].iloc[i]), 2),
                "low": round(float(df["low"].iloc[i]), 2),
                "close": round(float(df["close"].iloc[i]), 2),
                "volume": int(df["volume"].iloc[i]),
            }
            for period in [20, 50, 200]:
                val = sma_data[period].iloc[i]
                row[f"sma_{period}"] = round(float(val), 2) if not np.isnan(val) else None
            chart.append(row)

        rsi = RSIIndicator(close, window=14).rsi()
        macd_ind = MACD_Indicator(close)

        perf = {}
        for label, days in [("1D", 1), ("5D", 5), ("1M", 21), ("3M", 63), ("6M", 126), ("1Y", 252)]:
            if len(close) > days:
                perf[label] = round((price / float(close.iloc[-days - 1]) - 1) * 100, 2)

        returns = close.pct_change().dropna()

        return _sanitize({
            "symbol": symbol,
            "name": fund.get("name", symbol),
            "sector": fund.get("sector", "—"),
            "industry": fund.get("industry", "—"),
            "price": round(price, 2),
            "performance": perf,
            "chart": chart,
            # Fundamentals
            "market_cap": fund.get("market_cap"),
            "pe_ratio": fund.get("pe_ratio"),
            "forward_pe": fund.get("forward_pe"),
            "eps": fund.get("eps"),
            "dividend_yield": fund.get("dividend_yield"),
            "beta": fund.get("beta"),
            "profit_margin": fund.get("profit_margin"),
            "revenue_growth": fund.get("revenue_growth"),
            "earnings_growth": fund.get("earnings_growth"),
            "short_ratio": fund.get("short_ratio"),
            "short_pct_float": fund.get("short_pct_float"),
            "insider_pct": fund.get("insider_pct"),
            "institution_pct": fund.get("institution_pct"),
            "price_to_book": fund.get("price_to_book"),
            "debt_to_equity": fund.get("debt_to_equity"),
            "current_ratio": fund.get("current_ratio"),
            "return_on_equity": fund.get("return_on_equity"),
            # Technical
            "high_52w": fund.get("fifty_two_week_high") or round(float(df["high"].max()), 2),
            "low_52w": fund.get("fifty_two_week_low") or round(float(df["low"].min()), 2),
            "avg_volume": fund.get("avg_volume"),
            "volatility": round(float(returns.iloc[-20:].std() * np.sqrt(252) * 100), 1) if len(returns) >= 20 else 0,
            "rsi": round(float(rsi.iloc[-1]), 1) if not np.isnan(rsi.iloc[-1]) else 50,
            "macd": round(float(macd_ind.macd().iloc[-1]), 3) if not np.isnan(macd_ind.macd().iloc[-1]) else 0,
            "macd_signal": round(float(macd_ind.macd_signal().iloc[-1]), 3) if not np.isnan(macd_ind.macd_signal().iloc[-1]) else 0,
            "macd_hist": round(float(macd_ind.macd_diff().iloc[-1]), 3) if not np.isnan(macd_ind.macd_diff().iloc[-1]) else 0,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/cache/clear")
def clear_cache():
    from .cache import clear_cache as _clear
    _clear()
    return {"status": "cleared"}


# ─── NEWS ───

@app.get("/api/news")
def get_news(symbols: str = "AAPL,MSFT,GOOGL,AMZN,NVDA,TSLA,META,^GSPC"):
    """Fetch news for given symbols. Returns deduplicated, date-sorted articles."""
    import yfinance as yf
    from datetime import datetime

    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    seen = set()
    articles = []

    for sym in symbol_list[:15]:  # limit to avoid slow response
        try:
            ticker = yf.Ticker(sym)
            news = ticker.news
            if not news:
                continue
            for item in news:
                content = item.get("content", {})
                title = content.get("title", "")
                if not title or title in seen:
                    continue
                seen.add(title)

                pub_date = content.get("pubDate", "")
                provider = content.get("provider", {})

                # Extract thumbnail
                thumbnail = None
                resolutions = content.get("thumbnail", {}).get("resolutions", [])
                if resolutions:
                    thumbnail = resolutions[0].get("url")

                # Extract canonical URL
                url = content.get("canonicalUrl", {}).get("url", "")

                # Related tickers
                tickers = []
                for fin in content.get("finance", {}).get("stockTickers", []):
                    tickers.append(fin.get("symbol", ""))

                articles.append({
                    "title": title,
                    "url": url,
                    "source": provider.get("displayName", ""),
                    "date": pub_date,
                    "thumbnail": thumbnail,
                    "tickers": tickers[:5],
                    "symbol": sym,
                })
        except Exception:
            continue

    # Sort by date descending
    articles.sort(key=lambda x: x.get("date", ""), reverse=True)
    return {"articles": articles[:100]}


# ─── MARKET ANALYSIS ───

MARKET_TICKERS = {
    "indices": {
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "Dow Jones": "^DJI",
        "TSX Composite": "^GSPTSE",
        "Russell 2000": "^RUT",
        "VIX": "^VIX",
    },
    "commodities": {
        "Crude Oil (WTI)": "CL=F",
        "Brent Crude": "BZ=F",
        "Gold": "GC=F",
        "Silver": "SI=F",
        "Platinum": "PL=F",
        "Palladium": "PA=F",
        "Natural Gas": "NG=F",
        "Copper": "HG=F",
        "Corn": "ZC=F",
        "Wheat": "ZW=F",
        "Soybeans": "ZS=F",
        "Soybean Oil": "ZL=F",
        "Coffee": "KC=F",
        "Sugar #11": "SB=F",
        "Cotton": "CT=F",
        "Cocoa": "CC=F",
        "Orange Juice": "OJ=F",
        "Lumber": "LB=F",
        "Live Cattle": "LE=F",
        "Lean Hogs": "HE=F",
        "Feeder Cattle": "GF=F",
        "Gasoline (RBOB)": "RB=F",
        "Heating Oil": "HO=F",
    },
    "bonds": {
        "US 10Y Yield": "^TNX",
        "US 2Y Yield": "^IRX",
        "US 30Y Yield": "^TYX",
    },
    "currencies": {
        "EUR/USD": "EURUSD=X",
        "GBP/USD": "GBPUSD=X",
        "USD/JPY": "JPY=X",
        "USD/CHF": "CHF=X",
        "AUD/USD": "AUDUSD=X",
        "NZD/USD": "NZDUSD=X",
        "USD/CAD": "CAD=X",
        "USD/MXN": "MXN=X",
        "USD/SEK": "SEK=X",
        "USD/NOK": "NOK=X",
        "USD/DKK": "DKK=X",
        "USD/PLN": "PLN=X",
        "USD/TRY": "TRY=X",
        "USD/ZAR": "ZAR=X",
        "USD/BRL": "BRL=X",
        "USD/INR": "INR=X",
        "USD/KRW": "KRW=X",
        "USD/SGD": "SGD=X",
        "USD/HKD": "HKD=X",
        "USD/CNY": "CNY=X",
        "USD/ILS": "ILS=X",
        "USD/THB": "THB=X",
        "USD/CZK": "CZK=X",
        "USD/HUF": "HUF=X",
        "EUR/JPY": "EURJPY=X",
        "GBP/JPY": "GBPJPY=X",
        "EUR/GBP": "EURGBP=X",
        "AUD/JPY": "AUDJPY=X",
        "NZD/JPY": "NZDJPY=X",
        "EUR/CHF": "EURCHF=X",
        "EUR/AUD": "EURAUD=X",
        "EUR/CAD": "EURCAD=X",
        "GBP/AUD": "GBPAUD=X",
        "CAD/JPY": "CADJPY=X",
        "AUD/NZD": "AUDNZD=X",
        "GBP/CAD": "GBPCAD=X",
        "Dollar Index": "DX-Y.NYB",
    },
    "crypto": {
        "Bitcoin": "BTC-USD",
        "Ethereum": "ETH-USD",
    },
    "sectors": {
        "Technology": "XLK",
        "Healthcare": "XLV",
        "Financials": "XLF",
        "Energy": "XLE",
        "Consumer Disc.": "XLY",
        "Consumer Staples": "XLP",
        "Industrials": "XLI",
        "Real Estate": "XLRE",
        "Utilities": "XLU",
        "Materials": "XLB",
        "Comm. Services": "XLC",
    },
    "housing": {
        "Real Estate ETF": "VNQ",
        "Homebuilders": "XHB",
    },
}


@app.get("/api/market/overview")
def market_overview():
    """Full market overview — shared cache for all users."""
    return get_or_compute("dashboard_overview", DASHBOARD_TTL, _market_overview_compute)


def _market_overview_compute():
    import yfinance as yf
    import numpy as np
    from .cache import fetch_price_cached

    result = {}

    for category, tickers in MARKET_TICKERS.items():
        cat_data = []
        for name, symbol in tickers.items():
            try:
                df = fetch_price_cached(symbol, period="10y", interval="1d")
                if len(df) < 2:
                    continue

                close = df["close"]
                price = float(close.iloc[-1])
                prev = float(close.iloc[-2])
                change_1d = (price / prev - 1) * 100

                # Period returns
                changes = {}
                for label, days in [("1W", 5), ("1M", 21), ("3M", 63), ("6M", 126), ("YTD", None), ("1Y", 252), ("2Y", 504), ("5Y", 1260), ("10Y", 2520)]:
                    if label == "YTD":
                        # Find first trading day of year
                        year_start = df[df.index.year == df.index[-1].year]
                        if len(year_start) > 0:
                            changes["YTD"] = round((price / float(year_start["close"].iloc[0]) - 1) * 100, 2)
                    elif len(close) > days:
                        changes[label] = round((price / float(close.iloc[-days - 1]) - 1) * 100, 2)

                # Daily sparkline (frontend slices by period) + aligned calendar dates
                spark = [round(float(v), 2) for v in close.tolist()]
                spark_dates = [
                    (idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10])
                    for idx in df.index
                ]

                # 1D intraday sparkline (15m closes) + timestamps for axis
                spark_1d = None
                spark_1d_dates = None
                try:
                    intraday = fetch_price_cached(symbol, period="1d", interval="15m")
                    if len(intraday) > 1:
                        spark_1d = [round(float(v), 2) for v in intraday["close"].tolist()]
                        spark_1d_dates = [
                            (ix.strftime("%Y-%m-%dT%H:%M") if hasattr(ix, "strftime") else str(ix)[:16])
                            for ix in intraday.index
                        ]
                except Exception:
                    spark_1d = None
                    spark_1d_dates = None

                # 1W open+close per day (alternating points: open, close, ...) + labels
                spark_1w = None
                spark_1w_dates = None
                try:
                    tail = df.tail(5)
                    if len(tail) > 0:
                        oc = []
                        ocd = []
                        for ts, row in tail.iterrows():
                            ds = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
                            oc.append(round(float(row["open"]), 2))
                            oc.append(round(float(row["close"]), 2))
                            ocd.append(f"{ds} open")
                            ocd.append(f"{ds} close")
                        spark_1w = oc
                        spark_1w_dates = ocd
                except Exception:
                    spark_1w = None
                    spark_1w_dates = None

                row_out = {
                    "name": name,
                    "symbol": symbol,
                    "price": round(price, 2),
                    "change_1d": round(change_1d, 2),
                    "changes": changes,
                    "sparkline": spark,
                    "sparkline_1d": spark_1d,
                    "sparkline_1w": spark_1w,
                    "sparkline_dates": spark_dates,
                }
                if spark_1d_dates is not None:
                    row_out["sparkline_1d_dates"] = spark_1d_dates
                if spark_1w_dates is not None:
                    row_out["sparkline_1w_dates"] = spark_1w_dates
                cat_data.append(row_out)
            except Exception:
                continue

        result[category] = cat_data

    return _sanitize(result)


# ─── CRYPTO ───

CRYPTO_TICKERS = [
    ("Bitcoin", "BTC-USD"), ("Ethereum", "ETH-USD"), ("Tether", "USDT-USD"),
    ("BNB", "BNB-USD"), ("Solana", "SOL-USD"), ("XRP", "XRP-USD"),
    ("USDC", "USDC-USD"), ("Cardano", "ADA-USD"), ("Avalanche", "AVAX-USD"),
    ("Dogecoin", "DOGE-USD"), ("Polkadot", "DOT-USD"), ("Chainlink", "LINK-USD"),
    ("TRON", "TRX-USD"), ("Polygon", "MATIC-USD"), ("Toncoin", "TON11419-USD"),
    ("Shiba Inu", "SHIB-USD"), ("Litecoin", "LTC-USD"), ("Bitcoin Cash", "BCH-USD"),
    ("Uniswap", "UNI7083-USD"), ("Stellar", "XLM-USD"),
    ("NEAR", "NEAR-USD"), ("Cosmos", "ATOM-USD"), ("Aptos", "APT21794-USD"),
    ("Filecoin", "FIL-USD"), ("Arbitrum", "ARB11841-USD"),
    ("Optimism", "OP-USD"), ("Aave", "AAVE-USD"), ("Render", "RNDR-USD"),
    ("Sui", "SUI20947-USD"), ("Pepe", "PEPE24478-USD"),
]


@app.get("/api/crypto")
def crypto_overview():
    """Crypto dashboard — shared cache."""
    return get_or_compute("crypto_overview", CRYPTO_TTL, _crypto_compute)


def _crypto_compute():
    import yfinance as yf
    import numpy as np
    from .cache import fetch_price_cached

    results = []
    for name, symbol in CRYPTO_TICKERS:
        try:
            df = fetch_price_cached(symbol, period="10y")
            if len(df) < 2:
                continue

            close = df["close"]
            volume = df["volume"]
            price = float(close.iloc[-1])
            prev = float(close.iloc[-2])

            # Get market cap from yfinance info (cached)
            from .cache import fetch_fundamentals_cached
            fund = fetch_fundamentals_cached(symbol)
            mcap = fund.get("market_cap")

            # Volume 24h (latest bar)
            vol_24h = float(volume.iloc[-1]) * price if volume.iloc[-1] else None

            changes = {}
            for label, days in [("1D", 1), ("1W", 7), ("1M", 30), ("3M", 90), ("6M", 180), ("YTD", None), ("1Y", 365), ("2Y", 730), ("5Y", 1825), ("10Y", 3650)]:
                if label == "YTD":
                    year_start = df[df.index.year == df.index[-1].year]
                    if len(year_start) > 0:
                        changes["YTD"] = round((price / float(year_start["close"].iloc[0]) - 1) * 100, 2)
                elif days and len(close) > days:
                    changes[label] = round((price / float(close.iloc[-days - 1]) - 1) * 100, 2)

            # Full history sparkline (frontend slices by period, same as market overview)
            spark = [round(float(v), 2) for v in close.tolist()]
            spark_dates = [
                (ix.strftime("%Y-%m-%d") if hasattr(ix, "strftime") else str(ix)[:10])
                for ix in df.index
            ]

            results.append({
                "name": name,
                "symbol": symbol.replace("-USD", ""),
                "price": round(price, 6 if price < 1 else 2),
                "change_1d": round((price / prev - 1) * 100, 2),
                "changes": changes,
                "market_cap": mcap,
                "volume_24h": round(vol_24h, 0) if vol_24h else None,
                "sparkline": spark,
                "sparkline_dates": spark_dates,
            })
        except Exception:
            continue

    return {"coins": _sanitize(results)}


# ─── AI Agent Proxy ───
import httpx

# Separate process/repo (e.g. TradingAgents on home-linux). Override for tunnels or remote host.
AGENT_URL = os.getenv("EQUILIMA_AGENT_URL", "http://localhost:8888").rstrip("/")

@app.post("/api/agent/chat")
async def agent_chat(request: Request):
    """Proxy chat to the AI agent on home-linux (full TradingAgents pipeline)."""
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{AGENT_URL}/chat", json=body)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Agent timed out — the analysis is taking too long")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent unavailable: {str(e)}")

@app.post("/api/agent/quick")
async def agent_quick(request: Request):
    """Proxy quick analysis to AI agent (direct LLM, faster)."""
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{AGENT_URL}/quick", json=body)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Agent timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent unavailable: {str(e)}")

@app.get("/api/agent/health")
async def agent_health():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AGENT_URL}/health")
            return resp.json()
    except Exception:
        return {"status": "offline"}


# ─── Static file serving for production ───
STATIC_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the React SPA for all non-API routes."""
        # Block common scanner targets explicitly (avoid returning index.html with 200).
        p = (full_path or "").lstrip("/")
        low = p.lower()
        blocked = (
            low == ".env"
            or low.endswith("/.env")
            or low.startswith(".git")
            or "/.git" in low
            or low.startswith("wp-")
            or "/wp-" in low
            or low.startswith("wordpress")
            or low.startswith("phpinfo")
            or low.endswith("phpinfo.php")
            or low.startswith("server-status")
            or low.startswith("server-info")
            or low.startswith("_profiler")
        )
        if blocked:
            raise HTTPException(status_code=404, detail="Not found")
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
