from __future__ import annotations
"""
Rule-based AI analysis engine for stock technical analysis.
No LLM needed — structured text generation from technical indicators.
"""

import pandas as pd
import numpy as np
from ta.momentum import RSIIndicator
from ta.trend import MACD as MACD_Indicator, SMAIndicator, EMAIndicator
from ta.volatility import BollingerBands


def analyze_stock(df: pd.DataFrame, symbol: str) -> dict:
    """
    Comprehensive technical analysis for a stock.
    Returns structured JSON with trend, momentum, volatility, S/R, risk, and summary.
    """
    if len(df) < 50:
        return {"error": "Not enough data", "symbol": symbol}

    close = df["close"]
    high = df["high"]
    low = df["low"]
    price = float(close.iloc[-1])

    # ─── SMAs ───
    sma20 = float(close.rolling(20).mean().iloc[-1])
    sma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else sma20
    sma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else sma50

    above_sma20 = price > sma20
    above_sma50 = price > sma50
    above_sma200 = price > sma200

    # ─── Trend ───
    sma_score = sum([above_sma20, above_sma50, above_sma200])
    if sma_score == 3:
        trend = "strong_bullish"
        trend_label = "Strong Uptrend"
    elif sma_score == 2:
        trend = "bullish"
        trend_label = "Uptrend"
    elif sma_score == 1:
        trend = "bearish"
        trend_label = "Downtrend"
    else:
        trend = "strong_bearish"
        trend_label = "Strong Downtrend"

    # Golden/Death cross
    cross_signal = None
    if len(close) >= 200:
        sma50_prev = float(close.rolling(50).mean().iloc[-2])
        sma200_prev = float(close.rolling(200).mean().iloc[-2])
        if sma50_prev < sma200_prev and sma50 > sma200:
            cross_signal = "Golden Cross (SMA 50 crossed above SMA 200) — bullish long-term signal"
        elif sma50_prev > sma200_prev and sma50 < sma200:
            cross_signal = "Death Cross (SMA 50 crossed below SMA 200) — bearish long-term signal"

    # ─── Momentum ───
    rsi = RSIIndicator(close, window=14).rsi()
    rsi_val = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else 50
    rsi_prev = float(rsi.iloc[-2]) if len(rsi) > 1 and not np.isnan(rsi.iloc[-2]) else rsi_val
    rsi_direction = "rising" if rsi_val > rsi_prev else "falling"

    macd_ind = MACD_Indicator(close)
    macd_val = float(macd_ind.macd().iloc[-1]) if not np.isnan(macd_ind.macd().iloc[-1]) else 0
    macd_sig = float(macd_ind.macd_signal().iloc[-1]) if not np.isnan(macd_ind.macd_signal().iloc[-1]) else 0
    macd_hist = float(macd_ind.macd_diff().iloc[-1]) if not np.isnan(macd_ind.macd_diff().iloc[-1]) else 0
    macd_prev = float(macd_ind.macd_diff().iloc[-2]) if len(macd_ind.macd_diff()) > 1 and not np.isnan(macd_ind.macd_diff().iloc[-2]) else 0
    macd_direction = "rising" if macd_hist > macd_prev else "falling"
    macd_cross = "bullish" if macd_val > macd_sig and macd_prev <= 0 else "bearish" if macd_val < macd_sig and macd_prev >= 0 else None

    if rsi_val >= 70:
        rsi_zone = "overbought"
    elif rsi_val <= 30:
        rsi_zone = "oversold"
    elif rsi_val >= 60:
        rsi_zone = "bullish"
    elif rsi_val <= 40:
        rsi_zone = "bearish"
    else:
        rsi_zone = "neutral"

    # ─── Volatility ───
    bb = BollingerBands(close, window=20, window_dev=2)
    bb_width = float(bb.bollinger_wband().iloc[-1]) if not np.isnan(bb.bollinger_wband().iloc[-1]) else 0
    bb_upper = float(bb.bollinger_hband().iloc[-1])
    bb_lower = float(bb.bollinger_lband().iloc[-1])
    bb_pos = (price - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) > 0 else 0.5

    returns = close.pct_change().dropna()
    vol_20d = float(returns.iloc[-20:].std() * np.sqrt(252) * 100) if len(returns) >= 20 else 0
    vol_60d = float(returns.iloc[-60:].std() * np.sqrt(252) * 100) if len(returns) >= 60 else vol_20d

    if vol_20d > vol_60d * 1.5:
        vol_regime = "high"
    elif vol_20d < vol_60d * 0.7:
        vol_regime = "low"
    else:
        vol_regime = "normal"

    # ─── Support / Resistance ───
    recent = df.iloc[-60:] if len(df) >= 60 else df
    swing_highs = []
    swing_lows = []
    for i in range(2, len(recent) - 2):
        h = float(recent["high"].iloc[i])
        l = float(recent["low"].iloc[i])
        if h > float(recent["high"].iloc[i-1]) and h > float(recent["high"].iloc[i-2]) and h > float(recent["high"].iloc[i+1]) and h > float(recent["high"].iloc[i+2]):
            swing_highs.append(round(h, 2))
        if l < float(recent["low"].iloc[i-1]) and l < float(recent["low"].iloc[i-2]) and l < float(recent["low"].iloc[i+1]) and l < float(recent["low"].iloc[i+2]):
            swing_lows.append(round(l, 2))

    resistance = sorted(set([h for h in swing_highs if h > price]))[:3]
    support = sorted(set([l for l in swing_lows if l < price]), reverse=True)[:3]

    # ─── Pattern Detection ───
    patterns = []
    if bb_pos > 0.95:
        patterns.append("Price at upper Bollinger Band — potential resistance or breakout")
    if bb_pos < 0.05:
        patterns.append("Price at lower Bollinger Band — potential support or breakdown")
    if rsi_val < 30 and rsi_direction == "rising":
        patterns.append("RSI recovering from oversold — potential reversal signal")
    if rsi_val > 70 and rsi_direction == "falling":
        patterns.append("RSI declining from overbought — potential pullback signal")
    if macd_cross == "bullish":
        patterns.append("MACD bullish crossover — momentum shifting positive")
    if macd_cross == "bearish":
        patterns.append("MACD bearish crossover — momentum shifting negative")
    if above_sma20 and not above_sma50:
        patterns.append("Price between SMA 20 and SMA 50 — short-term strength, mid-term uncertainty")
    if cross_signal:
        patterns.append(cross_signal)

    # Volume analysis
    vol_sma = float(df["volume"].rolling(20).mean().iloc[-1])
    vol_today = float(df["volume"].iloc[-1])
    vol_ratio = vol_today / vol_sma if vol_sma > 0 else 1.0
    if vol_ratio > 2.0:
        patterns.append(f"Unusually high volume ({vol_ratio:.1f}x average) — strong conviction in move")
    elif vol_ratio < 0.5:
        patterns.append(f"Low volume ({vol_ratio:.1f}x average) — weak participation, move may lack follow-through")

    # ─── Signal Strength (0-100) ───
    score = 50
    # Trend
    score += (sma_score - 1.5) * 10  # -15 to +15
    # Momentum
    if rsi_zone == "bullish":
        score += 8
    elif rsi_zone == "oversold" and rsi_direction == "rising":
        score += 12
    elif rsi_zone == "bearish":
        score -= 8
    elif rsi_zone == "overbought" and rsi_direction == "falling":
        score -= 12
    # MACD
    if macd_hist > 0 and macd_direction == "rising":
        score += 10
    elif macd_hist < 0 and macd_direction == "falling":
        score -= 10
    # Volume confirmation
    if vol_ratio > 1.5 and trend in ("bullish", "strong_bullish"):
        score += 5
    score = max(0, min(100, score))

    if score >= 70:
        signal = "bullish"
        signal_label = "Bullish"
    elif score >= 55:
        signal = "mildly_bullish"
        signal_label = "Mildly Bullish"
    elif score >= 45:
        signal = "neutral"
        signal_label = "Neutral"
    elif score >= 30:
        signal = "mildly_bearish"
        signal_label = "Mildly Bearish"
    else:
        signal = "bearish"
        signal_label = "Bearish"

    # ─── Risk Assessment ───
    risks = []
    if vol_regime == "high":
        risks.append("Elevated volatility increases risk of sharp reversals")
    if rsi_zone == "overbought":
        risks.append("RSI overbought — risk of pullback")
    if rsi_zone == "oversold":
        risks.append("RSI oversold — could continue lower or bounce")
    if not above_sma200:
        risks.append("Below 200-day SMA — long-term trend is bearish")
    if bb_pos > 0.9:
        risks.append("Extended at upper Bollinger Band")
    if bb_pos < 0.1:
        risks.append("Near lower Bollinger Band — potential dead cat bounce risk")

    # ─── Summary ───
    summary_parts = []
    summary_parts.append(f"{symbol} is in a {trend_label.lower()} with price {'above' if above_sma20 else 'below'} the 20-day SMA at ${price:.2f}.")

    if rsi_zone in ("overbought", "oversold"):
        summary_parts.append(f"RSI at {rsi_val:.0f} is {rsi_zone} and {rsi_direction}.")
    else:
        summary_parts.append(f"RSI at {rsi_val:.0f} is {rsi_zone} with {macd_direction} MACD momentum.")

    if patterns:
        summary_parts.append(patterns[0] + ".")

    summary = " ".join(summary_parts)

    return {
        "symbol": symbol,
        "price": round(price, 2),
        "summary": summary,
        "signal": signal,
        "signal_label": signal_label,
        "signal_strength": round(score),
        "trend": {
            "direction": trend,
            "label": trend_label,
            "above_sma20": above_sma20,
            "above_sma50": above_sma50,
            "above_sma200": above_sma200,
            "sma20": round(sma20, 2),
            "sma50": round(sma50, 2),
            "sma200": round(sma200, 2),
        },
        "momentum": {
            "rsi": round(rsi_val, 1),
            "rsi_zone": rsi_zone,
            "rsi_direction": rsi_direction,
            "macd": round(macd_val, 3),
            "macd_signal": round(macd_sig, 3),
            "macd_histogram": round(macd_hist, 3),
            "macd_direction": macd_direction,
        },
        "volatility": {
            "regime": vol_regime,
            "vol_20d": round(vol_20d, 1),
            "vol_60d": round(vol_60d, 1),
            "bb_position": round(bb_pos, 2),
            "bb_width": round(bb_width, 4),
        },
        "support_resistance": {
            "support": support,
            "resistance": resistance,
        },
        "patterns": patterns,
        "risks": risks,
        "volume_ratio": round(vol_ratio, 2),
    }
