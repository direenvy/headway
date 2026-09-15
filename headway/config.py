"""Paths, the series we forecast, and the settings every experiment shares.

Headway forecasts only what Turnstile has already checked: its input is the
tidy table Turnstile publishes (`ridership.csv`), not the raw feed.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RESULTS = ROOT / "results"
MARTS = ROOT / "frontend" / "data"  # the dashboard imports these at build time

# Turnstile's published, checked table. CC BY 4.0, via data.gov.my.
SOURCE_URL = "https://raw.githubusercontent.com/direenvy/turnstile/main/frontend/public/ridership.csv"
SOURCE_LOCAL = DATA / "ridership.csv"
OUTLIERS_URL = "https://raw.githubusercontent.com/direenvy/turnstile/main/frontend/data/outliers.json"
OUTLIERS_LOCAL = DATA / "outliers.json"

HORIZON = 14  # days ahead
SEASON = 7  # the weekly cycle every model is scored against
N_ORIGINS = 26  # rolling-origin windows, one every 14 days = the last 52 weeks
TRAIN_FROM = "2022-04-01"  # after the last movement-control order; earlier data is a different regime
MIN_HISTORY_DAYS = 365  # a mode needs a year of history before it is backtested
SEED = 20260915


@dataclass(frozen=True)
class Series:
    key: str
    label: str
    system: str
    holidays: str  # holidays.Malaysia subdivision for the mode's catchment, or "" for national


# Turnstile's mode register, minus the retired service and the one too new to backtest.
SERIES: list[Series] = [
    Series("rail_lrt_kj", "LRT Kelana Jaya", "rail", "KUL"),
    Series("rail_lrt_ampang", "LRT Ampang / Sri Petaling", "rail", "KUL"),
    Series("rail_mrt_kajang", "MRT Kajang", "rail", "KUL"),
    Series("rail_mrt_pjy", "MRT Putrajaya", "rail", "KUL"),
    Series("rail_monorail", "KL Monorail", "rail", "KUL"),
    Series("rail_komuter", "KTM Komuter", "rail", "SGR"),
    Series("rail_komuter_utara", "KTM Komuter Utara", "rail", "PRK"),
    Series("rail_ets", "KTM ETS", "rail", ""),
    Series("rail_intercity", "KTM Intercity", "rail", ""),
    Series("rail_tebrau", "KTM Shuttle Tebrau", "rail", "JHR"),
    Series("bus_rkl", "Rapid Bus KL", "bus", "KUL"),
    Series("bus_rpn", "Rapid Bus Penang", "bus", "PNG"),
]
SERIES_KEYS = [s.key for s in SERIES]
SERIES_BY_KEY = {s.key: s for s in SERIES}

MODELS = ["seasonal_naive", "weekday_mean", "ets", "lgbm_nohol", "lgbm"]
MODEL_LABELS = {
    "seasonal_naive": "Seasonal naive",
    "weekday_mean": "Weekday mean",
    "ets": "ETS",
    "lgbm_nohol": "LightGBM, no calendar",
    "lgbm": "LightGBM",
}
