from __future__ import annotations
"""
Backtesting engine with strict no-leakage guarantees.

Key anti-leakage measures:
1. All signals computed using only data available at signal time
2. Walk-forward validation for ML strategies
3. Purged gaps between train/test for ML
4. No future returns, prices, or indicators in feature computation
5. Transaction costs included
"""

import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from enum import Enum


class StrategyType(str, Enum):
    SMA_CROSSOVER = "sma_crossover"
    EMA_CROSSOVER = "ema_crossover"
    RSI = "rsi"
    MACD = "macd"
    BOLLINGER_BANDS = "bollinger_bands"
    MEAN_REVERSION = "mean_reversion"
    MOMENTUM = "momentum"
    BUY_AND_HOLD = "buy_and_hold"
    ML_TRANSFORMER = "ml_transformer"


@dataclass
class BacktestConfig:
    strategy: StrategyType
    symbol: str
    start_date: str | None = None
    end_date: str | None = None
    initial_capital: float = 100_000.0
    commission_pct: float = 0.001  # 0.1% per trade
    slippage_pct: float = 0.0005  # 0.05% slippage
    position_size: float = 1.0  # fraction of capital per trade
    # Strategy-specific params
    params: dict = field(default_factory=dict)


@dataclass
class BacktestResult:
    strategy: str
    symbol: str
    total_return_pct: float
    annual_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    win_rate: float
    num_trades: int
    profit_factor: float
    avg_trade_return_pct: float
    calmar_ratio: float
    sortino_ratio: float
    equity_curve: list[dict]  # [{date, equity, drawdown}]
    trades: list[dict]  # [{date, type, price, shares, pnl}]
    monthly_returns: list[dict]  # [{month, return_pct}]


def _compute_signals_sma_crossover(df: pd.DataFrame, params: dict) -> pd.Series:
    """SMA crossover: buy when fast SMA > slow SMA, sell when fast < slow."""
    fast = params.get("fast_period", 20)
    slow = params.get("slow_period", 50)
    sma_fast = df["close"].rolling(fast).mean()
    sma_slow = df["close"].rolling(slow).mean()
    signal = pd.Series(0, index=df.index)
    signal[sma_fast > sma_slow] = 1
    signal[sma_fast <= sma_slow] = -1
    return signal


def _compute_signals_ema_crossover(df: pd.DataFrame, params: dict) -> pd.Series:
    """EMA crossover: buy when fast EMA > slow EMA."""
    fast = params.get("fast_period", 12)
    slow = params.get("slow_period", 26)
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    signal = pd.Series(0, index=df.index)
    signal[ema_fast > ema_slow] = 1
    signal[ema_fast <= ema_slow] = -1
    return signal


def _compute_signals_rsi(df: pd.DataFrame, params: dict) -> pd.Series:
    """RSI: buy when oversold, sell when overbought."""
    period = params.get("period", 14)
    oversold = params.get("oversold", 30)
    overbought = params.get("overbought", 70)

    delta = df["close"].diff()
    gain = delta.where(delta > 0, 0.0).rolling(period).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    signal = pd.Series(0, index=df.index)
    signal[rsi < oversold] = 1
    signal[rsi > overbought] = -1
    return signal


def _compute_signals_macd(df: pd.DataFrame, params: dict) -> pd.Series:
    """MACD: buy on signal line crossover, sell on cross-under."""
    fast = params.get("fast_period", 12)
    slow = params.get("slow_period", 26)
    signal_period = params.get("signal_period", 9)

    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal_period, adjust=False).mean()

    signal = pd.Series(0, index=df.index)
    signal[macd_line > signal_line] = 1
    signal[macd_line <= signal_line] = -1
    return signal


def _compute_signals_bollinger(df: pd.DataFrame, params: dict) -> pd.Series:
    """Bollinger Bands: buy at lower band, sell at upper band (mean reversion)."""
    period = params.get("period", 20)
    num_std = params.get("num_std", 2.0)

    sma = df["close"].rolling(period).mean()
    std = df["close"].rolling(period).std()
    upper = sma + num_std * std
    lower = sma - num_std * std

    signal = pd.Series(0, index=df.index)
    signal[df["close"] < lower] = 1
    signal[df["close"] > upper] = -1
    return signal


