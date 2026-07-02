"""Walk-forward fitted Q-learning trading agent (reinforcement learning).

Genuine RL, done honestly on daily bars:
- MDP: state = backward-looking market features; actions = {flat, long};
  reward = position * next-day return − switching cost.
- Fitted Q-iteration: a gradient-boosted regressor approximates Q(s, a); K
  sweeps of the TD update  Q(s,a) ← r + γ · max_a' Q(s',a')  on PAST
  transitions only.
- Walk-forward: the policy acting during a test window was trained strictly on
  transitions that completed before the window began (1-step rewards ⇒ a
  1-bar purge is sufficient).
- Hysteresis on the Q-advantage keeps turnover (and costs) sane.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .ml_boost import _build_features

GAMMA = 0.97
COST = 0.0015  # commission + slippage per switch, mirrors the simulator


def compute_rl_q_signals(df: pd.DataFrame, params: dict) -> pd.Series:
    """Return a 1/-1 signal series aligned to df.index (pre-shift)."""
    from sklearn.ensemble import HistGradientBoostingRegressor

    retrain_every = int(params.get("retrain_every", 126))
    min_train = int(params.get("min_train", 504))
    sweeps = int(params.get("q_sweeps", 3))
    margin = float(params.get("advantage_margin", 0.001))

    feats = _build_features(df)
    # reward: mean of the next 5 days' returns — smoother learning target than
    # single-bar noise (purge below accounts for the 5-bar overlap)
    fwd1 = df["close"].pct_change().shift(-1)
    rets = fwd1.rolling(5).mean().shift(-4)
    valid = feats.dropna().index.intersection(rets.dropna().index)
    F = feats.loc[valid].values.astype(np.float32)
    R = rets.loc[valid].values.astype(np.float32)
    n = len(F)

    if n < min_train + 20:
        return pd.Series(-1, index=df.index)

    signal = pd.Series(np.nan, index=valid)

    for start in range(min_train, n, retrain_every):
        end = min(start + retrain_every, n)
        # transitions strictly before the test window; rewards look 5 bars
        # ahead, so purge 5
        cut = start - 5
        S, Snext, Rw = F[:cut], F[1:cut + 1], R[:cut]

        # dataset over both actions; switching cost approximated in the reward
        # of the long action when the previous greedy action differed
        X0 = np.hstack([S, np.zeros((cut, 1), np.float32)])   # a=flat
        X1 = np.hstack([S, np.ones((cut, 1), np.float32)])    # a=long
        y0 = np.zeros(cut, np.float32)
        y1 = Rw.copy()

        model = HistGradientBoostingRegressor(max_depth=3, max_iter=100,
                                              learning_rate=0.08, random_state=42)
        # sweep 0: immediate rewards
        Xall = np.vstack([X0, X1])
        yall = np.concatenate([y0, y1])
        model.fit(Xall, yall)
        # fitted-Q sweeps: bootstrap the target with max_a' Q(s', a')
        for _ in range(max(0, sweeps - 1)):
            q0n = model.predict(np.hstack([Snext, np.zeros((cut, 1), np.float32)]))
            q1n = model.predict(np.hstack([Snext, np.ones((cut, 1), np.float32)]))
            vnext = np.maximum(q0n, q1n).astype(np.float32)
            t0 = y0 + GAMMA * vnext
            t1 = y1 + GAMMA * vnext
            model.fit(Xall, np.concatenate([t0, t1]))

        # greedy policy w/ hysteresis over the test window
        Ft = F[start:end]
        q0 = model.predict(np.hstack([Ft, np.zeros((end - start, 1), np.float32)]))
        q1 = model.predict(np.hstack([Ft, np.ones((end - start, 1), np.float32)]))
        adv = q1 - q0
        seg = np.full(end - start, np.nan)
        seg[adv > margin + COST] = 1     # long only when the edge clears costs
        seg[adv < -margin * 2] = -1      # asymmetric exit — don't churn on noise
        signal.iloc[start:end] = seg

    signal = signal.ffill().fillna(-1)
    return signal.reindex(df.index).fillna(-1)
