"use client";

/* The next fourteen days for one line: eight weeks of observed trips, then the
   LightGBM forecast inside its 80% band, with the seasonal naive alongside so
   the reader can see what the model is adding — or not. */

import { useMemo, useState } from "react";
import { forecast, holidays, recent, series, summary, dateName, num } from "@/lib/data";
import LineChart, { FORECAST, LegendItem, OBSERVED, pillStyle, type Line } from "./LineChart";

export default function ForecastChart() {
  const [mode, setMode] = useState(series[0].key);
  const s = series.find((x) => x.key === mode)!;

  const { dates, lines, band, split, hols } = useMemo(() => {
    const obs = recent.filter((r) => r.mode === mode).sort((a, b) => a.date.localeCompare(b.date));
    const fc = forecast.filter((r) => r.mode === mode);
    const main = fc.filter((r) => r.model === "lgbm").sort((a, b) => a.h - b.h);
    const naive = fc.filter((r) => r.model === "seasonal_naive").sort((a, b) => a.h - b.h);
    const dates = [...obs.map((r) => r.date), ...main.map((r) => r.date)];
    const n = obs.length;
    const pad = (arr: number[], before: number) => [...Array<null>(before).fill(null), ...arr];
    // Join the forecast to the last observed point so the line does not float.
    const lastObs = obs[n - 1]?.trips ?? null;
    const lines: Line[] = [
      { key: "actual", label: "Observed", values: [...obs.map((r) => r.trips), ...Array<null>(main.length).fill(null)], style: OBSERVED },
      { key: "lgbm", label: "LightGBM", values: [...Array<null>(n - 1).fill(null), lastObs, ...main.map((r) => r.yhat)], style: FORECAST.lgbm, dots: true },
      { key: "naive", label: "Seasonal naive", values: [...Array<null>(n - 1).fill(null), lastObs, ...naive.map((r) => r.yhat)], style: FORECAST.seasonal_naive },
    ];
    const band = { lo: pad(main.map((r) => r.lo), n), hi: pad(main.map((r) => r.hi), n) };
    const hols: Record<number, string> = {};
    for (const h of holidays) {
      const i = dates.indexOf(h.date);
      if (i >= 0) hols[i] = h.name;
    }
    return { dates, lines, band, split: n, hols };
  }, [mode]);

  const first = forecast.find((r) => r.mode === mode && r.model === "lgbm" && r.h === 1)!;
  const last = forecast.find((r) => r.mode === mode && r.model === "lgbm" && r.h === summary.horizon)!;
  const total = forecast.filter((r) => r.mode === mode && r.model === "lgbm").reduce((a, r) => a + r.yhat, 0);

  return (
    <figure>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Line">
        {series.map((m) => (
          <button key={m.key} type="button" aria-pressed={m.key === mode} onClick={() => setMode(m.key)} className={`pill ${m.key === mode ? "" : "outlined"}`} style={pillStyle(m.key === mode, true)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="body-sm tabular secondary" aria-live="polite" style={{ marginTop: 12, marginBottom: 12 }}>
        {s.label}: {num(total)} trips forecast over {dateName(first.date)} – {dateName(last.date)} · day 1 {num(first.yhat)} ({num(first.lo)}–{num(first.hi)}) · day {summary.horizon} {num(last.yhat)} ({num(last.lo)}–{num(last.hi)})
      </p>
      <LineChart dates={dates} lines={lines} band={band} split={split} holidays={hols} ariaLabel={`${s.label}: eight weeks of observed daily trips and the fourteen-day forecast`} />
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        {lines.map((l) => (
          <LegendItem key={l.key} style={l.style} label={l.label} />
        ))}
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 18, height: 10, borderRadius: 2, background: "rgba(90,118,159,0.2)" }} /> 80% band, from the backtest&rsquo;s own errors
        </span>
      </figcaption>
    </figure>
  );
}
