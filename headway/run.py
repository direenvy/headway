"""Command line: fetch Turnstile's table, run the backtest, forecast the next
fourteen days, and write the dashboard's marts.

    python -m headway.run all [--fetch]
    python -m headway.run backtest | forecast | marts
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import pandas as pd

from . import backtest, data, forecast, marts
from .config import RESULTS

BACKTEST_CSV = RESULTS / "backtest.csv"
FORECAST_CSV = RESULTS / "forecast.csv"
TIMINGS_JSON = RESULTS / "timings.json"


def cmd_backtest(wide: pd.DataFrame) -> None:
    t0 = time.perf_counter()
    bt, timings = backtest.run(wide)
    RESULTS.mkdir(parents=True, exist_ok=True)
    bt.to_csv(BACKTEST_CSV, index=False, lineterminator="\n")
    TIMINGS_JSON.write_text(json.dumps({"origins": timings, "total_seconds": round(time.perf_counter() - t0, 1)}, indent=1) + "\n")
    print(f"backtest: {len(bt):,} rows -> {BACKTEST_CSV} in {time.perf_counter() - t0:.0f}s")


def cmd_forecast(wide: pd.DataFrame) -> None:
    bt = pd.read_csv(BACKTEST_CSV, parse_dates=["date", "origin"])
    fc = forecast.run(wide, bt)
    fc.to_csv(FORECAST_CSV, index=False, lineterminator="\n")
    print(f"forecast: {len(fc):,} rows -> {FORECAST_CSV}")


def cmd_marts(wide: pd.DataFrame) -> None:
    bt = pd.read_csv(BACKTEST_CSV, parse_dates=["date", "origin"])
    fc = pd.read_csv(FORECAST_CSV, parse_dates=["date"])
    timings = json.loads(TIMINGS_JSON.read_text()) if TIMINGS_JSON.exists() else {}
    written = marts.build(wide, bt, fc, data.load_outliers(), timings)
    for k, v in written.items():
        print(f"mart {k}: {v}")


def main(argv=None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["all", "backtest", "forecast", "marts"])
    ap.add_argument("--fetch", action="store_true", help="download Turnstile's latest table first")
    args = ap.parse_args(argv)
    if args.fetch:
        print(f"fetched {data.fetch()} and {data.fetch_outliers()}")
    wide = data.load()
    print(f"data: {wide.index.min().date()} to {wide.index.max().date()}, {wide.shape[1]} series")
    if args.step in ("all", "backtest"):
        cmd_backtest(wide)
    if args.step in ("all", "forecast"):
        cmd_forecast(wide)
    if args.step in ("all", "marts"):
        cmd_marts(wide)
    return 0


if __name__ == "__main__":
    sys.exit(main())
