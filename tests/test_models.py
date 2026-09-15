from datetime import date

import numpy as np
import pandas as pd
import pytest

from headway import backtest, data, forecast, metrics, models
from headway.config import HORIZON, SEASON


def weekly(n: int = 120, base: float = 1000.0) -> np.ndarray:
    """A clean weekly cycle: Mon..Sun = base + 100 * dow, repeated."""
    return np.array([base + 100 * (i % SEASON) for i in range(n)], dtype=float)


def test_seasonal_naive_repeats_last_week():
    y = weekly()
    f = models.seasonal_naive(y)
    assert len(f) == HORIZON
    assert list(f[:SEASON]) == list(y[-SEASON:])
    assert list(f[SEASON:]) == list(y[-SEASON:])


def test_weekday_mean_averages_same_weekday():
    y = weekly()
    y[-1] += 400  # perturb last Sunday: the mean over 4 weeks moves by a quarter of it
    f = models.weekday_mean(y, weeks=4)
    assert f[SEASON - 1] == pytest.approx(y[-1] - 300)
    assert f[0] == pytest.approx(y[-SEASON])


def test_ets_tracks_a_clean_cycle():
    f = models.ets(weekly(400))
    assert f.shape == (HORIZON,)
    assert np.allclose(f[:SEASON], weekly()[-SEASON:], rtol=0.03)


def test_calendar_marks_hari_malaysia_and_its_neighbours():
    cal = data.calendar(date(2025, 9, 1), date(2025, 9, 30), "KUL")
    d = pd.Timestamp("2025-09-16")
    assert cal.loc[d, "holiday"] == 1
    assert cal.loc[d - pd.Timedelta(days=1), "eve"] == 1 or cal.loc[d - pd.Timedelta(days=1), "holiday"] == 1
    assert cal.loc[d + pd.Timedelta(days=1), "after"] == 1
    assert cal.loc[pd.Timestamp("2025-09-10"), "days_to_holiday"] == 5  # Cuti Peristiwa on the 15th


def test_calendar_is_per_state():
    kul = data.calendar(date(2025, 2, 1), date(2025, 2, 3), "KUL")
    jhr = data.calendar(date(2025, 2, 1), date(2025, 2, 3), "JHR")
    assert kul.loc[pd.Timestamp("2025-02-01"), "holiday"] == 1  # Federal Territory Day
    assert jhr.loc[pd.Timestamp("2025-02-01"), "holiday"] == 0


def test_feature_block_uses_nearest_observed_same_weekday():
    n = 200
    z = np.log1p(weekly(n))
    cal = data.calendar(date(2025, 1, 1), date(2025, 1, 1) + pd.Timedelta(days=n + HORIZON), "KUL")
    t = 150
    for h in (1, 7, 8, 14):
        f = models.feature_block(z, cal, np.array([t]), h, 0)
        j = SEASON * int(np.ceil(h / SEASON))
        assert f.loc[0, "sw1"] + f.loc[0, "level"] == pytest.approx(z[t + h - j])
        assert f.loc[0, "lag0"] + f.loc[0, "level"] == pytest.approx(z[t])
        assert f.loc[0, "target"] == pytest.approx(z[t + h])
        assert f.loc[0, "dow"] == cal.iloc[t + h]["dow"]


def test_feature_block_drops_rows_with_missing_history():
    z = np.full(100, np.nan)
    z[60:] = np.log1p(1000.0)
    cal = data.calendar(date(2025, 1, 1), date(2025, 1, 1) + pd.Timedelta(days=100 + HORIZON), "KUL")
    f = models.feature_block(z, cal, np.arange(0, 100 - HORIZON), 1, 0)
    assert len(f) == 0  # 56 days of window never fits inside the 40 observed
    z[:] = np.log1p(1000.0)
    f = models.feature_block(z, cal, np.arange(0, 100 - HORIZON), 1, 0)
    assert len(f) == 100 - HORIZON - (models.LAGS + SEASON * 4 - 1)


def test_mase_is_one_for_the_scale_model():
    dates = pd.date_range("2025-01-01", periods=28)
    y = weekly(28)
    bt = pd.DataFrame({"mode": "m", "model": "x", "h": 1, "date": dates, "actual": y, "yhat": y + 50})
    scores = metrics.by(bt, ["model", "mode"], {"m": 50.0})
    assert scores.loc[0, "mase"] == pytest.approx(1.0)
    assert scores.loc[0, "bias"] > 0
    overall = metrics.by(bt, ["model"], {"m": 50.0})
    assert overall.loc[0, "mase"] == pytest.approx(1.0)


def test_interval_table_brackets_the_point_forecast():
    rng = np.random.default_rng(0)
    actual = rng.uniform(1000, 2000, 500)
    bt = pd.DataFrame({"model": "x", "h": 1, "actual": actual, "yhat": actual * rng.uniform(0.9, 1.1, 500)})
    q = forecast.interval_table(bt)
    assert q.loc[0, "lo"] < 0 < q.loc[0, "hi"]


def test_backtest_origins_cover_the_last_year_without_leaking():
    idx = pd.date_range("2022-01-01", "2026-07-31")
    wide = pd.DataFrame({"rail_lrt_kj": weekly(len(idx))}, index=idx)
    wide.index.name = "date"
    P = backtest.prepare(wide)
    origins = [P["idx"][t].date() for t in P["origins"]]
    assert origins[-1] == date(2026, 7, 31) - pd.Timedelta(days=HORIZON)
    assert origins[0] == date(2026, 7, 31) - pd.Timedelta(days=HORIZON * 26)
    assert all((b - a).days == HORIZON for a, b in zip(origins, origins[1:]))
