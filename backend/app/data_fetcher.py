from __future__ import annotations
import yfinance as yf
import pandas as pd
import numpy as np
from ta.trend import SMAIndicator, EMAIndicator, MACD as MACD_Indicator
from ta.momentum import RSIIndicator
from ta.volatility import BollingerBands


def fetch_stock_data(
    symbol: str,
    period: str = "5y",
    interval: str = "1d",
) -> pd.DataFrame:
    """Fetch OHLCV data from Yahoo Finance."""
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    if df.empty:
        raise ValueError(f"No data found for {symbol}")
    df.index = df.index.tz_localize(None)
    df = df[["Open", "High", "Low", "Close", "Volume"]]
    df.columns = ["open", "high", "low", "close", "volume"]
    return df


def fetch_multiple(symbols: list[str], period: str = "5y", interval: str = "1d") -> dict[str, pd.DataFrame]:
    """Fetch data for multiple symbols."""
    result = {}
    for s in symbols:
        try:
            result[s] = fetch_stock_data(s, period, interval)
        except Exception:
            continue
    return result


def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add technical indicators — all use only past data (no leakage)."""
    df = df.copy()

    # SMA
    df["sma_20"] = SMAIndicator(df["close"], window=20).sma_indicator()
    df["sma_50"] = SMAIndicator(df["close"], window=50).sma_indicator()
    df["sma_200"] = SMAIndicator(df["close"], window=200).sma_indicator()

    # EMA
    df["ema_12"] = EMAIndicator(df["close"], window=12).ema_indicator()
    df["ema_26"] = EMAIndicator(df["close"], window=26).ema_indicator()

    # RSI
    df["rsi_14"] = RSIIndicator(df["close"], window=14).rsi()

    # MACD
    macd = MACD_Indicator(df["close"])
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_hist"] = macd.macd_diff()

    # Bollinger Bands
    bb = BollingerBands(df["close"], window=20, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_middle"] = bb.bollinger_mavg()
    df["bb_lower"] = bb.bollinger_lband()
    df["bb_width"] = bb.bollinger_wband()

    # Volume SMA
    df["volume_sma_20"] = SMAIndicator(df["volume"], window=20).sma_indicator()

    # Returns (past only — pct_change looks backward)
    df["returns_1d"] = df["close"].pct_change(1)
    df["returns_5d"] = df["close"].pct_change(5)
    df["returns_20d"] = df["close"].pct_change(20)

    # Realized volatility (backward-looking)
    df["volatility_20d"] = df["returns_1d"].rolling(20).std() * np.sqrt(252)

    return df


def prepare_ml_features(
    df: pd.DataFrame,
    index_data: dict[str, pd.DataFrame] | None = None,
) -> pd.DataFrame:
    """Prepare features for ML model. All features are strictly backward-looking."""
    df = add_technical_indicators(df)

    if index_data:
        for name, idx_df in index_data.items():
            idx_close = idx_df["close"].reindex(df.index, method="ffill")
            df[f"{name}_returns"] = idx_close.pct_change()
            df[f"{name}_rsi"] = RSIIndicator(idx_close.dropna(), window=14).rsi().reindex(df.index)

    df = df.dropna()
    return df


DEFAULT_INDICES = ["^GSPC", "^VIX", "^DJI", "^IXIC"]
