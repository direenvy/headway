/* The marts headway.marts writes into frontend/data. Imported at build time,
   so the dashboard is static and every number traces to results/backtest.csv. */

import summaryJson from "@/data/summary.json";
import leaderboardJson from "@/data/leaderboard.json";
import byModeJson from "@/data/by_mode.json";
import byHorizonJson from "@/data/by_horizon.json";
import byDayTypeJson from "@/data/by_day_type.json";
import byOutlierJson from "@/data/by_outlier.json";
import byOriginJson from "@/data/by_origin.json";
import worstJson from "@/data/worst_days.json";
import windowsJson from "@/data/windows.json";
import recentJson from "@/data/recent.json";
import forecastJson from "@/data/forecast.json";
import holidaysJson from "@/data/holidays.json";
import btHolidaysJson from "@/data/bt_holidays.json";
import seriesJson from "@/data/series.json";

export type ModelKey = "seasonal_naive" | "weekday_mean" | "ets" | "lgbm_nohol" | "lgbm";
export type DayType = "weekday" | "weekend" | "holiday" | "holiday-adjacent";

export type Score = { n: number; mae: number; wape: number; bias: number; mase: number };
export type Leaderboard = Score & { model: ModelKey; label: string };
export type ByMode = Score & { mode: string; model: ModelKey };
export type ByHorizon = Score & { model: ModelKey; h: number };
export type ByDayType = Score & { model: ModelKey; day_type: DayType };
export type ByOutlier = Score & { model: ModelKey; outlier: boolean };
export type ByOrigin = Score & { model: ModelKey; origin: string };

export type WorstDay = {
  mode: string;
  label: string;
  date: string;
  origin: string;
  h: number;
  actual: number;
  yhat: number;
  naive: number;
  ape: number;
  day_type: DayType;
  holiday: string;
  outlier: boolean;
};

export type Window = {
  origin: string;
  mode: string;
  dates: string[];
  actual: number[];
  day_type: DayType[];
  holiday: string[];
  outlier: boolean[];
  context: (number | null)[];
  models: Record<ModelKey, number[]>;
};

export type Recent = { mode: string; date: string; trips: number };
export type Forecast = { mode: string; date: string; h: number; model: ModelKey; yhat: number; lo: number; hi: number };
export type Holiday = { date: string; name: string };
export type Series = {
  key: string;
  label: string;
  system: "rail" | "bus";
  holidays: string;
  scale: number;
  last_28d_avg: number;
  first_date: string;
  beats_naive: boolean | null;
};

export type Summary = {
  generated_at: string;
  first_date: string;
  last_date: string;
  train_from: string;
  horizon: number;
  n_origins: number;
  first_origin: string;
  last_origin: string;
  series: number;
  scored_days: number;
  best_model: ModelKey;
  lgbm_mase: number;
  lgbm_wape: number;
  naive_mase: number;
  naive_wape: number;
  weekday_mean_mase: number;
  ets_mase: number;
  nohol_mase: number;
  beats_naive: number;
  worst: WorstDay;
  backtest_seconds: number | null;
  train_rows: number | null;
};

export const summary = summaryJson as Summary;
export const leaderboard = leaderboardJson as Leaderboard[];
export const byMode = byModeJson as ByMode[];
export const byHorizon = byHorizonJson as ByHorizon[];
export const byDayType = byDayTypeJson as ByDayType[];
export const byOutlier = byOutlierJson as ByOutlier[];
export const byOrigin = byOriginJson as ByOrigin[];
export const worstDays = worstJson as WorstDay[];
export const windows = windowsJson as Window[];
export const recent = recentJson as Recent[];
export const forecast = forecastJson as Forecast[];
export const holidays = holidaysJson as Holiday[];
export const btHolidays = btHolidaysJson as Holiday[];
export const series = seriesJson as Series[];

export const MODEL_LABELS: Record<ModelKey, string> = {
  seasonal_naive: "Seasonal naive",
  weekday_mean: "Weekday mean",
  ets: "ETS",
  lgbm_nohol: "LightGBM, no calendar",
  lgbm: "LightGBM",
};
export const MODEL_ORDER: ModelKey[] = ["seasonal_naive", "weekday_mean", "ets", "lgbm_nohol", "lgbm"];

export const fmt = new Intl.NumberFormat("en-MY");
export const num = (n: number | null | undefined) => (n == null ? "—" : fmt.format(Math.round(n)));
export const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
export const pct = (x: number | null | undefined, digits = 1) => (x == null ? "—" : `${(x * 100).toFixed(digits)}%`);
export const signedPct = (x: number | null | undefined, digits = 1) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`);
export const dec = (x: number | null | undefined, digits = 2) => (x == null ? "—" : x.toFixed(digits));
export const dateName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
export const dayMonth = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const weekdayName = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" });
