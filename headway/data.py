"""Load Turnstile's checked table and build the calendar the models see."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import holidays
import pandas as pd
import requests

from .config import DATA, OUTLIERS_LOCAL, OUTLIERS_URL, SERIES, SERIES_KEYS, SOURCE_LOCAL, SOURCE_URL


def fetch(url: str = SOURCE_URL, dest: Path = SOURCE_LOCAL) -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return dest


def fetch_outliers(url: str = OUTLIERS_URL, dest: Path = OUTLIERS_LOCAL) -> Path:
    return fetch(url, dest)


def load(path: Path = SOURCE_LOCAL) -> pd.DataFrame:
    """Wide daily table: one row per date, one column per forecast series, NaN before a
    series starts. Rows are contiguous days from the first to the last date."""
    long = pd.read_csv(path, parse_dates=["date"])
    long = long[long["mode"].isin(SERIES_KEYS)]
    wide = long.pivot(index="date", columns="mode", values="trips").astype("float64")
    wide = wide.reindex(pd.date_range(wide.index.min(), wide.index.max(), freq="D"))
    wide.index.name = "date"
    return wide[[k for k in SERIES_KEYS if k in wide.columns]]


def load_outliers(path: Path = OUTLIERS_LOCAL) -> pd.DataFrame:
    """Turnstile's outlier list: the days its same-weekday rule flagged. Our event calendar."""
    if not path.exists():
        return pd.DataFrame(columns=["date", "mode", "value", "baseline", "ratio"])
    df = pd.DataFrame(json.loads(path.read_text()))
    df["date"] = pd.to_datetime(df["date"])
    return df


def holiday_table(start: date, end: date) -> pd.DataFrame:
    """One row per (date, subdivision) that is a public holiday. Subdivision "" is the
    national calendar; state rows include the national days."""
    years = list(range(start.year, end.year + 1))
    rows = []
    for sub in sorted({s.holidays for s in SERIES}):
        cal = holidays.Malaysia(years=years, subdiv=sub or None)
        for d, name in cal.items():
            if start <= d <= end:
                rows.append({"date": pd.Timestamp(d), "subdiv": sub, "name": name})
    return pd.DataFrame(rows).sort_values(["subdiv", "date"]).reset_index(drop=True)


def calendar(start: date, end: date, subdiv: str) -> pd.DataFrame:
    """Daily calendar features for one series' catchment, for every day in [start, end]."""
    idx = pd.date_range(start, end, freq="D")
    cal = holidays.Malaysia(years=range(start.year - 1, end.year + 2), subdiv=subdiv or None)
    hol = pd.Series([d.date() in cal for d in idx], index=idx)
    # Days to the next holiday and since the last one, capped: the run-up to Raya and
    # the day after a long weekend behave differently from a plain Tuesday.
    nxt, prev = [], []
    for d in idx:
        k = 0
        while k < 14 and (d + timedelta(days=k)).date() not in cal:
            k += 1
        nxt.append(k)
        k = 0
        while k < 14 and (d - timedelta(days=k)).date() not in cal:
            k += 1
        prev.append(k)
    out = pd.DataFrame(
        {
            "dow": idx.dayofweek,
            "holiday": hol.astype(int).values,
            "eve": (pd.Series(nxt, index=idx) == 1).astype(int).values,
            "after": (pd.Series(prev, index=idx) == 1).astype(int).values,
            "days_to_holiday": nxt,
            "days_since_holiday": prev,
            "day_of_year": idx.dayofyear,
        },
        index=idx,
    )
    out.index.name = "date"
    return out


def day_type(row: pd.Series) -> str:
    """The slice a scored day falls in. Holiday first, then eve/after, then weekend."""
    if row["holiday"]:
        return "holiday"
    if row["eve"] or row["after"]:
        return "holiday-adjacent"
    if row["dow"] >= 5:
        return "weekend"
    return "weekday"
