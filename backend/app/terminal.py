from __future__ import annotations
"""
Terminal API endpoints — optimized for the trading terminal UI.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import pandas as pd
import numpy as np
from .cache import fetch_price_cached, batch_fetch_prices

router = APIRouter(prefix="/api/terminal", tags=["terminal"])


@router.get("/chart/{symbol}")
def get_chart_data(
    symbol: str,
    period: str = "1y",
    interval: str = "1d",
):
    """OHLCV data formatted for lightweight-charts."""
    import yfinance as yf

    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty:
            raise ValueError(f"No data for {symbol}")

        df.index = df.index.tz_localize(None)

        data = []
        for i in range(len(df)):
            ts = df.index[i]
            # For daily data, use YYYY-MM-DD string; for intraday, use unix timestamp
            if interval in ("1d", "1wk", "1mo"):
                time_val = ts.strftime("%Y-%m-%d")
            else:
                time_val = int(ts.timestamp())

            data.append({
                "time": time_val,
                "open": round(float(df["Open"].iloc[i]), 4),
                "high": round(float(df["High"].iloc[i]), 4),
                "low": round(float(df["Low"].iloc[i]), 4),
                "close": round(float(df["Close"].iloc[i]), 4),
                "volume": int(df["Volume"].iloc[i]) if not np.isnan(df["Volume"].iloc[i]) else 0,
            })

        return {"symbol": symbol, "interval": interval, "data": data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/indicators/{symbol}")
def get_indicators(
    symbol: str,
    period: str = "1y",
    interval: str = "1d",
    indicators: str = "sma_20,sma_50,sma_200,rsi_14,macd,bollinger,volume",
):
    """Computed indicator data for chart overlay."""
    import yfinance as yf
    from ta.momentum import RSIIndicator
    from ta.trend import MACD as MACD_Indicator, SMAIndicator, EMAIndicator
    from ta.volatility import BollingerBands

    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=interval)
        if df.empty:
            raise ValueError(f"No data for {symbol}")

        df.index = df.index.tz_localize(None)
        close = df["Close"]
        indicator_list = [i.strip() for i in indicators.split(",")]

        def make_time(ts):
            if interval in ("1d", "1wk", "1mo"):
                return ts.strftime("%Y-%m-%d")
            return int(ts.timestamp())

        result = {}

        for ind in indicator_list:
            try:
                if ind.startswith("sma_"):
                    period_n = int(ind.split("_")[1])
                    sma = close.rolling(period_n).mean()
                    result[ind] = [{"time": make_time(df.index[i]), "value": round(float(sma.iloc[i]), 4)}
                                   for i in range(len(sma)) if not np.isnan(sma.iloc[i])]

                elif ind.startswith("ema_"):
                    period_n = int(ind.split("_")[1])
                    ema = close.ewm(span=period_n, adjust=False).mean()
                    result[ind] = [{"time": make_time(df.index[i]), "value": round(float(ema.iloc[i]), 4)}
                                   for i in range(len(ema)) if not np.isnan(ema.iloc[i])]

                elif ind.startswith("rsi"):
                    period_n = int(ind.split("_")[1]) if "_" in ind else 14
                    rsi = RSIIndicator(close, window=period_n).rsi()
                    result["rsi"] = [{"time": make_time(df.index[i]), "value": round(float(rsi.iloc[i]), 2)}
                                     for i in range(len(rsi)) if not np.isnan(rsi.iloc[i])]

                elif ind == "macd":
                    macd = MACD_Indicator(close)
                    macd_line = macd.macd()
                    signal_line = macd.macd_signal()
                    histogram = macd.macd_diff()
                    result["macd_line"] = [{"time": make_time(df.index[i]), "value": round(float(macd_line.iloc[i]), 4)}
                                           for i in range(len(macd_line)) if not np.isnan(macd_line.iloc[i])]
                    result["macd_signal"] = [{"time": make_time(df.index[i]), "value": round(float(signal_line.iloc[i]), 4)}
                                             for i in range(len(signal_line)) if not np.isnan(signal_line.iloc[i])]
                    result["macd_histogram"] = [{"time": make_time(df.index[i]), "value": round(float(histogram.iloc[i]), 4),
                                                  "color": "#22c55e80" if histogram.iloc[i] >= 0 else "#ef444480"}
                                                for i in range(len(histogram)) if not np.isnan(histogram.iloc[i])]

                elif ind == "bollinger":
                    bb = BollingerBands(close, window=20, window_dev=2)
                    for name, series in [("bb_upper", bb.bollinger_hband()), ("bb_lower", bb.bollinger_lband()), ("bb_middle", bb.bollinger_mavg())]:
                        result[name] = [{"time": make_time(df.index[i]), "value": round(float(series.iloc[i]), 4)}
                                        for i in range(len(series)) if not np.isnan(series.iloc[i])]

                elif ind == "volume":
                    vol = df["Volume"]
                    result["volume"] = [{"time": make_time(df.index[i]),
                                         "value": int(vol.iloc[i]) if not np.isnan(vol.iloc[i]) else 0,
                                         "color": "#22c55e20" if df["Close"].iloc[i] >= df["Open"].iloc[i] else "#ef444420"}
                                        for i in range(len(vol))]

            except Exception:
                continue

        return {"symbol": symbol, "indicators": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ai-insight")
def ai_insight(body: dict):
    """AI-powered technical analysis."""
    import math
    symbol = body.get("symbol", "AAPL")
    period = body.get("period", "1y")

    try:
        df = fetch_price_cached(symbol, period=period)
        if len(df) < 20:
            raise ValueError("Not enough data")

        from .ai_analysis import analyze_stock
        result = analyze_stock(df, symbol)

        # Sanitize NaN/Inf
        def sanitize(obj):
            if isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return 0
                return obj
            if isinstance(obj, dict):
                return {k: sanitize(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [sanitize(v) for v in obj]
            return obj

        return sanitize(result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/watchlist-prices")
def watchlist_prices(symbols: str = "AAPL,MSFT,GOOGL"):
    """Lightweight batch price fetch for watchlist."""
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()][:20]
    prices = batch_fetch_prices(symbol_list, period="5d")

    result = []
    for sym in symbol_list:
        df = prices.get(sym)
        if df is None or len(df) < 2:
            continue
        price = float(df["close"].iloc[-1])
        prev = float(df["close"].iloc[-2])
        change = (price / prev - 1) * 100

        spark = [round(float(v), 2) for v in df["close"].iloc[-5:].tolist()]

        result.append({
            "symbol": sym,
            "price": round(price, 2),
            "change": round(change, 2),
            "sparkline": spark,
        })

    return {"prices": result}
