"""The forecasters. Every one takes history up to an origin and returns HORIZON
values for the days after it. The baselines are deliberately simple; LightGBM
is one global model over all series, trained on log ratios to a 28-day level so
a 190,000-trip line and a 3,000-trip one share a scale."""

from __future__ import annotations

import warnings

import lightgbm as lgb
import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing

from .config import HORIZON, SEASON, SEED

LAGS = 28
CAL_FEATURES = ["holiday", "eve", "after", "days_to_holiday", "days_since_holiday", "hol_in_lag7"]
NOT_FEATURES = {"y", "target", "level", "t"}


# ---- baselines -------------------------------------------------------------


def seasonal_naive(y: np.ndarray, h: int = HORIZON) -> np.ndarray:
    """The last observed value for the same weekday."""
    return np.array([y[-SEASON + ((k - 1) % SEASON)] for k in range(1, h + 1)])


def weekday_mean(y: np.ndarray, h: int = HORIZON, weeks: int = 4) -> np.ndarray:
    """Mean of the last `weeks` values for the same weekday — the baseline Turnstile's
    outlier rule is built on, so a model has to beat it to be worth running."""
    out = []
    for k in range(1, h + 1):
        idx = [-SEASON * w + ((k - 1) % SEASON) for w in range(1, weeks + 1)]
        out.append(np.nanmean(y[idx]))
    return np.array(out)


def ets(y: np.ndarray, h: int = HORIZON, window: int = 364) -> np.ndarray:
    """Holt-Winters on log1p of the last year: damped additive trend, weekly
    additive seasonality — multiplicative on the original scale, but safe on zeros."""
    z = np.log1p(y[-window:].astype(float))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = ExponentialSmoothing(z, trend="add", damped_trend=True, seasonal="add", seasonal_periods=SEASON, initialization_method="estimated").fit(optimized=True)
    return np.clip(np.expm1(fit.forecast(h)), 0, None)


# ---- LightGBM: features ------------------------------------------------------


def feature_block(z: np.ndarray, cal: pd.DataFrame, ts: np.ndarray, h: int, series_id: int) -> pd.DataFrame:
    """Feature rows for many origins at once: origin index t (the last observed day)
    and horizon h. z is log1p(trips) for one series over the calendar's index, NaN
    before the series began. Rows whose lag window is incomplete are dropped."""
    ts = np.asarray(ts)
    need = LAGS + SEASON * 4 - 1
    ts = ts[ts - need >= 0]
    win = np.stack([z[ts - k] for k in range(need + 1)], axis=1)  # column k = lag k
    ok = ~np.isnan(win).any(axis=1)
    ts, win = ts[ok], win[ok]
    d = ts + h
    level = win[:, :LAGS].mean(axis=1)
    j = SEASON * int(np.ceil(h / SEASON))  # nearest observed same weekday to the target
    cols = {"series": np.full(len(ts), series_id), "h": np.full(len(ts), h), "t": ts, "level": level}
    for k in range(LAGS):
        cols[f"lag{k}"] = win[:, k] - level
    for w in range(4):
        cols[f"sw{w + 1}"] = z[d - j - SEASON * w] - level
    cols["mean7"] = win[:, :7].mean(axis=1) - level
    cols["prev7"] = win[:, 7:14].mean(axis=1) - level
    cols["std28"] = win[:, :LAGS].std(axis=1)
    c = cal.iloc[d]
    for name in ["dow", "day_of_year", "holiday", "eve", "after", "days_to_holiday", "days_since_holiday"]:
        cols[name] = c[name].to_numpy()
    hol = cal["holiday"].to_numpy()
    cols["hol_in_lag7"] = np.stack([hol[ts - k] for k in range(7)], axis=1).sum(axis=1)
    cols["target"] = z[d]
    return pd.DataFrame(cols)


def all_features(panel: dict[str, np.ndarray], cals: dict[str, pd.DataFrame], series_ids: dict[str, int], first_origin: int, last_origin: int) -> pd.DataFrame:
    """Every (series, origin, horizon) row from first_origin to last_origin, built once;
    a backtest origin selects the rows whose target day it has seen."""
    parts = []
    for key, z in panel.items():
        ts = np.arange(first_origin, last_origin + 1)
        for h in range(1, HORIZON + 1):
            parts.append(feature_block(z, cals[key], ts, h, series_ids[key]))
    out = pd.concat(parts, ignore_index=True)
    out["y"] = out["target"] - out["level"]
    return out


PARAMS = dict(objective="l1", learning_rate=0.05, num_leaves=31, min_data_in_leaf=50, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, seed=SEED, num_threads=4)
ROUNDS = 400


def fit_lgbm(train: pd.DataFrame, calendar: bool = True) -> tuple[lgb.Booster, list[str]]:
    train = train.dropna(subset=["target"])
    drop = NOT_FEATURES | (set() if calendar else set(CAL_FEATURES))
    cols = [c for c in train.columns if c not in drop]
    ds = lgb.Dataset(train[cols], train["y"], categorical_feature=["series", "dow"], free_raw_data=False)
    booster = lgb.train(PARAMS, ds, num_boost_round=ROUNDS)
    return booster, cols


def predict_lgbm(booster: lgb.Booster, cols: list[str], z: np.ndarray, cal: pd.DataFrame, t: int, series_id: int) -> np.ndarray:
    frame = pd.concat([feature_block(z, cal, np.array([t]), h, series_id) for h in range(1, HORIZON + 1)], ignore_index=True)
    pred = booster.predict(frame[cols]) + frame["level"].values
    return np.clip(np.expm1(pred), 0, None)
