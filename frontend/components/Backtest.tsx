"use client";

/* The scores section, recomputed on the client from the backtest windows so
   the reader can slice them: any calendar month of the scored year, rail or
   bus. Leaderboard, error by day ahead (hover a day for every model's figure)
   and the per-line table all follow the same filter. The maths is the same as
   headway/metrics.py: MASE per line is MAE over the in-sample naive MAE, the
   overall figure averages the lines, WAPE and bias pool the trips. */

import { useMemo, useState, type MouseEvent } from "react";
import { dec, MODEL_LABELS, MODEL_ORDER, num, pct, series, signedPct, summary, windows, type ModelKey } from "@/lib/data";
import { pillStyle } from "./LineChart";

const STYLES: Record<ModelKey, { stroke: string; width: number; dash?: string; css: string }> = {
  seasonal_naive: { stroke: "var(--color-ash-mist)", width: 1.5, css: "1.5px solid var(--color-ash-mist)" },
  weekday_mean: { stroke: "var(--color-slate-veil)", width: 1.5, dash: "1.5 3.5", css: "1.5px dotted var(--color-slate-veil)" },
  ets: { stroke: "var(--color-slate-veil)", width: 1.5, dash: "4 3", css: "1.5px dashed var(--color-slate-veil)" },
  lgbm_nohol: { stroke: "var(--color-onyx)", width: 1.5, dash: "4 3", css: "1.5px dashed var(--color-onyx)" },
  lgbm: { stroke: "var(--color-onyx)", width: 2, css: "2px solid var(--color-onyx)" },
};
const DESCRIBE: Record<ModelKey, string> = {
  seasonal_naive: "Last week's value for the same weekday. The scale every MASE is measured against.",
  weekday_mean: "Mean of the last four same weekdays — the baseline Turnstile's outlier rule uses.",
  ets: "Holt-Winters on the last year: damped trend, weekly seasonality, on log trips.",
  lgbm_nohol: "The same gradient-boosted model with every holiday feature removed.",
  lgbm: "One gradient-boosted model over all lines: 28 lags, same-weekday lags, the horizon, and the state's public-holiday calendar.",
};
const STATE: Record<string, string> = { KUL: "Kuala Lumpur", SGR: "Selangor", PRK: "Perak", JHR: "Johor", PNG: "Penang", national: "national" };
const H = summary.horizon;

type Acc = { ae: number; err: number; y: number; n: number; aeH: number[]; nH: number[] };
const acc = (): Acc => ({ ae: 0, err: 0, y: 0, n: 0, aeH: Array(H).fill(0), nH: Array(H).fill(0) });

