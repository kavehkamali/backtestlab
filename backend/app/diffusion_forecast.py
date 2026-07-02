"""Walk-forward conditional diffusion forecaster (denoising diffusion, torch).

A small but real DDPM: an MLP denoiser learns the distribution of the next
`horizon` days of returns conditioned on the recent return/vol context. At
test time we SAMPLE many future paths and go long only when the sampled
distribution is convincingly positive — trading the forecast distribution,
not a point estimate.

Anti-leakage protocol (same as the other ML strategies):
- walk-forward retraining; the model scoring a window was trained only on
  windows whose targets completed before the training cut (purge = horizon)
- context features are backward-looking only
- signals are shifted next-bar by the simulator
"""

from __future__ import annotations

import numpy as np
import pandas as pd

T_STEPS = 24          # diffusion timesteps
CTX_LEN = 30          # days of return context


def _diffusion_schedule():
    import torch
    betas = torch.linspace(1e-4, 0.05, T_STEPS)
    alphas = 1.0 - betas
    abar = torch.cumprod(alphas, dim=0)
    return betas, alphas, abar


def _make_dataset(rets: np.ndarray, horizon: int):
    """(context, target-path) pairs; scaled by rolling vol for stationarity."""
    X, Y = [], []
    for i in range(CTX_LEN, len(rets) - horizon):
        ctx = rets[i - CTX_LEN:i]
        tgt = rets[i:i + horizon]
        s = ctx.std() or 1e-4
        X.append(ctx / s)
        Y.append(tgt / s)
    return np.array(X, np.float32), np.array(Y, np.float32)


def compute_diffusion_signals(df: pd.DataFrame, params: dict) -> pd.Series:
    import torch
    import torch.nn as nn

    horizon = int(params.get("horizon_days", 10))
    retrain_every = int(params.get("retrain_every", 126))
    min_train = int(params.get("min_train", 756))  # ~3y
    epochs = int(params.get("epochs", 40))
    n_samples = int(params.get("n_samples", 48))
    p_hi = float(params.get("prob_enter", 0.60))
    p_lo = float(params.get("prob_exit", 0.45))

    torch.manual_seed(42)
    rets_s = df["close"].pct_change()
    valid = rets_s.dropna().index
    rets = rets_s.loc[valid].values.astype(np.float32)
    n = len(rets)
    if n < min_train + horizon + CTX_LEN + 10:
        return pd.Series(-1, index=df.index)

    betas, alphas, abar = _diffusion_schedule()

    class Denoiser(nn.Module):
        def __init__(self, horizon):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(horizon + CTX_LEN + 1, 128), nn.SiLU(),
                nn.Linear(128, 128), nn.SiLU(),
                nn.Linear(128, horizon),
            )

        def forward(self, x_t, t_scaled, ctx):
            return self.net(torch.cat([x_t, ctx, t_scaled], dim=1))

    proba = pd.Series(np.nan, index=valid)

    for start in range(min_train, n - horizon, retrain_every):
        end = min(start + retrain_every, n)
        train_rets = rets[:start - horizon]  # purge: targets fully realized
        X, Y = _make_dataset(train_rets, horizon)
        if len(X) < 200:
            continue

        model = Denoiser(horizon)
        opt = torch.optim.Adam(model.parameters(), lr=2e-3)
        Xt = torch.from_numpy(X)
        Yt = torch.from_numpy(Y)
        bs = 256
        model.train()
        for _ in range(epochs):
            perm = torch.randperm(len(Xt))
            for j in range(0, len(Xt), bs):
                idx = perm[j:j + bs]
                y0 = Yt[idx]
                ctx = Xt[idx]
                t = torch.randint(0, T_STEPS, (len(idx),))
                a = abar[t].unsqueeze(1)
                noise = torch.randn_like(y0)
                y_noisy = a.sqrt() * y0 + (1 - a).sqrt() * noise
                pred = model(y_noisy, (t.float() / T_STEPS).unsqueeze(1), ctx)
                loss = ((pred - noise) ** 2).mean()
                opt.zero_grad(); loss.backward(); opt.step()

        # sample future paths for every bar in the test window (batched)
        model.eval()
        with torch.no_grad():
            for i in range(start, end):
                ctx_np = rets[i - CTX_LEN:i]
                s = ctx_np.std() or 1e-4
                ctx = torch.from_numpy((ctx_np / s).astype(np.float32)).unsqueeze(0).repeat(n_samples, 1)
                x = torch.randn(n_samples, horizon)
                for t_inv in reversed(range(T_STEPS)):
                    t_b = torch.full((n_samples, 1), t_inv / T_STEPS)
                    eps = model(x, t_b, ctx)
                    a_t, ab_t, b_t = alphas[t_inv], abar[t_inv], betas[t_inv]
                    x = (x - (b_t / (1 - ab_t).sqrt()) * eps) / a_t.sqrt()
                    if t_inv > 0:
                        x = x + b_t.sqrt() * torch.randn_like(x)
                paths = x.numpy() * s                      # de-scale
                cum = (1 + paths).prod(axis=1) - 1         # cumulative H-day return per path
                proba.iloc[i] = float((cum > 0.002).mean())  # P(path beats costs)

    sig = pd.Series(np.nan, index=valid)
    sig[proba > p_hi] = 1
    sig[proba < p_lo] = -1
    sig = sig.ffill().fillna(-1)
    return sig.reindex(df.index).fillna(-1)
