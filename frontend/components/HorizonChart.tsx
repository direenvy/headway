/* MASE by horizon, one line per model. The seasonal naive is flat by
   construction inside a week and jumps at day 8 when it has to reach back two
   weeks; the others should sit below it and rise gently. Monochrome: models are
   told apart by line texture, and the legend repeats the textures. */

import { byHorizon, MODEL_LABELS, MODEL_ORDER, type ModelKey } from "@/lib/data";

const W = 960;
const H = 260;
const PAD = { top: 20, right: 24, bottom: 32, left: 48 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

export const STYLES: Record<ModelKey, { stroke: string; width: number; dash?: string; css: string }> = {
  seasonal_naive: { stroke: "var(--color-ash-mist)", width: 1.5, css: "1.5px solid var(--color-ash-mist)" },
  weekday_mean: { stroke: "var(--color-slate-veil)", width: 1.5, dash: "1.5 3.5", css: "1.5px dotted var(--color-slate-veil)" },
  ets: { stroke: "var(--color-slate-veil)", width: 1.5, dash: "4 3", css: "1.5px dashed var(--color-slate-veil)" },
  lgbm_nohol: { stroke: "var(--color-onyx)", width: 1.5, dash: "4 3", css: "1.5px dashed var(--color-onyx)" },
  lgbm: { stroke: "var(--color-onyx)", width: 2, css: "2px solid var(--color-onyx)" },
};

export function Legend({ models }: { models: ModelKey[] }) {
  return (
    <>
      {models.map((m) => (
        <span key={m} className="flex items-center gap-2">
          <span aria-hidden="true" style={{ width: 18, height: 0, borderTop: STYLES[m].css }} /> {MODEL_LABELS[m]}
        </span>
      ))}
    </>
  );
}

export default function HorizonChart() {
  const hs = Array.from({ length: 14 }, (_, i) => i + 1);
  const table = new Map<string, number>(byHorizon.map((r) => [`${r.model}:${r.h}`, r.mase]));
  const max = Math.max(...byHorizon.map((r) => r.mase));
  const top = Math.ceil(max / 0.25) * 0.25;
  const x = (h: number) => PAD.left + ((h - 1) / 13) * PW;
  const y = (v: number) => PAD.top + (1 - v / top) * PH;
  const ticks = Array.from({ length: top / 0.25 + 1 }, (_, k) => k * 0.25);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="MASE by forecast horizon, one line per model">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 1 ? "var(--color-ash-mist)" : "var(--hairline)"} strokeDasharray={t === 1 ? "2 3" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)" className="tabular">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {hs.map((h) => (
          <text key={h} x={x(h)} y={H - 10} textAnchor="middle" fontSize={11} fill={h === 1 || h === 7 || h === 14 ? "var(--text-secondary)" : "var(--text-muted)"}>
            {h === 1 ? "day 1" : h === 14 ? "day 14" : h}
          </text>
        ))}
        {MODEL_ORDER.map((m) => {
          const d = hs.map((h, i) => `${i === 0 ? "M" : "L"}${x(h).toFixed(1)} ${y(table.get(`${m}:${h}`) ?? 0).toFixed(1)}`).join(" ");
          return <path key={m} d={d} fill="none" stroke={STYLES[m].stroke} strokeWidth={STYLES[m].width} strokeDasharray={STYLES[m].dash} strokeLinejoin="round" />;
        })}
        {MODEL_ORDER.map((m) => (
          <circle key={m} cx={x(14)} cy={y(table.get(`${m}:14`) ?? 0)} r={3} fill={STYLES[m].stroke} />
        ))}
      </svg>
      <figcaption className="body-sm flex flex-wrap items-center gap-x-6 gap-y-1" style={{ marginTop: 12, color: "var(--text-secondary)" }}>
        <Legend models={MODEL_ORDER} />
        <span className="muted">MASE: 1.00 = the in-sample seasonal naive</span>
      </figcaption>
    </figure>
  );
}
