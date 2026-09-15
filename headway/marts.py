"""The small JSON files the dashboard imports at build time. Everything on the
page is derived here from the backtest table, so a number on the site can be
traced to a row in results/backtest.csv."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import holidays
import numpy as np
import pandas as pd

from . import metrics
from .backtest import naive_scale, prepare
from .config import HORIZON, MARTS, MODEL_LABELS, MODELS, N_ORIGINS, SERIES, SERIES_BY_KEY, TRAIN_FROM


def _dump(name: str, obj) -> str:
    MARTS.mkdir(parents=True, exist_ok=True)
    path = MARTS / f"{name}.json"
    path.write_text(json.dumps(obj, indent=0, default=_json) + "\n")
    return str(path)


def _json(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    return str(o)


def _round(rec: dict) -> dict:
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in rec.items()}


def build(wide: pd.DataFrame, bt: pd.DataFrame, fc: pd.DataFrame, outliers: pd.DataFrame, timings: dict) -> dict[str, str]:
    P = prepare(wide)
    first_origin = P["idx"][P["origins"][0]].date()
    scales = naive_scale(wide, first_origin)
    bt = metrics.add_day_type(bt, P["cals"], outliers)
    kul = holidays.Malaysia(years=range(2022, wide.index.max().year + 2), subdiv="KUL")
    bt["holiday_name"] = [kul.get(d.date(), "") for d in bt["date"]]

    leaderboard = [_round(r) for r in metrics.by(bt, ["model"], scales).to_dict("records")]
    for r in leaderboard:
        r["label"] = MODEL_LABELS[r["model"]]
    leaderboard.sort(key=lambda r: r["mase"])
    by_mode = [_round(r) for r in metrics.by(bt, ["mode", "model"], scales).to_dict("records")]
    by_horizon = [_round(r) for r in metrics.by(bt, ["model", "h"], scales).to_dict("records")]
    by_day_type = [_round(r) for r in metrics.by(bt, ["model", "day_type"], scales).to_dict("records")]
    by_outlier = [_round(r) for r in metrics.by(bt, ["model", "outlier"], scales).to_dict("records")]
    by_origin = [_round(r) for r in metrics.by(bt, ["model", "origin"], scales).to_dict("records")]

    # Which lines LightGBM beats the seasonal naive on, by MASE.
    bm = pd.DataFrame(by_mode).pivot(index="mode", columns="model", values="mase")
    beats = {m: bool(bm.loc[m, "lgbm"] < bm.loc[m, "seasonal_naive"]) for m in bm.index}

    # The worst days for the main model: absolute percentage error, with the day's context.
    main = bt[bt["model"] == "lgbm"].copy()
    naive = bt[bt["model"] == "seasonal_naive"].set_index(["origin", "mode", "date"])["yhat"]
    main["ape"] = (main["yhat"] - main["actual"]).abs() / main["actual"].replace(0, np.nan)
    main["naive"] = naive.loc[list(zip(main["origin"], main["mode"], main["date"]))].values
    worst = main.sort_values("ape", ascending=False).head(15)
    worst_days = [
        {
            "mode": r.mode,
            "label": SERIES_BY_KEY[r.mode].label,
            "date": r.date,
            "origin": r.origin,
            "h": int(r.h),
            "actual": float(r.actual),
            "yhat": round(float(r.yhat)),
            "naive": round(float(r.naive)),
            "ape": round(float(r.ape), 4),
            "day_type": r.day_type,
            "holiday": r.holiday_name,
            "outlier": bool(r.outlier),
        }
        for r in worst.itertuples()
    ]

    # Backtest windows in a compact shape: one record per (origin, mode), arrays of 14.
    windows = []
    for (origin, mode), g in bt[bt["model"] == "lgbm"].groupby(["origin", "mode"], sort=True):
        g = g.sort_values("h")
        before = wide.loc[origin - pd.Timedelta(days=13) : origin, mode]
        rec = {"origin": origin, "mode": mode, "dates": list(g["date"]), "actual": [float(v) for v in g["actual"]], "day_type": list(g["day_type"]), "holiday": list(g["holiday_name"]), "outlier": [bool(v) for v in g["outlier"]], "context": [None if np.isnan(v) else float(v) for v in before], "models": {}}
        for name in MODELS:
            sel = bt[(bt["model"] == name) & (bt["origin"] == origin) & (bt["mode"] == mode)].sort_values("h")
            rec["models"][name] = [round(float(v)) for v in sel["yhat"]]
        windows.append(rec)

    # The forecast ahead and the eight weeks before it, for the headline chart.
    last = wide.index.max()
    recent = wide.loc[last - pd.Timedelta(days=55) :]
    recent_out = [{"mode": k, "date": d, "trips": float(v)} for k in recent.columns for d, v in recent[k].items() if not np.isnan(v)]
    fc_out = [{"mode": r.mode, "date": r.date, "h": int(r.h), "model": r.model, "yhat": round(float(r.yhat)), "lo": round(float(r.lo)), "hi": round(float(r.hi))} for r in fc.itertuples()]
    fc_hol = holidays.Malaysia(years=[last.year, last.year + 1], subdiv="KUL")
    span = pd.date_range(recent.index.min(), last + pd.Timedelta(days=HORIZON))
    holidays_out = [{"date": d, "name": fc_hol.get(d.date())} for d in span if d.date() in fc_hol]
    bt_span = pd.date_range(bt["date"].min(), bt["date"].max())
    bt_holidays = [{"date": d, "name": kul.get(d.date())} for d in bt_span if d.date() in kul]

    series = []
    for s in SERIES:
        if s.key not in wide:
            continue
        col = wide[s.key].dropna()
        series.append({"key": s.key, "label": s.label, "system": s.system, "holidays": s.holidays or "national", "scale": round(scales.get(s.key, float("nan"))), "last_28d_avg": round(float(col.iloc[-28:].mean())), "first_date": col.index.min(), "beats_naive": beats.get(s.key)})

    lb = {r["model"]: r for r in leaderboard}
    worst_first = worst_days[0]
    summary = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "first_date": wide.index.min(),
        "last_date": last,
        "train_from": TRAIN_FROM,
        "horizon": HORIZON,
        "n_origins": N_ORIGINS,
        "first_origin": first_origin,
        "last_origin": P["idx"][P["origins"][-1]].date(),
        "series": len(series),
        "scored_days": int(len(main)),
        "best_model": leaderboard[0]["model"],
        "lgbm_mase": lb["lgbm"]["mase"],
        "lgbm_wape": lb["lgbm"]["wape"],
        "naive_mase": lb["seasonal_naive"]["mase"],
        "naive_wape": lb["seasonal_naive"]["wape"],
        "weekday_mean_mase": lb["weekday_mean"]["mase"],
        "ets_mase": lb["ets"]["mase"],
        "nohol_mase": lb["lgbm_nohol"]["mase"],
        "beats_naive": int(sum(beats.values())),
        "worst": worst_first,
        "backtest_seconds": timings.get("total_seconds"),
        "train_rows": (timings.get("origins") or [{}])[-1].get("train_rows"),
    }

    return {
        "summary": _dump("summary", summary),
        "leaderboard": _dump("leaderboard", leaderboard),
        "by_mode": _dump("by_mode", by_mode),
        "by_horizon": _dump("by_horizon", by_horizon),
        "by_day_type": _dump("by_day_type", by_day_type),
        "by_outlier": _dump("by_outlier", by_outlier),
        "by_origin": _dump("by_origin", by_origin),
        "worst_days": _dump("worst_days", worst_days),
        "windows": _dump("windows", windows),
        "recent": _dump("recent", recent_out),
        "forecast": _dump("forecast", fc_out),
        "holidays": _dump("holidays", holidays_out),
        "bt_holidays": _dump("bt_holidays", bt_holidays),
        "series": _dump("series", series),
    }