def _compute_signals_mean_reversion(df: pd.DataFrame, params: dict) -> pd.Series:
    """Mean reversion: buy when price deviates below mean, sell above."""
    lookback = params.get("lookback", 20)
    entry_z = params.get("entry_z", -1.5)
    exit_z = params.get("exit_z", 1.5)

    sma = df["close"].rolling(lookback).mean()
    std = df["close"].rolling(lookback).std()
    z_score = (df["close"] - sma) / std.replace(0, np.nan)

    signal = pd.Series(0, index=df.index)
    signal[z_score < entry_z] = 1
    signal[z_score > exit_z] = -1
    return signal


def _compute_signals_momentum(df: pd.DataFrame, params: dict) -> pd.Series:
    """Momentum: buy when returns over lookback are positive."""
    lookback = params.get("lookback", 20)
    threshold = params.get("threshold", 0.0)

    momentum = df["close"].pct_change(lookback)
    signal = pd.Series(0, index=df.index)
    signal[momentum > threshold] = 1
    signal[momentum <= threshold] = -1
    return signal


STRATEGY_MAP = {
    StrategyType.SMA_CROSSOVER: _compute_signals_sma_crossover,
    StrategyType.EMA_CROSSOVER: _compute_signals_ema_crossover,
    StrategyType.RSI: _compute_signals_rsi,
    StrategyType.MACD: _compute_signals_macd,
    StrategyType.BOLLINGER_BANDS: _compute_signals_bollinger,
    StrategyType.MEAN_REVERSION: _compute_signals_mean_reversion,
    StrategyType.MOMENTUM: _compute_signals_momentum,
}


def run_backtest(df: pd.DataFrame, config: BacktestConfig) -> BacktestResult:
    """
    Run backtest with strict no-leakage simulation.

    Signals are computed on data available up to each bar.
    Execution happens at NEXT bar's open (realistic fill).
    """
    df = df.copy()

    # Filter date range
    if config.start_date:
        df = df[df.index >= config.start_date]
    if config.end_date:
        df = df[df.index <= config.end_date]

    if len(df) < 50:
        raise ValueError("Not enough data for backtest (need >= 50 bars)")

    # Buy and hold baseline
    if config.strategy == StrategyType.BUY_AND_HOLD:
        return _run_buy_and_hold(df, config)

    # ML strategy handled separately (walk-forward)
    if config.strategy == StrategyType.ML_TRANSFORMER:
        from .ml_backtest import run_ml_backtest
        return run_ml_backtest(df, config)

    # Compute signals using strategy function
    signal_fn = STRATEGY_MAP[config.strategy]
    signals = signal_fn(df, config.params)

    # Shift signals by 1: trade on NEXT bar (no look-ahead)
    signals = signals.shift(1).fillna(0)

    return _simulate(df, signals, config)


def _run_buy_and_hold(df: pd.DataFrame, config: BacktestConfig) -> BacktestResult:
    """Simple buy and hold benchmark."""
    signals = pd.Series(1, index=df.index)
    return _simulate(df, signals, config)


def _simulate(df: pd.DataFrame, signals: pd.Series, config: BacktestConfig) -> BacktestResult:
    """
    Simulate trading with transaction costs and slippage.

    - Signals: 1 = long, -1 = short/flat, 0 = no position
    - Execution at current bar's open price (signal was generated on previous bar's close)
    - Commission and slippage applied on each trade
    """
    capital = config.initial_capital
    position = 0  # number of shares
    equity_curve = []
    trades = []
    prev_signal = 0

    for i in range(len(df)):
        date = df.index[i]
        price = df["close"].iloc[i]
        open_price = df["open"].iloc[i]
        sig = signals.iloc[i]

        # Execute trade if signal changed
        if sig != prev_signal:
            # Close existing position
            if position != 0:
                close_price = open_price * (1 - config.slippage_pct * np.sign(position))
                pnl = position * (close_price - entry_price)
                commission = abs(position * close_price) * config.commission_pct
                capital += position * close_price - commission
                trades.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "type": "sell" if position > 0 else "cover",
                    "price": round(close_price, 2),
                    "shares": abs(position),
                    "pnl": round(pnl - commission, 2),
                })
                position = 0

            # Open new position
            if sig == 1:
                buy_price = open_price * (1 + config.slippage_pct)
                shares = int((capital * config.position_size) / buy_price)
                if shares > 0:
                    commission = shares * buy_price * config.commission_pct
                    capital -= shares * buy_price + commission
                    position = shares
                    entry_price = buy_price
                    trades.append({
                        "date": date.strftime("%Y-%m-%d"),
                        "type": "buy",
                        "price": round(buy_price, 2),
                        "shares": shares,
                        "pnl": 0,
                    })
            elif sig == -1 and prev_signal == 1:
                pass  # just closed, go flat

        # Mark-to-market equity
        mtm = capital + position * price
        equity_curve.append({
            "date": date.strftime("%Y-%m-%d"),
            "equity": round(mtm, 2),
        })
        prev_signal = sig

    # Close any remaining position
    if position != 0:
        close_price = df["close"].iloc[-1]
        pnl = position * (close_price - entry_price)
        commission = abs(position * close_price) * config.commission_pct
        capital += position * close_price - commission
        trades.append({
            "date": df.index[-1].strftime("%Y-%m-%d"),
            "type": "sell",
            "price": round(close_price, 2),
            "shares": abs(position),
            "pnl": round(pnl - commission, 2),
        })

    return _compute_metrics(equity_curve, trades, config)


