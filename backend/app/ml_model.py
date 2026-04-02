from __future__ import annotations
"""
Transformer-based stock prediction model.

Architecture: Encoder-only Transformer that takes a window of features
and predicts P(stock goes up X% in next N days).

Anti-leakage design:
- All features are strictly backward-looking
- Target labels use FUTURE returns (but only during label creation, never as features)
- Walk-forward training: model is retrained periodically on expanding window
- Purge gap between train and test to prevent information bleed
"""

import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler


class StockTransformer(nn.Module):
    """
    Encoder-only Transformer for binary classification.
    Input: (batch, seq_len, n_features)
    Output: (batch, 1) probability
    """

    def __init__(
        self,
        n_features: int,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.1,
        seq_len: int = 30,
    ):
        super().__init__()
        self.input_proj = nn.Linear(n_features, d_model)
        self.pos_encoding = nn.Parameter(torch.randn(1, seq_len, d_model) * 0.02)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.classifier = nn.Sequential(
            nn.Linear(d_model, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, n_features)
        x = self.input_proj(x) + self.pos_encoding[:, :x.size(1), :]
        x = self.transformer(x)
        # Use last token's representation
        x = x[:, -1, :]
        return self.classifier(x).squeeze(-1)


def create_sequences(
    features: np.ndarray,
    labels: np.ndarray,
    seq_len: int = 30,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Create sliding window sequences for the transformer.
    Each sequence uses only past data up to time t.
    Label corresponds to the FUTURE return starting at t.
    """
    X, y = [], []
    for i in range(seq_len, len(features)):
        X.append(features[i - seq_len:i])
        y.append(labels[i])
    return np.array(X), np.array(y)


def create_labels(
    df: pd.DataFrame,
    target_return_pct: float = 2.0,
    horizon_days: int = 5,
) -> pd.Series:
    """
    Create binary labels: 1 if stock goes up >= target_return_pct% in next horizon_days.
    These labels use future data BY DESIGN — they are targets, not features.
    """
    future_return = df["close"].shift(-horizon_days) / df["close"] - 1
    labels = (future_return >= target_return_pct / 100).astype(int)
    return labels


def train_model(
    X_train: np.ndarray,
    y_train: np.ndarray,
    n_features: int,
    seq_len: int = 30,
    epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 32,
    device: str = "cpu",
) -> StockTransformer:
    """Train the transformer model on provided data."""
    model = StockTransformer(
        n_features=n_features,
        seq_len=seq_len,
    ).to(device)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)

    # Handle class imbalance
    pos_count = y_train.sum()
    neg_count = len(y_train) - pos_count
    pos_weight = torch.tensor([neg_count / max(pos_count, 1)], dtype=torch.float32).to(device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)

    X_tensor = torch.FloatTensor(X_train).to(device)
    y_tensor = torch.FloatTensor(y_train).to(device)

    dataset = torch.utils.data.TensorDataset(X_tensor, y_tensor)
    loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

    model.train()
    for epoch in range(epochs):
        total_loss = 0
        for X_batch, y_batch in loader:
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()

    return model


def predict(model: StockTransformer, X: np.ndarray, device: str = "cpu") -> np.ndarray:
    """Get probability predictions."""
    model.eval()
    with torch.no_grad():
        X_tensor = torch.FloatTensor(X).to(device)
        logits = model(X_tensor)
        probs = torch.sigmoid(logits).cpu().numpy()
    return probs
