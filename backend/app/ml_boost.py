"""Walk-forward gradient-boosting signal (sklearn) — strict anti-leakage.

Protocol (same discipline as ml_backtest.py):
1. Expanding-window walk-forward: retrain every `retrain_every` bars; the model
   used at bar t was fitted ONLY on bars whose labels were fully realized
   before the training cut.
2. Purge/embargo: the last `horizon` bars before each training cut are dropped
   from the training set because their labels overlap the future.
3. Features are backward-looking indicator values only.
4. The returned signal series is shifted by run_backtest before simulation, so
   execution is always next-bar-open.

Signals use probability hysteresis (enter > p_hi, exit < p_lo) to avoid
churning on 50/50 noise — costs kill high-turnover ML strategies.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    c = df["close"]
    f = pd.DataFrame(index=df.index)
    # returns at several horizons
    for n in (1, 5, 10, 21, 63):
        f[f"ret_{n}"] = c.pct_change(n)
    # trend / distance features
    for n in (20, 50, 200):
        sma = c.rolling(n).mean()
        f[f"dist_sma{n}"] = c / sma - 1
    f["mom_12_1"] = c.shift(21) / c.shift(252) - 1
    # volatility
    r1 = c.pct_change()
    f["vol_21"] = r1.rolling(21).std()
    f["vol_63"] = r1.rolling(63).std()
    f["vol_ratio"] = f["vol_21"] / f["vol_63"]
    # RSI
    delta = c.diff()
    gain = delta.where(delta > 0, 0.0).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(14).mean()
    f["rsi"] = 100 - (100 / (1 + gain / loss.replace(0, np.nan)))
    # MACD histogram (normalized by price)
    ema12 = c.ewm(span=12, adjust=False).mean()
    ema26 = c.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    f["macd_hist"] = (macd - macd.ewm(span=9, adjust=False).mean()) / c
    # range position + volume
    f["pos_52w"] = (c - c.rolling(252).min()) / (c.rolling(252).max() - c.rolling(252).min())
    if "volume" in df:
        v = df["volume"].astype(float)
        f["vol_z"] = (v - v.rolling(63).mean()) / v.rolling(63).std()
    return f


def compute_ml_boost_signals(df: pd.DataFrame, params: dict) -> pd.Series:
    """Return a 1/-1 signal series aligned to df.index (pre-shift)."""
    from sklearn.ensemble import HistGradientBoostingClassifier

    horizon = int(params.get("horizon_days", 10))
    retrain_every = int(params.get("retrain_every", 63))
    min_train = int(params.get("min_train", 504))  # ~2y before first trade
    p_hi = float(params.get("prob_enter", 0.58))
    p_lo = float(params.get("prob_exit", 0.45))

    feats = _build_features(df)
    # label: forward `horizon`-day return positive after ~costs
    fwd = df["close"].shift(-horizon) / df["close"] - 1
    label = (fwd > 0.001).astype(int)

    valid = feats.dropna().index
    feats = feats.loc[valid]
    label = label.loc[valid]
    n = len(feats)
    proba = pd.Series(np.nan, index=feats.index)

    if n < min_train + retrain_every:
        # not enough history to train honestly — stay out
        return pd.Series(-1, index=df.index)

    model = None
    for start in range(min_train, n, retrain_every):
        end = min(start + retrain_every, n)
        # training set: everything before `start`, minus the purge window whose
        # labels look into the test period
        train_end = start - horizon
        if train_end < 200:
            continue
        X_tr = feats.iloc[:train_end].values
        y_tr = label.iloc[:train_end].values
        if len(np.unique(y_tr)) < 2:
            continue
        model = HistGradientBoostingClassifier(
            max_depth=3, max_iter=120, learning_rate=0.08,
            l2_regularization=1.0, random_state=42,
        )
        model.fit(X_tr, y_tr)
        X_te = feats.iloc[start:end].values
        proba.iloc[start:end] = model.predict_proba(X_te)[:, 1]

    # hysteresis: enter long above p_hi, exit below p_lo, hold in between
    sig = pd.Series(np.nan, index=feats.index)
    sig[proba > p_hi] = 1
    sig[proba < p_lo] = -1
    sig = sig.ffill().fillna(-1)

    # reindex to the full df (leading warmup bars = out of market)
    return sig.reindex(df.index).fillna(-1)
