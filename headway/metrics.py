"""Scores over the backtest table. MASE is the headline: error relative to the
in-sample one-step seasonal naive, so 1.0 means "no better than last week", and
it is comparable across a 190,000-trip line and a 3,000-trip one. WAPE is the
same idea in plain percent. Bias says which way a model leans."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _scores(g: pd.DataFrame, scale: float | None) -> dict:
    err = g["yhat"] - g["actual"]
    ae = err.abs()
    denom = g["actual"].abs().sum()
    out = {
        "n": int(len(g)),
        "mae": float(ae.mean()),
        "wape": float(ae.sum() / denom) if denom else np.nan,
        "bias": float(err.sum() / denom) if denom else np.nan,
    }
    out["mase"] = float(ae.mean() / scale) if scale else np.nan
    return out


def by(bt: pd.DataFrame, keys: list[str], scales: dict[str, float]) -> pd.DataFrame:
    """Score per group. MASE needs a per-series scale, so a grouping without `mode`
    averages the per-mode MASE (every line counts once) and pools WAPE and bias."""
    if "mode" in keys:
        rows = []
        for k, g in bt.groupby(keys, sort=True):
            k = k if isinstance(k, tuple) else (k,)
            rec = dict(zip(keys, k))
            rec.update(_scores(g, scales.get(rec["mode"])))
            rows.append(rec)
        return pd.DataFrame(rows)
    per_mode = by(bt, keys + ["mode"], scales)
    rows = []
    for k, g in bt.groupby(keys, sort=True):
        k = k if isinstance(k, tuple) else (k,)
        rec = dict(zip(keys, k))
        rec.update(_scores(g, None))
        sel = per_mode
        for kk, vv in zip(keys, k):
            sel = sel[sel[kk] == vv]
        rec["mase"] = float(sel["mase"].mean())
        rows.append(rec)
    return pd.DataFrame(rows)


def add_day_type(bt: pd.DataFrame, cals: dict[str, pd.DataFrame], outliers: pd.DataFrame) -> pd.DataFrame:
    """Label every scored day: weekday / weekend / holiday / holiday-adjacent, plus
    whether Turnstile's outlier rule flagged that (mode, date)."""
    from .data import day_type

    parts = []
    for key, g in bt.groupby("mode"):
        cal = cals[key].loc[g["date"].values]
        labels = cal.apply(day_type, axis=1).values
        parts.append(g.assign(day_type=labels, holiday_name=""))
    out = pd.concat(parts).sort_index()
    flagged = set(zip(outliers["mode"], outliers["date"]))
    out["outlier"] = [(m, d) in flagged for m, d in zip(out["mode"], out["date"])]
    return out