def _compute_metrics(
    equity_curve: list[dict],
    trades: list[dict],
    config: BacktestConfig,
) -> BacktestResult:
    """Compute performance metrics from equity curve and trades."""
    equities = pd.Series([e["equity"] for e in equity_curve])
    dates = pd.to_datetime([e["date"] for e in equity_curve])

    # Returns
    daily_returns = equities.pct_change().dropna()
    total_return = (equities.iloc[-1] / equities.iloc[0]) - 1

    # Annualized return
    n_days = (dates[-1] - dates[0]).days
    annual_return = (1 + total_return) ** (365 / max(n_days, 1)) - 1 if n_days > 0 else 0

    # Sharpe ratio (assuming 0 risk-free rate)
    sharpe = (daily_returns.mean() / daily_returns.std() * np.sqrt(252)) if daily_returns.std() > 0 else 0

    # Max drawdown
    cummax = equities.cummax()
    drawdown = (equities - cummax) / cummax
    max_dd = drawdown.min()

    # Add drawdown to equity curve
    for i, ec in enumerate(equity_curve):
        ec["drawdown"] = round(drawdown.iloc[i] * 100, 2)

    # Trade metrics
    trade_pnls = [t["pnl"] for t in trades if t["type"] in ("sell", "cover")]
    wins = [p for p in trade_pnls if p > 0]
    losses = [p for p in trade_pnls if p <= 0]
    win_rate = len(wins) / len(trade_pnls) if trade_pnls else 0
    avg_trade = np.mean(trade_pnls) if trade_pnls else 0
    profit_factor = (sum(wins) / abs(sum(losses))) if losses and sum(losses) != 0 else 999.99 if wins else 0

    # Calmar ratio
    calmar = annual_return / abs(max_dd) if max_dd != 0 else 0

    # Sortino ratio
    downside = daily_returns[daily_returns < 0]
    sortino = (daily_returns.mean() / downside.std() * np.sqrt(252)) if len(downside) > 0 and downside.std() > 0 else 0

    # Monthly returns
    monthly = daily_returns.copy()
    monthly.index = dates[1:]
    monthly_grouped = monthly.groupby(monthly.index.to_period("M")).apply(lambda x: (1 + x).prod() - 1)
    monthly_returns = [
        {"month": str(m), "return_pct": round(r * 100, 2)}
        for m, r in monthly_grouped.items()
    ]

    return BacktestResult(
        strategy=config.strategy.value,
        symbol=config.symbol,
        total_return_pct=round(total_return * 100, 2),
        annual_return_pct=round(annual_return * 100, 2),
        sharpe_ratio=round(sharpe, 3),
        max_drawdown_pct=round(max_dd * 100, 2),
        win_rate=round(win_rate * 100, 1),
        num_trades=len(trade_pnls),
        profit_factor=round(profit_factor, 2),
        avg_trade_return_pct=round(avg_trade / config.initial_capital * 100, 3),
        calmar_ratio=round(calmar, 3),
        sortino_ratio=round(sortino, 3),
        equity_curve=equity_curve,
        trades=trades,
        monthly_returns=monthly_returns,
    )
