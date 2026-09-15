/* WAPE by kind of day for three models: the naive, LightGBM without the
   calendar, LightGBM with it. The gap between the last two is what knowing the
   holidays buys; the gap between all three and the weekday bars is what no
   model knows. Bars are filled Onyx, hatched Onyx and Ash Mist — no hue. */

import { byDayType, byOutlier, MODEL_LABELS, pct, type DayType, type ModelKey } from "@/lib/data";

const W = 960;
const H = 260;
const PAD = { top: 20, right: 16, bottom: 44, left: 48 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

const GROUPS: { key: DayType | "outlier"; label: string; sub: string }[] = [
  { key: "weekday", label: "Weekday", sub: "Mon–Fri, no holiday near" },
  { key: "weekend", label: "Weekend", sub: "Sat–Sun" },
  { key: "holiday-adjacent", label: "Eve or day after", sub: "a public holiday" },
  { key: "holiday", label: "Public holiday", sub: "the mode's own state" },
  { key: "outlier", label: "Outlier day", sub: "flagged by Turnstile's rule" },
];
const MODELS: ModelKey[] = ["seasonal_naive", "lgbm_nohol", "lgbm"];
const FILL: Record<string, string> = { seasonal_naive: "var(--color-ash-mist)", lgbm_nohol: "url(#hatch)", lgbm: "var(--color-onyx)" };

export default function DayTypeChart() {
  const value = (m: ModelKey, g: string) => {
    if (g === "outlier") return byOutlier.find((r) => r.model === m && r.outlier)?.wape ?? 0;
    return byDayType.find((r) => r.model === m && r.day_type === g)?.wape ?? 0;
  };
  const count = (g: string) => (g === "outlier" ? byOutlier.find((r) => r.model === "lgbm" && r.outlier)?.n : byDayType.find((r) => r.model === "lgbm" && r.day_type === g)?.n) ?? 0;
  const max = Math.max(...GROUPS.flatMap((g) => MODELS.map((m) => value(m, g.key))));
  const step = max > 0.6 ? 0.2 : max > 0.3 ? 0.1 : 0.05;
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const group = PW / GROUPS.length;
  const bar = Math.min(28, group * 0.2);
  const cx = (i: number) => PAD.left + group * (i + 0.5);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weighted absolute percentage error by kind of day, three models">
        <defs>
          <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-onyx)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        {GROUPS.map((g, i) => (
          <g key={g.key}>
            {MODELS.map((m, k) => {
              const v = value(m, g.key);
              return (
                <rect key={m} x={cx(i) + (k - 1) * (bar + 4) - bar / 2} y={y(v)} width={bar} height={y(0) - y(v)} fill={FILL[m]} rx={3}>
                  <title>{`${g.label}: ${MODEL_LABELS[m]} ${pct(v)} WAPE over ${count(g.key)} scored days`}</title>
                </rect>
              );
            })}
            <text x={cx(i)} y={H - 24} textAnchor="middle" fontSize={12} fill="var(--color-onyx)" fontWeight={500}>
              {g.label}
            </text>
            <text x={cx(i)} y={H - 9} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
              {g.sub} · {count(g.key)} days
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-ash-mist)" }} /> Seasonal naive
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "repeating-linear-gradient(45deg, var(--color-onyx) 0 1.5px, transparent 1.5px 4px)" }} /> LightGBM, no calendar
        </span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: "var(--color-onyx)" }} /> LightGBM
        </span>
        <span className="muted">WAPE over every scored day of that kind, all lines pooled</span>
      </figcaption>
    </figure>
  );
}
