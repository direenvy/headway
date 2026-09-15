"""Rolling-origin backtest: 26 origins, one every 14 days over the last 52 weeks.
At each origin every model sees only the data up to that day and forecasts the
next 14. The result is one long table of (origin, series, horizon, model, actual,
forecast) that every metric and every chart is computed from."""

from __future__ import annotations

import time
from datetime import date

import numpy as np
import pandas as pd

from . import models as M
from .config import HORIZON, MIN_HISTORY_DAYS, N_ORIGINS, SERIES, TRAIN_FROM
from .data import calendar


def prepare(wide: pd.DataFrame) -> dict:
    """Shared arrays: log1p panel over an index that runs HORIZON days past the data,
    one calendar per series (its own state's holidays), and the origin indices."""
    start = wide.index.min().date()
    end = wide.index.max().date()
    idx = pd.date_range(start, pd.Timestamp(end) + pd.Timedelta(days=HORIZON), freq="D")
    raw = wide.reindex(idx)
    panel = {s.key: np.log1p(raw[s.key].to_numpy(dtype=float)) for s in SERIES if s.key in raw}
    cals = {s.key: calendar(start, idx[-1].date(), s.holidays) for s in SERIES if s.key in raw}
    series_ids = {k: i for i, k in enumerate(panel)}
    last = idx.get_loc(pd.Timestamp(end))
    first_origin = idx.get_loc(pd.Timestamp(TRAIN_FROM))
    origins = [last - HORIZON * (i + 1) for i in range(N_ORIGINS)][::-1]
    return {"idx": idx, "raw": raw, "panel": panel, "cals": cals, "series_ids": series_ids, "last": last, "first_origin": first_origin, "origins": origins}


def _history_ok(z: np.ndarray, t: int) -> bool:
    win = z[max(0, t - MIN_HISTORY_DAYS + 1) : t + 1]
    return len(win) >= MIN_HISTORY_DAYS and not np.isnan(win).any()


def run(wide: pd.DataFrame, log=print) -> tuple[pd.DataFrame, list[dict]]:
    P = prepare(wide)
    idx, raw, panel, cals, ids = P["idx"], P["raw"], P["panel"], P["cals"], P["series_ids"]
    rows, timings = [], []
    t0 = time.perf_counter()
    feats = M.all_features(panel, cals, ids, P["first_origin"], P["last"])
    log(f"features: {len(feats):,} rows in {time.perf_counter() - t0:.1f}s")

    for n, t in enumerate(P["origins"], 1):
        origin = idx[t].date()
        t0 = time.perf_counter()
        # Only rows whose target day the origin has already seen.
        train = feats[feats["t"] + feats["h"] <= t]
        boosters = {"lgbm": M.fit_lgbm(train, calendar=True), "lgbm_nohol": M.fit_lgbm(train, calendar=False)}
        fit_s = time.perf_counter() - t0

        for key, z in panel.items():
            if not _history_ok(z, t):
                continue
            y = raw[key].to_numpy(dtype=float)[: t + 1]
            actual = raw[key].to_numpy(dtype=float)[t + 1 : t + 1 + HORIZON]
            preds = {
                "seasonal_naive": M.seasonal_naive(y),
                "weekday_mean": M.weekday_mean(y),
                "ets": M.ets(y),
            }
            for name, (b, cols) in boosters.items():
                preds[name] = M.predict_lgbm(b, cols, z, cals[key], t, ids[key])
            for name, yhat in preds.items():
                for h in range(HORIZON):
                    rows.append({"origin": origin, "mode": key, "h": h + 1, "date": idx[t + 1 + h].date(), "actual": actual[h], "model": name, "yhat": float(yhat[h])})
        timings.append({"origin": str(origin), "train_rows": len(train), "fit_seconds": round(fit_s, 1), "seconds": round(time.perf_counter() - t0, 1)})
        log(f"origin {n:2d}/{len(P['origins'])} {origin}: {len(train):,} training rows, {timings[-1]['seconds']}s")

    out = pd.DataFrame(rows)
    out["date"] = pd.to_datetime(out["date"])
    out["origin"] = pd.to_datetime(out["origin"])
    return out, timings


def naive_scale(wide: pd.DataFrame, first_origin: date) -> dict[str, float]:
    """MASE denominator per series: the in-sample MAE of the one-step seasonal naive
    over the training period, up to the first backtest origin."""
    out = {}
    for s in SERIES:
        if s.key not in wide:
            continue
        y = wide.loc[TRAIN_FROM : str(first_origin), s.key].dropna()
        if len(y) > 7:
            out[s.key] = float(np.mean(np.abs(y.values[7:] - y.values[:-7])))
    return out