export default function Backtest() {
  const months = useMemo(() => Array.from(new Set(windows.flatMap((w) => w.dates.map((d) => d.slice(0, 7))))).sort(), []);
  const [month, setMonth] = useState<string>("all");
  const [system, setSystem] = useState<"all" | "rail" | "bus">("all");
  const [hover, setHover] = useState<number | null>(null);

  const scaleOf = useMemo(() => new Map(series.map((s) => [s.key, s.scale])), []);
  const systemOf = useMemo(() => new Map(series.map((s) => [s.key, s.system])), []);

  // One accumulator per (mode, model) over the days that pass the filter.
  const { perMode, modesIn, days } = useMemo(() => {
    const perMode = new Map<string, Record<ModelKey, Acc>>();
    let days = 0;
    for (const w of windows) {
      if (system !== "all" && systemOf.get(w.mode) !== system) continue;
      let rec = perMode.get(w.mode);
      if (!rec) {
        rec = Object.fromEntries(MODEL_ORDER.map((m) => [m, acc()])) as Record<ModelKey, Acc>;
        perMode.set(w.mode, rec);
      }
      w.dates.forEach((d, i) => {
        if (month !== "all" && d.slice(0, 7) !== month) return;
        days += 1;
        for (const m of MODEL_ORDER) {
          const e = w.models[m][i] - w.actual[i];
          const a = rec![m];
          a.ae += Math.abs(e);
          a.err += e;
          a.y += w.actual[i];
          a.n += 1;
          a.aeH[i] += Math.abs(e);
          a.nH[i] += 1;
        }
      });
    }
    const modesIn = series.filter((s) => perMode.get(s.key)?.lgbm.n);
    return { perMode, modesIn, days: days / MODEL_ORDER.length };
  }, [month, system, systemOf]);

  const maseOf = (mode: string, m: ModelKey) => {
    const a = perMode.get(mode)?.[m];
    return a && a.n ? a.ae / a.n / (scaleOf.get(mode) ?? 1) : NaN;
  };
  const overall = MODEL_ORDER.map((m) => {
    const ms = modesIn.map((s) => maseOf(s.key, m));
    let ae = 0, err = 0, y = 0;
    for (const s of modesIn) {
      const a = perMode.get(s.key)![m];
      ae += a.ae; err += a.err; y += a.y;
    }
    const byH = Array.from({ length: H }, (_, h) => {
      const vals = modesIn.map((s) => {
        const a = perMode.get(s.key)![m];
        return a.nH[h] ? a.aeH[h] / a.nH[h] / (scaleOf.get(s.key) ?? 1) : NaN;
      }).filter((v) => !Number.isNaN(v));
      return vals.length ? vals.reduce((x, v) => x + v, 0) / vals.length : NaN;
    });
    return { model: m, mase: ms.reduce((x, v) => x + v, 0) / ms.length, wape: y ? ae / y : NaN, bias: y ? err / y : NaN, byH };
  });
  const ranked = [...overall].sort((a, b) => a.mase - b.mase);
  const monthName = (ym: string) => (ym === "all" ? "the whole year" : new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }));
  const monthShort = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

  // --- error by day ahead ------------------------------------------------------
  const W = 960, CH = 260, PAD = { top: 20, right: 24, bottom: 32, left: 48 };
  const PW = W - PAD.left - PAD.right, PH = CH - PAD.top - PAD.bottom;
  const hs = Array.from({ length: H }, (_, i) => i + 1);
  const max = Math.max(...overall.flatMap((o) => o.byH.filter((v) => !Number.isNaN(v))), 1);
  const step = max > 3 ? 1 : max > 1.5 ? 0.5 : 0.25;
  const top = Math.ceil(max / step) * step;
  const x = (h: number) => PAD.left + ((h - 1) / (H - 1)) * PW;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  function onMove(e: MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.min(H, Math.max(1, Math.round(((px - PAD.left) / PW) * (H - 1)) + 1)));
  }
  const cardW = 236, cardH = 26 + 16 * MODEL_ORDER.length;

  const th = "label text-left" as const;
  const cell = { padding: "12px 16px 12px 0", borderTop: "1px solid var(--hairline)", verticalAlign: "top" as const };
  const hd = { paddingBottom: 10, paddingRight: 16 };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 16 }}>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Month">
          <button type="button" aria-pressed={month === "all"} onClick={() => setMonth("all")} className={`pill ${month === "all" ? "" : "outlined"}`} style={pillStyle(month === "all", true)}>
            All 52 weeks
          </button>
          {months.map((ym) => (
            <button key={ym} type="button" aria-pressed={month === ym} onClick={() => setMonth(ym)} className={`pill ${month === ym ? "" : "outlined"}`} style={pillStyle(month === ym, true)}>
              {monthShort(ym)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="System">
          {(["all", "rail", "bus"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={system === k} onClick={() => setSystem(k)} className="pill" style={pillStyle(system === k)}>
              {k === "all" ? "All lines" : k === "rail" ? "Rail" : "Bus"}
            </button>
          ))}
        </div>
      </div>
      <p className="body-sm tabular secondary" aria-live="polite" style={{ marginBottom: 16 }}>
        {monthName(month)} · {modesIn.length} lines · {num(days)} scored days per model
      </p>

      <div className="card" style={{ padding: "var(--card-padding)" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full tabular" style={{ borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th className={th} style={{ ...hd, width: "22%" }}>Model</th>
                <th className={th} style={{ ...hd, textAlign: "right", width: "9%" }}>MASE</th>
                <th className={th} style={{ ...hd, textAlign: "right", width: "9%" }}>WAPE</th>
                <th className={th} style={{ ...hd, textAlign: "right", width: "9%" }}>Bias</th>
                <th className={th} style={{ ...hd, paddingLeft: 16 }}>What it is</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.model} style={{ fontWeight: i === 0 ? 570 : 400 }}>
                  <td style={cell}>{MODEL_LABELS[r.model]}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{dec(r.mase)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{pct(r.wape)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{signedPct(r.bias)}</td>
                  <td className="body-sm" style={{ ...cell, paddingLeft: 16, color: "var(--text-secondary)", fontWeight: 400, maxWidth: 480 }}>
                    {DESCRIBE[r.model]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
        Error by day ahead
      </h3>
      <div className="card" style={{ padding: "var(--card-padding)" }}>
        <figure>
          <svg viewBox={`0 0 ${W} ${CH}`} className="w-full" role="img" aria-label={`MASE by forecast horizon, one line per model, ${monthName(month)}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 1 ? "var(--color-ash-mist)" : "var(--hairline)"} strokeDasharray={t === 1 ? "2 3" : undefined} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            {hs.map((h) => (
              <text key={h} x={x(h)} y={CH - 10} textAnchor="middle" fontSize={11} fill={h === 1 || h === 7 || h === H || h === hover ? "var(--color-onyx)" : "var(--text-muted)"} fontWeight={h === hover ? 500 : 400}>
                {h === 1 ? "day 1" : h === H ? `day ${H}` : h}
              </text>
            ))}
            {overall.map((o) => {
              const d = hs.map((h, i) => `${i === 0 ? "M" : "L"}${x(h).toFixed(1)} ${y(o.byH[i]).toFixed(1)}`).join(" ");
              const st = STYLES[o.model];
              return <path key={o.model} d={d} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinejoin="round" style={{ transition: "d 400ms ease" }} />;
            })}
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PH} stroke="var(--color-ash-mist)" strokeDasharray="2 3" />
                {overall.map((o) => (
                  <circle key={o.model} cx={x(hover)} cy={y(o.byH[hover - 1])} r={3.5} fill="var(--color-parchment-canvas)" stroke={STYLES[o.model].stroke} strokeWidth={1.5} />
                ))}
                <g transform={`translate(${x(hover) > W * 0.6 ? x(hover) - cardW - 12 : x(hover) + 12}, ${PAD.top + 4})`}>
                  <rect width={cardW} height={cardH} rx={8} fill="var(--color-parchment-canvas)" stroke="var(--hairline)" />
                  <text x={12} y={18} fontSize={11} fill="var(--text-secondary)">
                    Day {hover} ahead · MASE, {monthName(month)}
                  </text>
                  {[...overall]
                    .sort((a, b) => a.byH[hover - 1] - b.byH[hover - 1])
                    .map((o, k) => (
                      <text key={o.model} x={12} y={34 + 16 * k} fontSize={12} fill={o.model === "seasonal_naive" ? "var(--text-secondary)" : STYLES[o.model].stroke} fontWeight={k === 0 ? 570 : 400} className="tabular">
                        {MODEL_LABELS[o.model]} {dec(o.byH[hover - 1])}
                      </text>
                    ))}
                </g>
              </g>
            )}
          </svg>
          <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
            {MODEL_ORDER.map((m) => (
              <span key={m} className="flex items-center gap-2">
                <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: STYLES[m].css }} /> {MODEL_LABELS[m]}
              </span>
            ))}
            <span className="muted">MASE: 1.00 = the in-sample seasonal naive · hover a day</span>
          </figcaption>
        </figure>
      </div>

      <h3 className="heading-sm" style={{ marginTop: 48, marginBottom: 16 }}>
        Every line
      </h3>
      <p className="body-sm secondary" style={{ marginBottom: 16, maxWidth: 680 }}>
        MASE per line and model for {monthName(month)}; the best in each row is set heavier. The last column is the naive&rsquo;s own daily error, the scale the row is measured in.
      </p>
      <div className="card" style={{ padding: "var(--card-padding)" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="w-full tabular" style={{ borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                <th className={th} style={{ ...hd, width: "25%" }}>Line</th>
                {MODEL_ORDER.map((m) => (
                  <th key={m} className={th} style={{ ...hd, textAlign: "right", width: "12.5%" }}>
                    {MODEL_LABELS[m]}
                  </th>
                ))}
                <th className={th} style={{ ...hd, textAlign: "right", width: "12.5%" }}>Naive MAE</th>
              </tr>
            </thead>
            <tbody>
              {modesIn.map((s) => {
                const vals = MODEL_ORDER.map((m) => maseOf(s.key, m));
                const best = Math.min(...vals);
                return (
                  <tr key={s.key}>
                    <td style={cell}>
                      {s.label}
                      <span className="caption muted" style={{ display: "block", marginTop: 2 }}>
                        {STATE[s.holidays] ?? s.holidays} holidays · {num(s.last_28d_avg)} a day
                      </span>
                    </td>
                    {vals.map((v, i) => (
                      <td key={MODEL_ORDER[i]} style={{ ...cell, textAlign: "right", fontWeight: v === best ? 570 : 400, color: v > 1 ? "var(--text-secondary)" : "var(--text-primary)" }}>
                        {dec(v)}
                      </td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", color: "var(--text-secondary)" }}>{num(s.scale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
