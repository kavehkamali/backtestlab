from __future__ import annotations
"""
Walk-forward ML backtesting with purged time-series cross-validation.

Anti-leakage protocol:
1. Walk-forward: retrain model every `retrain_every` bars on expanding window
2. Purge gap: `purge_days` gap between train end and test start
3. Embargo: labels that overlap into the test set are removed from training
4. Feature scaling fitted ONLY on training data
5. No future information in features (guaranteed by data_fetcher)
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from .ml_model import StockTransformer, create_sequences, create_labels, train_model, predict
from .data_fetcher import add_technical_indicators, fetch_stock_data, fetch_multiple, DEFAULT_INDICES


FEATURE_COLS = [
    "open", "high", "low", "close", "volume",
    "sma_20", "sma_50", "sma_200",
    "ema_12", "ema_26",
    "rsi_14",
    "macd", "macd_signal", "macd_hist",
    "bb_upper", "bb_middle", "bb_lower", "bb_width",
    "volume_sma_20",
    "returns_1d", "returns_5d", "returns_20d",
    "volatility_20d",
]


def run_ml_backtest(df: pd.DataFrame, config) -> "BacktestResult":
    """
    Walk-forward ML backtest.

    Steps:
    1. Add technical indicators (backward-looking only)
    2. Fetch index data for cross-market features
    3. Create labels (future returns — targets only)
    4. Walk forward: at each retrain point, fit model on all past data,
       predict on next segment
    5. Convert predictions to trading signals
    6. Simulate with transaction costs
    """
    from .backtester import _simulate, BacktestConfig

    params = config.params
    target_return_pct = params.get("target_return_pct", 2.0)
    horizon_days = params.get("horizon_days", 5)
    seq_len = params.get("seq_len", 30)
    retrain_every = params.get("retrain_every", 60)  # retrain every 60 bars
    min_train_size = params.get("min_train_size", 252)  # min 1 year of training data
    purge_days = params.get("purge_days", 10)  # gap between train and test
    prob_threshold = params.get("prob_threshold", 0.5)
    epochs = params.get("epochs", 30)

    # Add technical indicators
    df_feat = add_technical_indicators(df)

    # Fetch index data for extra features
    try:
        index_data = fetch_multiple(DEFAULT_INDICES, period="5y")
        for name, idx_df in index_data.items():
            idx_close = idx_df["close"].reindex(df_feat.index, method="ffill")
            col_name = name.replace("^", "")
            df_feat[f"{col_name}_returns"] = idx_close.pct_change()
            FEATURE_COLS_EXTENDED = FEATURE_COLS + [f"{col_name}_returns"]
    except Exception:
        FEATURE_COLS_EXTENDED = FEATURE_COLS.copy()

    # Create labels
    labels = create_labels(df_feat, target_return_pct, horizon_days)

    # Drop rows where features or labels are NaN
    valid_mask = df_feat[FEATURE_COLS].notna().all(axis=1) & labels.notna()
    df_feat = df_feat[valid_mask]
    labels = labels[valid_mask]

    # Use only available feature columns
    available_cols = [c for c in FEATURE_COLS_EXTENDED if c in df_feat.columns]
    features_raw = df_feat[available_cols].values
    labels_arr = labels.values
    n_features = len(available_cols)

    # Walk-forward prediction
    all_predictions = np.full(len(df_feat), np.nan)

    # Determine retrain points
    start_idx = min_train_size + seq_len
    retrain_points = list(range(start_idx, len(df_feat), retrain_every))
    if not retrain_points:
        retrain_points = [start_idx]

    device = "mps" if __import__("torch").backends.mps.is_available() else "cpu"

    for i, retrain_idx in enumerate(retrain_points):
        # Determine test range
        test_end = retrain_points[i + 1] if i + 1 < len(retrain_points) else len(df_feat)

        # Training data: everything before retrain_idx minus purge gap
        train_end = retrain_idx - purge_days - horizon_days  # embargo: remove labels that peek into test
        if train_end < seq_len + 10:
            continue

        # Fit scaler ONLY on training data
        scaler = StandardScaler()
        train_features = scaler.fit_transform(features_raw[:train_end])

        # Scale test features using training scaler (no leakage)
        test_features = scaler.transform(features_raw[:test_end])

        # Create sequences for training
        X_train, y_train = create_sequences(train_features, labels_arr[:train_end], seq_len)
        if len(X_train) < 50:
            continue

        # Train model
        model = train_model(
            X_train, y_train,
            n_features=n_features,
            seq_len=seq_len,
            epochs=epochs,
            device=device,
        )

        # Predict on test segment
        for t in range(retrain_idx, test_end):
            if t < seq_len:
                continue
            seq = test_features[t - seq_len:t].reshape(1, seq_len, n_features)
            prob = predict(model, seq, device=device)[0]
            all_predictions[t] = prob

    # Convert predictions to signals
    signals = pd.Series(0, index=df_feat.index)
    pred_series = pd.Series(all_predictions, index=df_feat.index)
    signals[pred_series >= prob_threshold] = 1
    signals[pred_series < prob_threshold] = 0
    signals[pred_series.isna()] = 0

    # Shift signals: act on next bar (no look-ahead)
    signals = signals.shift(1).fillna(0)

    # Align df to the featured df
    return _simulate(df_feat, signals, config)
