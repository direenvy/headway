"use client";

/* Any of the 26 backtest windows for any line: the two weeks before the
   origin, then fourteen days of what happened against what each model said
   would. Holiday names sit on the axis; a ring marks days Turnstile's outlier
   rule flagged. Start on the window the worst day came from. */

import { useMemo, useState } from "react";
import { byOrigin, series, summary, windows, dateName, dec, type ModelKey } from "@/lib/data";
import LineChart, { FORECAST, LegendItem, OBSERVED, pillStyle, type Line } from "./LineChart";

const SHOWN: ("lgbm" | "lgbm_nohol" | "seasonal_naive")[] = ["lgbm", "lgbm_nohol", "seasonal_naive"];
const LABEL: Record<ModelKey, string> = { lgbm: "LightGBM", lgbm_nohol: "No calendar", seasonal_naive: "Seasonal naive", ets: "ETS", weekday_mean: "Weekday mean" };

export default function WindowBrowser() {
  const origins = useMemo(() => Array.from(new Set(windows.map((w) => w.origin))).sort(), []);
  const [origin, setOrigin] = useState(summary.worst.origin);
  const [mode, setMode] = useState(summary.worst.mode);
  const k = origins.indexOf(origin);
  const w = windows.find((x) => x.origin === origin && x.mode === mode);
  const s = series.find((x) => x.key === mode)!;

  const view = useMemo(() => {
    if (!w) return null;
    // Dates are calendar days, so do the arithmetic in UTC: a local midnight in
    // Kuala Lumpur is the previous day in ISO form.
    const ctxDates = w.context.map((_, i) => {
      const d = new Date(`${w.origin}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (w.context.length - 1 - i));
      return d.toISOString().slice(0, 10);
    });
    const dates = [...ctxDates, ...w.dates];
    const n = w.context.length;
    const lastObs = w.context[n - 1];
    const lines: Line[] = [
      { key: "actual", label: "Observed", values: [...w.context, ...w.actual], style: OBSERVED, dots: true },
      ...SHOWN.map((m) => ({ key: m, label: LABEL[m], values: [...Array<null>(n - 1).fill(null), lastObs, ...w.models[m]], style: FORECAST[m] })),
    ];
    const hols: Record<number, string> = {};
    w.holiday.forEach((h, i) => {
      if (h) hols[n + i] = h;
    });
    const marks = w.outlier.map((o, i) => (o ? n + i : -1)).filter((i) => i >= 0);
    return { dates, lines, split: n, hols, marks };
  }, [w]);

  const score = (m: ModelKey) => byOrigin.find((r) => r.origin === origin && r.model === m);
  const wape = (m: ModelKey) => {
    if (!w) return NaN;
    const e = w.models[m].reduce((a, v, i) => a + Math.abs(v - w.actual[i]), 0);
    const t = w.actual.reduce((a, v) => a + v, 0);
    return t ? e / t : NaN;
  };

  return (
    <figure>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Backtest window">
          <button type="button" className="pill outlined" style={pillStyle(false)} disabled={k <= 0} onClick={() => setOrigin(origins[k - 1])} aria-label="Earlier window">
            ←
          </button>
          <span className="body-sm tabular" style={{ padding: "0 8px", minWidth: 220, textAlign: "center" }}>
            Window {k + 1} of {origins.length} · from {dateName(origin)}
          </span>
          <button type="button" className="pill outlined" style={pillStyle(false)} disabled={k >= origins.length - 1} onClick={() => setOrigin(origins[k + 1])} aria-label="Later window">
            →
          </button>
        </div>
        <span className="body-sm tabular secondary">
          This window, all lines: LightGBM MASE {dec(score("lgbm")?.mase)} · naive {dec(score("seasonal_naive")?.mase)}
        </span>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Line" style={{ marginTop: 12 }}>
        {series.map((m) => (
          <button key={m.key} type="button" aria-pressed={m.key === mode} onClick={() => setMode(m.key)} className={`pill ${m.key === mode ? "" : "outlined"}`} style={pillStyle(m.key === mode, true)}>
            {m.label}
          </button>
        ))}
      </div>
      {view && w ? (
        <>
          <p className="body-sm tabular secondary" aria-live="polite" style={{ marginTop: 12, marginBottom: 12 }}>
            {s.label}, {dateName(w.dates[0])} – {dateName(w.dates[w.dates.length - 1])}: WAPE {SHOWN.map((m) => `${LABEL[m]} ${(wape(m) * 100).toFixed(1)}%`).join(" · ")}
          </p>
          <LineChart dates={view.dates} lines={view.lines} split={view.split} holidays={view.hols} marks={view.marks} ariaLabel={`${s.label}: backtest window from ${dateName(origin)}, observed trips against three forecasts`} />
        </>
      ) : (
        <p className="body-sm secondary" style={{ marginTop: 12 }}>
          {s.label} had less than a year of history at this origin, so it was not scored here.
        </p>
      )}
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        {view?.lines.map((l) => (
          <LegendItem key={l.key} style={l.style} label={l.label} />
        ))}
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, border: "1.25px solid var(--color-onyx)" }} /> flagged by Turnstile&rsquo;s outlier rule
        </span>
      </figcaption>
    </figure>
  );
}
