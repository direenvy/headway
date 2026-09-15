"""The forecast ahead: every model fitted on all the data Turnstile has published,
fourteen days past its last date, with 80% intervals taken from the backtest's
own errors at each horizon rather than from a formula the data never agreed to."""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import models as M
from .backtest import _history_ok, prepare
from .config import HORIZON, MODELS


def interval_table(bt: pd.DataFrame, lo: float = 0.1, hi: float = 0.9) -> pd.DataFrame:
    """Empirical quantiles of the log error log1p(actual) - log1p(forecast), per model
    and horizon, pooled across series. Applied multiplicatively to a point forecast."""
    e = np.log1p(bt["actual"]) - np.log1p(bt["yhat"])
    q = bt.assign(e=e).groupby(["model", "h"])["e"].quantile([lo, hi]).unstack()
    q.columns = ["lo", "hi"]
    return q.reset_index()


def run(wide: pd.DataFrame, bt: pd.DataFrame) -> pd.DataFrame:
    P = prepare(wide)
    idx, raw, panel, cals, ids, t = P["idx"], P["raw"], P["panel"], P["cals"], P["series_ids"], P["last"]
    feats = M.all_features(panel, cals, ids, P["first_origin"], t)
    train = feats[feats["t"] + feats["h"] <= t]
    boosters = {"lgbm": M.fit_lgbm(train, calendar=True), "lgbm_nohol": M.fit_lgbm(train, calendar=False)}
    q = interval_table(bt).set_index(["model", "h"])

    rows = []
    for key, z in panel.items():
        if not _history_ok(z, t):
            continue
        y = raw[key].to_numpy(dtype=float)[: t + 1]
        preds = {"seasonal_naive": M.seasonal_naive(y), "weekday_mean": M.weekday_mean(y), "ets": M.ets(y)}
        for name, (b, cols) in boosters.items():
            preds[name] = M.predict_lgbm(b, cols, z, cals[key], t, ids[key])
        for name in MODELS:
            for h in range(1, HORIZON + 1):
                yhat = float(preds[name][h - 1])
                lo, hi = q.loc[(name, h), ["lo", "hi"]]
                rows.append({"mode": key, "date": idx[t + h].date(), "h": h, "model": name, "yhat": yhat, "lo": float(np.expm1(np.log1p(yhat) + lo)), "hi": float(np.expm1(np.log1p(yhat) + hi))})
    out = pd.DataFrame(rows)
    out["date"] = pd.to_datetime(out["date"])
    return out
