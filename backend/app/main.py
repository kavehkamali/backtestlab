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

from .data_fetcher import fetch_stock_data, add_technical_indicators, fetch_multiple, DEFAULT_INDICES
from .backtester import BacktestConfig, StrategyType, run_backtest
from .terminal import router as terminal_router
from .research import router as research_router
from .auth import router as auth_router
from .analytics import router as analytics_router
from .agent_history import router as agent_history_router
from .articles import public_router as articles_public_router, admin_router as articles_admin_router
from .shared_cache import get_or_compute, get_cached_or_refresh_bg, SCREENER_TTL, DASHBOARD_TTL, CRYPTO_TTL, RESEARCH_TTL, cache_stats

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

                # Daily sparkline (frontend slices by period)
                spark = [round(float(v), 2) for v in close.tolist()]

                # 1D intraday sparkline (15m closes)
                spark_1d = None
                try:
                    intraday = fetch_price_cached(symbol, period="1d", interval="15m")
                    if len(intraday) > 1:
                        spark_1d = [round(float(v), 2) for v in intraday["close"].tolist()]
                except Exception:
                    spark_1d = None

                # 1W open+close per day (alternating points: open, close, ...)
                spark_1w = None
                try:
                    tail = df.tail(5)
                    if len(tail) > 0:
                        oc = []
                        for _, row in tail.iterrows():
                            oc.append(round(float(row["open"]), 2))
                            oc.append(round(float(row["close"]), 2))
                        spark_1w = oc
                except Exception:
                    spark_1w = None

                cat_data.append({
                    "name": name,
                    "symbol": symbol,
                    "price": round(price, 2),
                    "change_1d": round(change_1d, 2),
                    "changes": changes,
                    "sparkline": spark,
                    "sparkline_1d": spark_1d,
                    "sparkline_1w": spark_1w,
                })
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

            results.append({
                "name": name,
                "symbol": symbol.replace("-USD", ""),
                "price": round(price, 6 if price < 1 else 2),
                "change_1d": round((price / prev - 1) * 100, 2),
                "changes": changes,
                "market_cap": mcap,
                "volume_24h": round(vol_24h, 0) if vol_24h else None,
                "sparkline": spark,
            })
        except Exception:
            continue

    return {"coins": _sanitize(results)}


# ─── AI Agent Proxy ───
import httpx

AGENT_URL = "http://localhost:8888"

@app.post("/api/agent/chat")
async def agent_chat(request: Request):
    """Proxy chat to the AI agent on home-linux (full TradingAgents pipeline)."""
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{AGENT_URL}/chat", json=body)
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Agent timed out — the analysis is taking too long")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent unavailable: {str(e)}")

@app.post("/api/agent/quick")
async def agent_quick(request: Request):
    """Proxy quick analysis to AI agent (direct LLM, faster)."""
    body = await request.json()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{AGENT_URL}/quick", json=body)
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Agent timed out")
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
