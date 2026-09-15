/* The leaderboard, the per-line table and the worst days. Rank is carried by
   weight and order; the best cell in a row is set at 570, not coloured. */

import { byMode, dateName, dec, leaderboard, MODEL_LABELS, MODEL_ORDER, num, pct, series, signedPct, worstDays, type ModelKey } from "@/lib/data";

const th = "label text-left" as const;
const cell = { padding: "12px 16px 12px 0", borderTop: "1px solid var(--hairline)", verticalAlign: "top" as const };
const hd = { paddingBottom: 10, paddingRight: 16 };
const STATE: Record<string, string> = { KUL: "Kuala Lumpur", SGR: "Selangor", PRK: "Perak", JHR: "Johor", PNG: "Penang", national: "national" };

export function Leaderboard() {
  return (
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
          {leaderboard.map((r, i) => (
            <tr key={r.model} style={{ fontWeight: i === 0 ? 570 : 400 }}>
              <td style={cell}>{r.label}</td>
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
  );
}

const DESCRIBE: Record<ModelKey, string> = {
  seasonal_naive: "Last week's value for the same weekday. The scale every MASE is measured against.",
  weekday_mean: "Mean of the last four same weekdays — the baseline Turnstile's outlier rule uses.",
  ets: "Holt-Winters on the last year: damped trend, weekly seasonality, on log trips.",
  lgbm_nohol: "The same gradient-boosted model with every holiday feature removed.",
  lgbm: "One gradient-boosted model over all lines: 28 lags, same-weekday lags, the horizon, and the state's public-holiday calendar.",
};

export function ByModeTable() {
  const table = new Map<string, number>(byMode.map((r) => [`${r.mode}:${r.model}`, r.mase]));
  return (
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
          {series.map((s) => {
            const vals = MODEL_ORDER.map((m) => table.get(`${s.key}:${m}`) ?? NaN);
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
  );
}

export function WorstDays() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="w-full tabular" style={{ borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr>
            <th className={th} style={{ ...hd, width: "18%" }}>Day</th>
            <th className={th} style={{ ...hd, width: "20%" }}>Line</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>Actual</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>LightGBM</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "10%" }}>Naive</th>
            <th className={th} style={{ ...hd, textAlign: "right", width: "8%" }}>Error</th>
            <th className={th} style={{ ...hd, paddingLeft: 16 }}>Why</th>
          </tr>
        </thead>
        <tbody>
          {worstDays.slice(0, 12).map((w) => (
            <tr key={`${w.mode}-${w.date}`}>
              <td style={{ ...cell, whiteSpace: "nowrap" }}>
                {dateName(w.date)}
                <span className="caption muted" style={{ display: "block", marginTop: 2 }}>
                  day {w.h} from {dateName(w.origin)}
                </span>
              </td>
              <td style={cell}>{w.label}</td>
              <td style={{ ...cell, textAlign: "right" }}>{num(w.actual)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{num(w.yhat)}</td>
              <td style={{ ...cell, textAlign: "right", color: "var(--text-secondary)" }}>{num(w.naive)}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 570 }}>{w.actual === 0 ? "—" : signedPct((w.yhat - w.actual) / w.actual, 0)}</td>
              <td className="body-sm" style={{ ...cell, paddingLeft: 16, color: "var(--text-secondary)" }}>
                {w.holiday ? w.holiday : w.day_type === "holiday-adjacent" ? "eve or day after a holiday" : w.day_type}
                {w.outlier ? " · flagged by Turnstile" : ""}
                {w.actual === 0 ? " · zero reported" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
